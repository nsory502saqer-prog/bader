'use server';

import { revalidatePath } from 'next/cache';
import { DisbursementStatus, RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { storeFile } from '@/lib/storage';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

const deliverSchema = z.object({
  orderId: z.string().uuid(),
  receivedByName: z
    .string()
    .trim()
    .min(3, 'اكتب اسم المستلم.')
    .max(255),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
  /**
   * التوقيع كـdata URL من لوحة التوقيع.
   *
   * الحد الأعلى 600KB: توقيع بالإصبع على قماش 140px لا يتجاوز عشرات
   * الكيلوبايتات، وأي أكبر من ذلك ليس توقيعًا.
   */
  signature: z
    .string()
    .trim()
    .max(600_000)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || v.startsWith('data:image/png;base64,'), {
      message: 'صيغة التوقيع غير صالحة.',
    }),
});

/**
 * تسليم أمر الصرف للمستفيد أو من ينوب عنه.
 *
 * التسليم ينقل الطلب إلى `delivered` وهي حالة نهائية، ويكتب قيدًا في سجل
 * الحالات باسم المستلم — فيبقى «من استلم» موثَّقًا لا شفويًا.
 *
 * إصدار الأمر نفسه لا يقع هنا بل داخل آلة الحالات
 * (`src/server/stock-core.ts`)، حتى لا يوجد مسار يخصم المخزون دون المرور بها.
 */
export async function deliverOrder(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('disbursement:deliver');

    const parsed = deliverSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { orderId, receivedByName, note, signature } = parsed.data;

    const order = await db.disbursementOrder.findFirst({
      where: { id: orderId, ...notDeleted },
      select: { id: true, orderNo: true, status: true, requestId: true },
    });
    if (!order) return { ok: false, error: 'أمر الصرف غير موجود.' };
    if (order.status !== DisbursementStatus.issued) {
      return { ok: false, error: 'أمر الصرف مسلَّم أو ملغي أصلًا.' };
    }

    // التوقيع يُخزَّن كملف مثل أي مرفق، لا كنص ضخم داخل صف قاعدة البيانات.
    // يُكتب قبل المعاملة: ملف يتيم عند فشلها أهون من معاملة تنتظر قرصًا.
    let signaturePath: string | null = null;
    if (signature) {
      const base64 = signature.slice('data:image/png;base64,'.length);
      const bytes = Buffer.from(base64, 'base64');
      const stored = await storeFile(
        new File([new Uint8Array(bytes)], 'signature.png', { type: 'image/png' }),
        `signatures/${order.orderNo}`,
      );
      signaturePath = stored.filePath;
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.disbursementOrder.update({
        where: { id: orderId },
        data: {
          status: DisbursementStatus.delivered,
          deliveredAt: now,
          receivedByName,
          signaturePath,
        },
      });

      const request = await tx.request.findUnique({
        where: { id: order.requestId },
        select: { status: true },
      });

      if (request?.status === RequestStatus.order_issued) {
        await tx.request.update({
          where: { id: order.requestId },
          data: { status: RequestStatus.delivered, closedAt: now },
        });

        await tx.statusHistory.create({
          data: {
            requestId: order.requestId,
            fromStatus: RequestStatus.order_issued,
            toStatus: RequestStatus.delivered,
            userId: user.id,
            changedAt: now,
            note: note ?? `تسلّمها ${receivedByName}`,
          },
        });
      }
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'DisbursementOrder',
      modelId: orderId,
      oldValues: { status: DisbursementStatus.issued },
      newValues: { status: DisbursementStatus.delivered, receivedByName, signed: Boolean(signaturePath) },
    });

    revalidatePath('/disbursements');
    revalidatePath(`/disbursements/${orderId}`);
    revalidatePath(`/requests/${order.requestId}`);
    revalidatePath('/my-tasks');
    revalidatePath('/dashboard');

    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

