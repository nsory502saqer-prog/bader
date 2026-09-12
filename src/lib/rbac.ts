import { Role } from '@prisma/client';

/**
 * الصلاحيات القائمة على الأدوار.
 *
 * كل تحقق يقع في طبقة الخادم. إخفاء زر في الواجهة تحسينٌ لتجربة الاستخدام،
 * وليس إجراءً أمنيًا — أي Server Action تتحقق بنفسها قبل أن تكتب.
 */

export const PERMISSIONS = [
  // المستفيدون
  'beneficiary:read',
  'beneficiary:create',
  'beneficiary:update',
  'beneficiary:delete',
  /** الاطّلاع على البيانات الصحية التفصيلية (التقارير الطبية والملاحظات) */
  'beneficiary:read_health',
  /** رؤية رقم الهوية كاملًا بدل الصيغة المخفية جزئيًا */
  'beneficiary:read_full_id',

  // الطلبات
  'request:read',
  'request:create',
  'request:update',
  'request:delete',
  'request:assign',
  'request:transition',

  // المرفقات
  'attachment:read',
  'attachment:upload',
  'attachment:delete',

  // المستودع
  'inventory:read',
  'inventory:update',

  // المشتريات
  'purchasing:read',
  'purchasing:manage',

  // أوامر الصرف
  'disbursement:read',
  'disbursement:issue',
  'disbursement:deliver',

  // التقارير
  'report:read',
  'report:financial',
  'report:export',

  // الإدارة
  'admin:users',
  'admin:catalog',
  'admin:lookups',
  'admin:audit',
  'admin:settings',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL,

  // الاستقبال: يفتح الملفات والطلبات ويرفع المرفقات، ولا يرى أي تقرير مالي.
  reception: [
    'beneficiary:read',
    'beneficiary:create',
    'beneficiary:update',
    'beneficiary:read_health',
    'beneficiary:read_full_id',
    'request:read',
    'request:create',
    'request:update',
    'request:transition',
    'attachment:read',
    'attachment:upload',
    'inventory:read',
    'report:export',
  ],

  // الفرز: يعتمد ويرفض، ولا يمسّ المخزون.
  screener: [
    'beneficiary:read',
    'beneficiary:update',
    'beneficiary:read_health',
    'beneficiary:read_full_id',
    'request:read',
    'request:update',
    'request:assign',
    'request:transition',
    'attachment:read',
    'attachment:upload',
    'inventory:read',
    'report:read',
    'report:export',
  ],

  // المستودع: يحدّث البنود والأرصدة ويسلّم، ولا يعتمد الطلبات.
  warehouse: [
    'beneficiary:read',
    'request:read',
    'request:update',
    'request:transition',
    'attachment:read',
    'attachment:upload',
    'inventory:read',
    'inventory:update',
    'disbursement:read',
    'disbursement:deliver',
    'report:read',
    'report:export',
  ],

  // المشتريات: تدير الشراء والموردين، ولا تعتمد الطلبات.
  purchasing: [
    'beneficiary:read',
    'request:read',
    'request:transition',
    'attachment:read',
    'attachment:upload',
    'inventory:read',
    'purchasing:read',
    'purchasing:manage',
    'report:read',
    'report:export',
  ],

  // المالية: تصدر أوامر الصرف والتقارير المالية، ولا تعدّل بيانات المستفيد.
  finance: [
    'beneficiary:read',
    'beneficiary:read_full_id',
    'request:read',
    'request:transition',
    'attachment:read',
    'inventory:read',
    'disbursement:read',
    'disbursement:issue',
    'disbursement:deliver',
    'report:read',
    'report:financial',
    'report:export',
  ],

  // الاطّلاع: قراءة فقط، وبلا بيانات صحية تفصيلية ولا هوية كاملة.
  viewer: [
    'beneficiary:read',
    'request:read',
    'inventory:read',
    'report:read',
    'report:export',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** يُرمى عند محاولة تنفيذ إجراء بلا صلاحية — تلتقطه الـ Server Actions وتحوّله لرسالة عربية. */
export class ForbiddenError extends Error {
  constructor(message = 'ليست لديك صلاحية تنفيذ هذا الإجراء.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError();
}
