'use server';

import { revalidatePath } from 'next/cache';
import { DisbursementStatus, RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
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
    const { orderId, receivedByName, note } = parsed.data;

    const order = await db.disbursementOrder.findFirst({
      where: { id: orderId, ...notDeleted },
      select: { id: true, orderNo: true, status: true, requestId: true },
    });
    if (!order) return { ok: false, error: 'أمر الصرف غير موجود.' };
    if (order.status !== DisbursementStatus.issued) {
      return { ok: false, error: 'أمر الصرف مسلَّم أو ملغي أصلًا.' };
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.disbursementOrder.update({
        where: { id: orderId },
        data: {
          status: DisbursementStatus.delivered,
          deliveredAt: now,
          receivedByName,
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
      newValues: { status: DisbursementStatus.delivered, receivedByName },
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

