import { RequestStatus, Role } from '@prisma/client';

/**
 * آلة حالات الطلب.
 *
 * هذا الملف هو المرجع الوحيد لما هو مسموح. أي انتقال غير مذكور هنا مرفوض على
 * الخادم، ولا يكفي إخفاء الزر في الواجهة.
 */

/** الحالات النهائية: لا انتقال بعدها إطلاقًا */
export const TERMINAL_STATUSES = [
  RequestStatus.rejected,
  RequestStatus.delivered,
  RequestStatus.cancelled,
] as const satisfies readonly RequestStatus[];

/** المراحل التشغيلية التي يمكن التأجيل منها والرجوع إليها */
export const ACTIVE_STAGES = [
  RequestStatus.submitted,
  RequestStatus.screening,
  RequestStatus.approved,
  RequestStatus.warehouse,
  RequestStatus.purchasing,
  RequestStatus.ready_to_issue,
] as const satisfies readonly RequestStatus[];

export type Transition = {
  to: RequestStatus;
  /** الأدوار المخوّلة بتنفيذ هذا الانتقال */
  roles: readonly Role[];
  /** هل يلزم سبب نصي مكتوب؟ */
  requiresReason?: boolean;
};

/**
 * المسار الأمامي حرفيًا كما في مواصفة سير العمل، مضافًا إليه:
 * - `on_hold` من أي مرحلة تشغيلية (التأجيل قرار إداري قد يقع في أي نقطة).
 * - `cancelled` من أي مرحلة قبل إصدار أمر الصرف.
 * - العودة من `on_hold` إلى أي مرحلة تشغيلية سابقة.
 */
const FORWARD: Record<RequestStatus, readonly Transition[]> = {
  [RequestStatus.draft]: [
    { to: RequestStatus.submitted, roles: [Role.reception, Role.admin] },
  ],
  [RequestStatus.submitted]: [
    { to: RequestStatus.screening, roles: [Role.screener, Role.admin] },
  ],
  [RequestStatus.screening]: [
    { to: RequestStatus.approved, roles: [Role.screener, Role.admin] },
    { to: RequestStatus.rejected, roles: [Role.screener, Role.admin], requiresReason: true },
  ],
  [RequestStatus.approved]: [
    { to: RequestStatus.warehouse, roles: [Role.warehouse, Role.screener, Role.admin] },
    { to: RequestStatus.purchasing, roles: [Role.purchasing, Role.admin] },
    { to: RequestStatus.ready_to_issue, roles: [Role.warehouse, Role.admin] },
  ],
  [RequestStatus.warehouse]: [
    { to: RequestStatus.purchasing, roles: [Role.warehouse, Role.purchasing, Role.admin] },
    { to: RequestStatus.ready_to_issue, roles: [Role.warehouse, Role.admin] },
  ],
  [RequestStatus.purchasing]: [
    { to: RequestStatus.warehouse, roles: [Role.purchasing, Role.warehouse, Role.admin] },
  ],
  [RequestStatus.ready_to_issue]: [
    { to: RequestStatus.order_issued, roles: [Role.finance, Role.admin] },
  ],
  [RequestStatus.order_issued]: [
    { to: RequestStatus.delivered, roles: [Role.finance, Role.warehouse, Role.admin] },
  ],
  [RequestStatus.on_hold]: [],
  [RequestStatus.rejected]: [],
  [RequestStatus.delivered]: [],
  [RequestStatus.cancelled]: [],
};

const HOLD_ROLES = [Role.screener, Role.admin] as const;
const CANCEL_ROLES = [Role.reception, Role.screener, Role.admin] as const;

function buildTransitions(): Record<RequestStatus, readonly Transition[]> {
  const table = {} as Record<RequestStatus, Transition[]>;

  for (const status of Object.values(RequestStatus)) {
    table[status] = [...FORWARD[status]];
  }

  // التأجيل والإلغاء متاحان من كل مرحلة تشغيلية، وكلاهما يستوجب سببًا مكتوبًا.
  for (const stage of ACTIVE_STAGES) {
    table[stage].push({ to: RequestStatus.on_hold, roles: HOLD_ROLES, requiresReason: true });
    table[stage].push({ to: RequestStatus.cancelled, roles: CANCEL_ROLES, requiresReason: true });
  }
  table[RequestStatus.draft].push({
    to: RequestStatus.cancelled,
    roles: CANCEL_ROLES,
    requiresReason: true,
  });

  // العودة من التأجيل إلى أي مرحلة تشغيلية سابقة، مع تسجيل سبب الاستئناف.
  for (const stage of ACTIVE_STAGES) {
    table[RequestStatus.on_hold].push({
      to: stage,
      roles: [Role.screener, Role.admin],
      requiresReason: true,
    });
  }
  table[RequestStatus.on_hold].push({
    to: RequestStatus.cancelled,
    roles: CANCEL_ROLES,
    requiresReason: true,
  });

  return table;
}

export const TRANSITIONS: Record<RequestStatus, readonly Transition[]> = buildTransitions();

export function isTerminal(status: RequestStatus): boolean {
  return (TERMINAL_STATUSES as readonly RequestStatus[]).includes(status);
}

