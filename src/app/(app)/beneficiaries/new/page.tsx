import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { BeneficiaryForm } from '@/components/beneficiaries/beneficiary-form';
import { requirePermission } from '@/lib/session';
import { getLookups } from '@/server/beneficiaries';

export const metadata: Metadata = { title: 'مستفيد جديد' };
export const dynamic = 'force-dynamic';

export default async function NewBeneficiaryPage() {
  await requirePermission('beneficiary:create');
  const lookups = await getLookups();

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-2">
      <PageHeader
        title="مستفيد جديد"
        description="سجّل بيانات المستفيد مرة واحدة، ثم تُربط بها كل طلباته لاحقًا."
      />
      <BeneficiaryForm lookups={lookups} />
    </div>
  );
}
