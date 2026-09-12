import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Role } from '@prisma/client';
import { auth } from '@/lib/auth';
import { assertCan, can, type Permission } from '@/lib/rbac';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * المستخدم الحالي، أو null إن لم تكن هناك جلسة صالحة.
 * ملفوف بـ`cache` فلا يُستعلم عن الجلسة أكثر من مرة في نفس الطلب.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email ?? '',
    role: user.role,
  };
});

/** يُستعمل في تخطيطات وصفحات الخادم: يعيد التوجيه لصفحة الدخول عند غياب الجلسة. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** يُستعمل في الصفحات: يمنع الوصول لمن لا يملك الصلاحية. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect('/403');
  return user;
}

/**
 * يُستعمل داخل Server Actions: يرمي ForbiddenError بدل إعادة التوجيه،
 * فتلتقطه الحركة وتعيد رسالة عربية للنموذج.
 */
export async function requirePermissionInAction(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('انتهت الجلسة. سجّل الدخول من جديد.');
  assertCan(user.role, permission);
  return user;
}

/** عنوان IP الطالب — يُخزَّن في سجل التدقيق وسجل الاطّلاع على ملفات المستفيدين. */
export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return h.get('x-real-ip');
}
