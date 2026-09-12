'use server';

import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { nationalIdSchema } from '@/lib/validation/beneficiary';
import { nextRequestNumber } from '@/lib/request-number';
import { enqueueDirect, enqueueStatusNotification, scheduleDrain } from '@/server/notifications/outbox';
import { createPortalSession, destroyPortalSession, getPortalUser } from '@/server/portal/session';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * بوابة المستفيد.
 *
 * الخطر هنا مختلف عن باقي النظام: الواجهة عامة، ومن يطرق الباب مجهول. لذلك:
 *   - **لا كشف عن وجود سجل.** رقم هوية غير مسجّل يتلقى نفس الرد الذي يتلقاه
 *     المسجّل، فلا تُستعمل البوابة لمعرفة من هو مستفيد من الجمعية.
 *   - **الرمز مجزَّأ لا مخزَّن.** وخمس محاولات ثم يُقفل.
 *   - **تحديد معدّل.** ثلاثة رموز لكل رقم في الساعة، فلا تُستعمل الجمعية
 *     مرسالًا مجانيًا لإزعاج رقم.
 *   - **التقديم لا يُنشئ مستفيدًا.** من ليس مسجّلًا يراجع الجمعية؛ التسجيل
 *     الذاتي يفتح باب هويات وهمية.
 */

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 3;

/** ردّ موحّد لكل طلبات الرمز — لا يفرّق بين مسجّل وغير مسجّل. */
const NEUTRAL_SENT =
  'إن كان رقم الهوية مسجّلًا لدينا، فقد أُرسل رمز الدخول إلى الجوال المرتبط به.';

const requestOtpSchema = z.object({ nationalId: nationalIdSchema });

const verifyOtpSchema = z.object({
  nationalId: nationalIdSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'الرمز ستة أرقام.'),
});

/** يُخفي الجوال في الرسالة: 05XXXXXXXX ← 05••••567 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '••••';
  return `${phone.slice(0, 2)}••••${phone.slice(-3)}`;
}

export async function requestPortalOtp(
  input: unknown,
): Promise<ActionResult<{ message: string; hint: string | null }>> {
  try {
    const parsed = requestOtpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'رقم الهوية غير صالح.' };
    }
    const nationalId = parsed.data.nationalId;

    const beneficiary = await db.beneficiary.findFirst({
      where: { nationalId, ...notDeleted },
      select: { id: true, fullName: true, phone: true },
    });

    // غير مسجّل أو بلا جوال: نفس الرد، ولا رسالة تُرسل.
    if (!beneficiary?.phone) {
      return { ok: true, data: { message: NEUTRAL_SENT, hint: null } };
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db.otpCode.count({
      where: { phone: beneficiary.phone, createdAt: { gte: hourAgo } },
    });
    if (recent >= OTP_MAX_PER_HOUR) {
      return {
        ok: false,
        error: 'طلبت الرمز مرات كثيرة. انتظر ساعة ثم حاول، أو راجع الجمعية.',
      };
    }

    // رمز من ست خانات بمولّد تشفيري لا Math.random.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await db.otpCode.create({
      data: {
        phone: beneficiary.phone,
        codeHash: await hash(code, 10),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });

    await enqueueDirect({
      template: 'otp',
      toPhone: beneficiary.phone,
      beneficiaryId: beneficiary.id,
      context: { beneficiaryName: beneficiary.fullName, code },
    });
    scheduleDrain();

    return {
      ok: true,
      data: { message: NEUTRAL_SENT, hint: maskPhone(beneficiary.phone) },
    };
  } catch {
    return { ok: false, error: 'تعذّر إرسال الرمز. حاول بعد قليل.' };
  }
}

export async function verifyPortalOtp(input: unknown): Promise<ActionResult> {
  try {
    const parsed = verifyOtpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { nationalId, code } = parsed.data;

    const beneficiary = await db.beneficiary.findFirst({
      where: { nationalId, ...notDeleted },
      select: { id: true, phone: true },
    });
    if (!beneficiary?.phone) {
      return { ok: false, error: 'رمز غير صحيح أو منتهي.' };
    }

    const record = await db.otpCode.findFirst({
      where: {
        phone: beneficiary.phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });
    if (!record) return { ok: false, error: 'رمز غير صحيح أو منتهي.' };

    await db.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });

    const valid = await compare(code, record.codeHash);
    if (!valid) return { ok: false, error: 'رمز غير صحيح أو منتهي.' };

    // الرمز يُستهلك فور نجاحه فلا يُعاد استعماله.
    await db.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

    await createPortalSession(beneficiary.id);

    await recordAudit({
      userId: null,
      action: 'login',
      modelType: 'PortalSession',
      modelId: beneficiary.id,
      newValues: { via: 'otp' },
    });

    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'تعذّر التحقق. حاول بعد قليل.' };
  }
}

export async function portalLogout(): Promise<void> {
  await destroyPortalSession();
}

// ───────────────────────────── التقديم الذاتي ─────────────────────────────

const portalRequestSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        size: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((v) => v || null),
        quantity: z.coerce.number().int().min(1).max(20),
      }),
    )
    .min(1, 'اختر صنفًا واحدًا على الأقل.')
    .max(10, 'لا يمكن طلب أكثر من عشرة أصناف في الطلب الواحد.'),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

/** حد الطلبات المفتوحة للمستفيد الواحد عبر البوابة. */
const MAX_OPEN_PORTAL_REQUESTS = 2;

