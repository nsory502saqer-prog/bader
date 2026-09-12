import { NotificationStatus, type Prisma, type RequestStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { defaultChannel, getDriver, notificationsEnabled } from './drivers';
import { renderTemplate, templateForStatus, type TemplateKey } from './templates';

/**
 * صندوق الرسائل الصادرة.
 *
 * الرسالة تُكتب في قاعدة البيانات **داخل نفس معاملة تغيير الحالة**، ثم تُرسل
 * بعدها. هذا الترتيب مقصود ويحلّ مشكلتين معًا:
 *   - لا تُرسل رسالة عن تغيير حالة تراجعت معاملته وفشلت.
 *   - لا تضيع رسالة لأن المزوّد أو Redis كان متوقفًا؛ تبقى `queued` ويلتقطها
 *     العامل لاحقًا.
 *
 * السجل نفسه دليل تشغيلي: يُعرف منه ما أُرسل ولمن ومتى، وهو ما يحتاجه من
 * يحقق في شكوى «لم يصلني إشعار».
 */

const MAX_ATTEMPTS = 5;

/** اسم الجمعية من الإعدادات — يتصدّر كل رسالة. */
async function orgName(tx: Prisma.TransactionClient | typeof db): Promise<string> {
  const row = await tx.setting.findUnique({ where: { key: 'org.name' }, select: { value: true } });
  return typeof row?.value === 'string' ? row.value : 'جمعية بادر للأجهزة الطبية';
}

/**
 * يضع رسالة تغيير حالة في الصندوق.
 * تُستدعى داخل معاملة `transitionRequest`، فلا تُرسل شيئًا بنفسها.
 */
export async function enqueueStatusNotification(args: {
  tx: Prisma.TransactionClient;
  requestId: string;
  status: RequestStatus;
  reason?: string | null;
}): Promise<void> {
  if (!notificationsEnabled()) return;

  const template = templateForStatus(args.status);
  if (!template) return;

  const request = await args.tx.request.findUnique({
    where: { id: args.requestId },
    select: {
      requestNo: true,
      beneficiaryId: true,
      beneficiary: { select: { fullName: true, phone: true } },
    },
  });
  if (!request) return;

  const body = renderTemplate(template, {
    orgName: await orgName(args.tx),
    beneficiaryName: request.beneficiary.fullName,
    requestNo: request.requestNo,
    reason: args.reason ?? null,
  });

  await args.tx.notification.create({
    data: {
      channel: defaultChannel(),
      // بلا جوال لا إرسال — تُسجَّل «متخطّاة» لا «فاشلة»، فالفرق يهمّ في التقارير.
      status: request.beneficiary.phone ? NotificationStatus.queued : NotificationStatus.skipped,
      toPhone: request.beneficiary.phone,
      body,
      template,
      requestId: args.requestId,
      beneficiaryId: request.beneficiaryId,
      lastError: request.beneficiary.phone ? null : 'لا يوجد رقم جوال مسجَّل للمستفيد.',
    },
  });
}

/** يضع رسالة مستقلة (رمز تحقق مثلًا) خارج سياق طلب. */
export async function enqueueDirect(args: {
  template: TemplateKey;
  toPhone: string;
  beneficiaryId?: string | null;
  context: { beneficiaryName?: string; requestNo?: string; code?: string; reason?: string | null };
}): Promise<string> {
  const body = renderTemplate(args.template, {
    orgName: await orgName(db),
    beneficiaryName: args.context.beneficiaryName ?? '',
    requestNo: args.context.requestNo ?? '',
    code: args.context.code ?? '',
    reason: args.context.reason ?? null,
  });

  const created = await db.notification.create({
    data: {
      channel: defaultChannel(),
      status: NotificationStatus.queued,
      toPhone: args.toPhone,
      body,
      template: args.template,
      beneficiaryId: args.beneficiaryId ?? null,
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * يفرغ الصندوق: يلتقط الرسائل المنتظرة ويرسلها.
 *
 * يُستدعى من مسار الطابور (BullMQ حين يتوفر Redis)، ومن نداء مباشر بعد
 * المعاملة حين لا يتوفر — فالنظام يعمل في الحالتين، والفرق في التأخير فقط.
 *
 * الحجز بـ`updateMany` على الحالة يمنع عاملين من إرسال نفس الرسالة مرتين.
 */
export async function drainOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  if (!notificationsEnabled()) return { sent: 0, failed: 0 };

  const driver = getDriver();
  const pending = await db.notification.findMany({
    where: { status: NotificationStatus.queued, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, channel: true, toPhone: true, body: true, attempts: true },
  });

  let sent = 0;
  let failed = 0;

  for (const message of pending) {
    // حجز الرسالة: من يفز بالتحديث هو من يرسلها.
    const claimed = await db.notification.updateMany({
      where: { id: message.id, status: NotificationStatus.queued },
      data: { status: NotificationStatus.sending, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    if (!message.toPhone) {
      await db.notification.update({
        where: { id: message.id },
        data: { status: NotificationStatus.skipped, lastError: 'لا يوجد رقم جوال.' },
      });
      continue;
    }

    const result = await driver.send({
      channel: message.channel,
      to: message.toPhone,
      body: message.body,
    });

    if (result.ok) {
      await db.notification.update({
        where: { id: message.id },
        data: {
          status: NotificationStatus.sent,
          sentAt: new Date(),
          providerRef: result.providerRef,
          lastError: null,
        },
      });
      sent += 1;
    } else {
      const attemptsSoFar = message.attempts + 1;
      const giveUp = !result.retryable || attemptsSoFar >= MAX_ATTEMPTS;

      await db.notification.update({
        where: { id: message.id },
        data: {
          // القابل لإعادة المحاولة يعود للطابور، وغيره يُغلق بخطئه مكتوبًا.
          status: giveUp ? NotificationStatus.failed : NotificationStatus.queued,
          lastError: result.error,
        },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * يُشغّل التفريغ دون تعطيل استجابة المستخدم.
 * تغيير الحالة يجب ألّا ينتظر مزوّد الرسائل؛ فشل الإرسال يبقى في الصندوق.
 */
export function scheduleDrain(): void {
  if (!notificationsEnabled()) return;
  void drainOutbox().catch((error) => {
    console.error('تعذّر تفريغ صندوق الإشعارات:', error);
  });
}
