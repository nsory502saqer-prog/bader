import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash } from '@/components/ui/surface';
import { PortalNewRequestForm } from '@/components/portal/new-request-form';
import { db, notDeleted } from '@/lib/db';
import { requirePortalUser } from '@/server/portal/session';
import { getCatalog } from '@/server/requests';

export const metadata: Metadata = {
  title: 'طلب جديد',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const MAX_OPEN = 2;

export default async function PortalNewRequestPage() {
  const user = await requirePortalUser();

  const [catalog, openCount] = await Promise.all([
    getCatalog(),
    db.request.count({ where: { beneficiaryId: user.id, ...notDeleted, closedAt: null } }),
  ]);

  const blocked = openCount >= MAX_OPEN;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Link href="/portal/requests" className="text-xs text-fg-link hover:underline">
          ← كل طلباتي
        </Link>
        <h1 className="mt-0.5 text-lg font-semibold text-fg">طلب جديد</h1>
        <p className="prose-limit mt-0.5 text-sm text-fg-muted">
          اختر ما تحتاجه، وسيراجعه الباحث الاجتماعي. الموافقة ليست تلقائية.
        </p>
      </div>

      {blocked ? (
        <Flash tone="attention">
          لديك <span className="tnum">{openCount}</span> طلبات لم تُغلق بعد. تابعها أولًا، أو راجع
          الجمعية إن كنت تحتاج طلبًا عاجلًا إضافيًا.
        </Flash>
      ) : (
        <PortalNewRequestForm catalog={catalog} />
      )}
    </div>
  );
}