export async function submitPortalRequest(
  input: unknown,
): Promise<ActionResult<{ requestNo: string }>> {
  try {
    const user = await getPortalUser();
    if (!user) return { ok: false, error: 'انتهت الجلسة. سجّل الدخول من جديد.' };

    const parsed = portalRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const data = parsed.data;

    // سدّ أمام الإغراق: طلبان مفتوحان يكفيان، والباقي يراجع الجمعية.
    const open = await db.request.count({
      where: { beneficiaryId: user.id, ...notDeleted, closedAt: null },
    });
    if (open >= MAX_OPEN_PORTAL_REQUESTS) {
      return {
        ok: false,
        error: `لديك ${open} طلبات لم تُغلق بعد. راجع الجمعية قبل تقديم طلب جديد.`,
      };
    }

    const itemIds = [...new Set(data.items.map((i) => i.itemId))];
    const catalogItems = await db.item.findMany({
      where: { id: { in: itemIds }, ...notDeleted, isActive: true },
      select: { id: true, name: true, hasSizes: true },
    });
    const byId = new Map(catalogItems.map((i) => [i.id, i]));

    for (const line of data.items) {
      const item = byId.get(line.itemId);
      if (!item) return { ok: false, error: 'أحد الأصناف المختارة غير متاح.' };
      if (item.hasSizes && !line.size) {
        return { ok: false, error: `الصنف «${item.name}» يحتاج تحديد المقاس.` };
      }
    }

    // الطلب يُنسب لحساب النظام لا لموظف: لم ينشئه أحد من الجمعية.
    const systemUser = await db.user.findFirst({
      where: { email: 'migration@bader.org.sa' },
      select: { id: true },
    });
    const createdById =
      systemUser?.id ??
      (
        await db.user.findFirstOrThrow({
          where: { role: 'admin', ...notDeleted },
          select: { id: true },
        })
      ).id;

    const now = new Date();

    const created = await db.$transaction(async (tx) => {
      const requestNo = await nextRequestNumber(tx, now);

      const request = await tx.request.create({
        data: {
          requestNo,
          beneficiaryId: user.id,
          status: RequestStatus.submitted,
          source: 'portal',
          notes: data.notes,
          createdById,
          submittedAt: now,
          items: {
            create: data.items.map((line) => ({
              itemId: line.itemId,
              size: byId.get(line.itemId)?.hasSizes ? line.size : null,
              quantity: line.quantity,
            })),
          },
        },
        select: { id: true, requestNo: true },
      });

      await tx.statusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: RequestStatus.submitted,
          userId: createdById,
          changedAt: now,
          note: 'تقديم ذاتي عبر بوابة المستفيد',
        },
      });

      await enqueueStatusNotification({
        tx,
        requestId: request.id,
        status: RequestStatus.submitted,
      });

      return request;
    });

    scheduleDrain();

    await recordAudit({
      userId: null,
      action: 'create',
      modelType: 'Request',
      modelId: created.id,
      newValues: { requestNo: created.requestNo, source: 'portal', items: data.items.length },
    });

    revalidatePath('/portal/requests');
    revalidatePath('/requests');
    revalidatePath('/my-tasks');

    return { ok: true, data: { requestNo: created.requestNo } };
  } catch {
    return { ok: false, error: 'تعذّر تقديم الطلب. حاول بعد قليل.' };
  }
}