/** كل الانتقالات الممكنة من حالة، بغضّ النظر عن الدور */
export function transitionsFrom(status: RequestStatus): readonly Transition[] {
  return TRANSITIONS[status];
}

/** الانتقالات التي يملك هذا الدور صلاحية تنفيذها — أساس إظهار الأزرار */
export function allowedTransitions(status: RequestStatus, role: Role): Transition[] {
  return TRANSITIONS[status].filter((t) => t.roles.includes(role));
}

export function findTransition(
  from: RequestStatus,
  to: RequestStatus,
): Transition | undefined {
  return TRANSITIONS[from].find((t) => t.to === to);
}

export type TransitionCheck =
  | { ok: true; transition: Transition }
  | { ok: false; error: string };

/**
 * البوابة الوحيدة لأي تغيير حالة. تُستدعى في الخادم قبل الكتابة،
 * وتتحقق من: صلاحية المسار، وصلاحية الدور، ووجود السبب متى لزم.
 */
export function checkTransition(args: {
  from: RequestStatus;
  to: RequestStatus;
  role: Role;
  reason?: string | null;
}): TransitionCheck {
  const { from, to, role, reason } = args;

  if (from === to) {
    return { ok: false, error: 'الطلب في هذه الحالة أصلًا.' };
  }

  if (isTerminal(from)) {
    return {
      ok: false,
      error: `لا يمكن تغيير حالة طلب وصل إلى «${STATUS_LABELS[from]}» — هذه حالة نهائية.`,
    };
  }

  const transition = findTransition(from, to);
  if (!transition) {
    return {
      ok: false,
      error: `الانتقال من «${STATUS_LABELS[from]}» إلى «${STATUS_LABELS[to]}» غير مسموح.`,
    };
  }

  if (!transition.roles.includes(role)) {
    return {
      ok: false,
      error: `دورك (${ROLE_LABELS[role]}) لا يملك صلاحية هذا الإجراء.`,
    };
  }

  if (transition.requiresReason && !reason?.trim()) {
    return {
      ok: false,
      error: `الانتقال إلى «${STATUS_LABELS[to]}» يتطلب كتابة السبب.`,
    };
  }

  return { ok: true, transition };
}

// ───────────────────────────── المسميات العربية ─────────────────────────────

export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'مسودة',
  submitted: 'مقدَّم',
  screening: 'قيد الفرز والدراسة',
  rejected: 'مرفوض',
  approved: 'معتمد',
  warehouse: 'لدى المستودع',
  purchasing: 'لدى المشتريات',
  ready_to_issue: 'جاهز للصرف',
  order_issued: 'صدر أمر الصرف',
  delivered: 'تم التسليم',
  on_hold: 'مؤجَّل',
  cancelled: 'ملغي',
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدير النظام',
  reception: 'استقبال',
  screener: 'فرز ودراسة',
  warehouse: 'مستودع',
  purchasing: 'مشتريات',
  finance: 'مالية',
  viewer: 'اطّلاع فقط',
};

/**
 * نبرة الشارة لكل حالة — تُترجَم في المكوّن إلى ألوان Primer.
 * القاعدة: الرمادي محايد، الأزرق قيد العمل، الأخضر مكتمل، الأحمر خطر، الأصفر تحذير.
 */
export type StatusTone = 'neutral' | 'accent' | 'success' | 'danger' | 'attention' | 'done';

export const STATUS_TONES: Record<RequestStatus, StatusTone> = {
  draft: 'neutral',
  submitted: 'accent',
  screening: 'accent',
  rejected: 'danger',
  approved: 'success',
  warehouse: 'accent',
  purchasing: 'accent',
  ready_to_issue: 'success',
  order_issued: 'done',
  delivered: 'done',
  on_hold: 'attention',
  cancelled: 'neutral',
};

/**
 * الدور المسؤول عن كل مرحلة — يغذّي شاشة «صندوق مهامي»،
 * فيرى الموظف الطلبات التي دورها عليه الآن فقط.
 */
export const STAGE_OWNER: Partial<Record<RequestStatus, Role>> = {
  draft: Role.reception,
  submitted: Role.screener,
  screening: Role.screener,
  approved: Role.warehouse,
  warehouse: Role.warehouse,
  purchasing: Role.purchasing,
  ready_to_issue: Role.finance,
  order_issued: Role.finance,
};

/** الحالات التي تقع على عاتق هذا الدور الآن */
export function inboxStatusesFor(role: Role): RequestStatus[] {
  if (role === Role.admin) {
    return Object.keys(STAGE_OWNER) as RequestStatus[];
  }
  return (Object.entries(STAGE_OWNER) as [RequestStatus, Role][])
    .filter(([, owner]) => owner === role)
    .map(([status]) => status);
}

/**
 * مدد الإنجاز المستهدفة لكل مرحلة بالأيام.
 * تُقرأ من جدول `settings` عند وجود قيمة مخصّصة، وهذه هي الافتراضية.
 */
export const DEFAULT_SLA_DAYS: Partial<Record<RequestStatus, number>> = {
  submitted: 2,
  screening: 3,
  approved: 2,
  warehouse: 5,
  purchasing: 10,
  ready_to_issue: 3,
  order_issued: 5,
};
