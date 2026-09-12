import type { Role } from '@prisma/client';
import { can, type Permission } from '@/lib/rbac';

/**
 * تعريف التنقّل في مكان واحد، ومربوط بالصلاحيات لا بالأدوار المكتوبة يدويًا.
 * فإن تغيّرت صلاحية دور في `rbac.ts` تغيّرت قائمته تلقائيًا.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  permission: Permission;
};

export type IconName =
  | 'home'
  | 'people'
  | 'inbox'
  | 'tasklist'
  | 'package'
  | 'cart'
  | 'receipt'
  | 'graph'
  | 'gear';

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'لوحة المعلومات', icon: 'home', permission: 'request:read' },
  { href: '/my-tasks', label: 'صندوق مهامي', icon: 'inbox', permission: 'request:read' },
  { href: '/requests', label: 'الطلبات', icon: 'tasklist', permission: 'request:read' },
  { href: '/beneficiaries', label: 'المستفيدون', icon: 'people', permission: 'beneficiary:read' },
  { href: '/inventory', label: 'المستودع', icon: 'package', permission: 'inventory:read' },
  { href: '/purchasing', label: 'المشتريات', icon: 'cart', permission: 'purchasing:read' },
  {
    href: '/disbursements',
    label: 'أوامر الصرف',
    icon: 'receipt',
    permission: 'disbursement:read',
  },
  { href: '/reports', label: 'التقارير', icon: 'graph', permission: 'report:read' },
  { href: '/admin', label: 'الإدارة', icon: 'gear', permission: 'admin:users' },
];

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}
