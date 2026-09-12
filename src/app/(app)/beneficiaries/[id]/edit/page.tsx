import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/surface';
import { BeneficiaryForm } from '@/components/beneficiaries/beneficiary-form';
import { requirePermission } from '@/lib/session';
import { db, notDeleted } from '@/lib/db';
import { getLookups } from '@/server/beneficiaries';

export const metadata: Metadata = { title: 'تعديل بيانات المستفيد' };
export const dynamic = 'force-dynamic';

export default async function EditBeneficiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('beneficiary:update');
  const { id } = await params;

  const [beneficiary, lookups] = await Promise.all([
    db.beneficiary.findFirst({ where: { id, ...notDeleted } }),
    getLookups(),
  ]);
  if (!beneficiary) notFound();

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-2">
      <PageHeader
        title="تعديل بيانات المستفيد"
        description={beneficiary.fullName}
      />
      <BeneficiaryForm
        lookups={lookups}
        beneficiaryId={beneficiary.id}
        defaultValues={{
          nationalId: beneficiary.nationalId,
          fullName: beneficiary.fullName,
          gender: beneficiary.gender,
          birthDate: beneficiary.birthDate
            ? beneficiary.birthDate.toISOString().slice(0, 10)
            : '',
          phone: beneficiary.phone ?? '',
          incomeSourceId: beneficiary.incomeSourceId ? String(beneficiary.incomeSourceId) : '',
          cityId: beneficiary.cityId ? String(beneficiary.cityId) : '',
          districtId: beneficiary.districtId ? String(beneficiary.districtId) : '',
          addressNote: beneficiary.addressNote ?? '',
          notes: beneficiary.notes ?? '',
        }}
      />
    </div>
  );
}
