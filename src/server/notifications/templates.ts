import { RequestStatus } from '@prisma/client';

/**
 * قوالب الرسائل.
 *
 * ثلاث قواعد تحكمها:
 *   1. **لا تفاصيل صحية في رسالة.** الرسالة تذهب لهاتف قد يقرأه غير صاحبه،
 *      فلا تذكر جهازًا ولا حالة مرضية — فقط رقم الطلب وأين وصل.
 *   2. **لا رسالة عن كل تغيير.** الموظف ينقل الطلب بين مراحل داخلية كثيرة،
 *      وإغراق المستفيد برسائل يجعله يتجاهلها. تُرسل عند المحطات التي تعنيه.
 *   3. **كل رسالة تقول ماذا بعد.** إما إجراء مطلوب منه، أو أن ينتظر.
 */

export type TemplateKey =
  | 'request_submitted'
  | 'request_approved'
  | 'request_rejected'
  | 'request_ready'
  | 'order_issued'
  | 'request_delivered'
  | 'request_on_hold'
  | 'otp';

export type TemplateContext = {
  orgName: string;
  beneficiaryName: string;
  requestNo: string;
  reason?: string | null;
  code?: string;
};

/** أول اسم فقط — الرسالة تخاطب لا تُعرّف. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

const TEMPLATES: Record<TemplateKey, (ctx: TemplateContext) => string> = {
  request_submitted: (c) =>
    `${c.orgName}\n` +
    `أهلًا ${firstName(c.beneficiaryName)}، استلمنا طلبك رقم ${c.requestNo}.\n` +
    `سيصلك إشعار عند تغيّر حالته. لا حاجة لمراجعتنا الآن.`,

  request_approved: (c) =>
    `${c.orgName}\n` +
    `طلبك رقم ${c.requestNo} اعتُمد، وجارٍ تجهيزه.\n` +
    `سنبلغك عندما يصبح جاهزًا للاستلام.`,

  request_rejected: (c) =>
    `${c.orgName}\n` +
    `نعتذر، طلبك رقم ${c.requestNo} لم يُعتمد.\n` +
    (c.reason ? `السبب: ${c.reason}\n` : '') +
    `للاستفسار أو التظلّم راجع الجمعية.`,

  request_ready: (c) =>
    `${c.orgName}\n` +
    `طلبك رقم ${c.requestNo} جاهز.\n` +
    `سنتواصل معك لترتيب الاستلام.`,

  order_issued: (c) =>
    `${c.orgName}\n` +
    `صدر أمر الصرف لطلبك رقم ${c.requestNo}.\n` +
    `أحضر أصل الهوية عند الاستلام.`,

  request_delivered: (c) =>
    `${c.orgName}\n` +
    `تم تسليم طلبك رقم ${c.requestNo}. نسأل الله لك الشفاء والعافية.`,

  request_on_hold: (c) =>
    `${c.orgName}\n` +
    `طلبك رقم ${c.requestNo} مؤجَّل مؤقتًا.\n` +
    (c.reason ? `السبب: ${c.reason}\n` : '') +
    `سنبلغك عند استئنافه.`,

  otp: (c) =>
    `${c.orgName}\n` +
    `رمز الدخول لبوابة المستفيدين: ${c.code}\n` +
    `صالح لخمس دقائق. لا تشاركه مع أحد، ولن يطلبه منك موظف أبدًا.`,
};

export function renderTemplate(key: TemplateKey, ctx: TemplateContext): string {
  return TEMPLATES[key](ctx);
}

/**
 * المحطات التي تستحق رسالة.
 *
 * المراحل الداخلية (`screening` · `warehouse` · `purchasing`) لا رسالة لها:
 * لا تعني المستفيد شيئًا، وإرسالها يدرّبه على تجاهل رسائلنا.
 */
export const STATUS_TEMPLATES: Partial<Record<RequestStatus, TemplateKey>> = {
  [RequestStatus.submitted]: 'request_submitted',
  [RequestStatus.approved]: 'request_approved',
  [RequestStatus.rejected]: 'request_rejected',
  [RequestStatus.ready_to_issue]: 'request_ready',
  [RequestStatus.order_issued]: 'order_issued',
  [RequestStatus.delivered]: 'request_delivered',
  [RequestStatus.on_hold]: 'request_on_hold',
};

export function templateForStatus(status: RequestStatus): TemplateKey | null {
  return STATUS_TEMPLATES[status] ?? null;
}
