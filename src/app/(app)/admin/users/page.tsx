import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { UserManager } from '@/components/admin/user-manager';
import { requirePermission } from '@/lib/session';
import { db, notDeleted } from '@/lib/db';

export const metadata: Metadata = { title: 'المستخدمون والأدوار' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const actor = await requirePermission('admin:users');

  const users = await db.user.findMany({
    where: notDeleted,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="المستخدمون والأدوار"
        description="الدور يحدّد ما يراه الموظف وما يستطيع فعله. تعطيل الحساب يقطع جلساته فورًا."
      />
      <UserManager users={users} currentUserId={actor.id} />
    </div>
  );
}
