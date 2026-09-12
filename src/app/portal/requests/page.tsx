import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from '@primer/octicons-react';
import { Box, BoxHeader, BoxTitle, EmptyState } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { StatusLabel } from '@/components/ui/label';
import { db, notDeleted } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import { requirePortalUser } from '@/server/portal/session';

export const metadata: Metadata = {
  title: 'طلباتي',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * طلبات المستفيد.
 *
 * ما يُعرض هنا أقل بكثير مما يراه الموظف عمدًا: الحالة وتاريخها والأصناف —
 * بلا ملاحظات داخلية، ولا أسباب رفض تفصيلية، ولا أسماء موظفين. البوابة نافذة
 * على حالة الطلب، لا على ملف الجمعية الداخلي.
 */
export default async function PortalRequestsPage() {
  const user = await requirePortalUser();

  const requests = await db.request.findMany({
    where: { beneficiaryId: user.id, ...notDeleted },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      requestNo: true,
      status: true,
      createdAt: true,
      closedAt: true,
      items: {
        where: notDeleted,
        select: {
          id: true,
          size: true,
          quantity: true,
          legacyText: true,
          item: { select: { name: true, program: { select: { name: true } } } },
        },
      },
    },
  });

  const open = requests.filter((r) => !r.closedAt).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg">طلباتي</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            أهلًا {user.fullName.split(' ')[0]}. لديك{' '}
            <span className="tnum">{open}</span> طلبًا قيد المتابعة.
          </p>
        </div>

        <Link href="/portal/new">
          <Button variant="primary" leadingIcon={<PlusIcon size={16} />}>
            طلب جديد
          </Button>
        </Link>
      </div>

      <Box>
        <BoxHeader>
          <BoxTitle>
            كل الطلبات <span className="tnum font-normal text-fg-muted">({requests.length})</span>
          </BoxTitle>
        </BoxHeader>

        {requests.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات بعد"
            description="قدّم طلبك الأول من زر «طلب جديد» أعلاه."
          />
        ) : (
          <ul className="divide-y divide-[var(--borderColor-default)]">
            {requests.map((request) => (
              <li key={request.id} className="px-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Link
                    href={`/portal/requests/${request.id}`}
                    className="tnum text-sm font-semibold text-fg-link hover:underline"
                  >
                    {request.requestNo}
                  </Link>
                  <StatusLabel tone={STATUS_TONES[request.status]}>
                    {STATUS_LABELS[request.status]}
                  </StatusLabel>
                </div>

                <p className="mt-0.5 text-xs text-fg-muted">
                  قُدّم في <span className="tnum">{formatDate(request.createdAt)}</span>
                </p>

                <ul className="mt-1 flex flex-wrap gap-0.5">
                  {request.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded border border-border px-0.5 text-xs text-fg-muted"
                    >
                      {item.item?.name ?? item.legacyText ?? 'صنف'}
                      {item.size ? ` · ${item.size}` : ''}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </div>
  );
}
