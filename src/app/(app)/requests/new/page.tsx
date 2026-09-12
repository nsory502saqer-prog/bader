import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { RequestWizard } from '@/components/requests/request-wizard';
import { requirePermission } from '@/lib/session';
import { db, notDeleted } from '@/lib/db';
import { getCatalog } from '@/server/requests';

export const metadata: Metadata = { title: 'طلب جديد' };
export const dynamic = 'force-dynamic';

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('request:create');

  const params = await searchParams;
  const raw = params['beneficiaryId'];
  const beneficiaryId = Array.isArray(raw) ? raw[0] : raw;

  const [catalog, preselected] = await Promise.all([
    getCatalog(),
    beneficiaryId
      ? db.beneficiary.findFirst({
          where: { id: beneficiaryId, ...notDeleted },
          select: {
            id: true,
            fullName: true,
            _count: { select: { requests: true } },
            requests: {
              where: notDeleted,
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        })
      : null,
  ]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-2">
      <PageHeader
        title="طلب جديد"
        description="ثلاث خطوات: تحديد المستفيد، ثم البنود، ثم المرفقات والمراجعة."
      />
      <RequestWizard
        catalog={catalog}
        initialBeneficiary={
          preselected
            ? {
                id: preselected.id,
                fullName: preselected.fullName,
                requestCount: preselected._count.requests,
                lastRequestAt: preselected.requests[0]?.createdAt ?? null,
              }
            : null
        }
      />
    </div>
  );
}
