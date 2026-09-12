import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PencilIcon, PlusIcon } from '@primer/octicons-react';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { maskNationalId } from '@/lib/arabic';
import { formatDate, formatDays } from '@/lib/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import { recordBeneficiaryAccess } from '@/lib/audit';
import { getBeneficiaryProfile } from '@/server/beneficiaries';

export const metadata: Metadata = { title: 'ملف المستفيد' };
export const dynamic = 'force-dynamic';

/** صف بيان في بطاقة البيانات — تسمية صغيرة فوق قيمة. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export default async function BeneficiaryProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('beneficiary:read');
  const { id } = await params;

  const beneficiary = await getBeneficiaryProfile(id);
  if (!beneficiary) notFound();

  // متطلب حماية البيانات: كل اطّلاع على ملف مستفيد يُسجَّل بصاحبه ووقته.
  await recordBeneficiaryAccess({ beneficiaryId: beneficiary.id, userId: user.id });

  const showFullId = can(user.role, 'beneficiary:read_full_id');
  const showHealth = can(user.role, 'beneficiary:read_health');

  // «ما استلمه فعليًا»: البنود المصروفة عبر كل الطلبات، مجمّعة بالصنف والمقاس.
  const received = new Map<string, { name: string; program: string; size: string | null; qty: number }>();
  for (const request of beneficiary.requests) {
    for (const item of request.items) {
      if (item.fulfilledQty <= 0) continue;
      const name = item.item?.name ?? item.legacyText ?? 'صنف غير مطابَق';
      const key = `${name}|${item.size ?? ''}`;
      const existing = received.get(key);
      if (existing) existing.qty += item.fulfilledQty;
      else
        received.set(key, {
          name,
          program: item.item?.program.name ?? '—',
          size: item.size,
          qty: item.fulfilledQty,
        });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={beneficiary.fullName}
        meta={
          <>
            <span className="tnum text-sm text-fg-muted">
              {showFullId ? beneficiary.nationalId : maskNationalId(beneficiary.nationalId)}
            </span>
            <span className="text-sm text-fg-muted">·</span>
            <span className="text-sm text-fg-muted">
              {beneficiary.gender === 'male' ? 'ذكر' : 'أنثى'}
            </span>
            <span className="text-sm text-fg-muted">·</span>
            <span className="text-sm text-fg-muted">
              {beneficiary.city?.name ?? '—'}
              {beneficiary.district ? ` · ${beneficiary.district.name}` : ''}
            </span>
          </>
        }
        actions={
          <>
            {can(user.role, 'request:create') ? (
              <Link href={`/requests/new?beneficiaryId=${beneficiary.id}`}>
                <Button variant="primary" leadingIcon={<PlusIcon size={16} />}>
                  طلب جديد
                </Button>
              </Link>
            ) : null}
            {can(user.role, 'beneficiary:update') ? (
              <Link href={`/beneficiaries/${beneficiary.id}/edit`}>
                <Button leadingIcon={<PencilIcon size={16} />}>تعديل</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
        <Box className="h-fit">
          <BoxHeader>
            <BoxTitle>البيانات</BoxTitle>
          </BoxHeader>
          <dl className="grid gap-2 p-2">
            <Detail label="رقم الهوية">
              <span className="tnum">
                {showFullId ? beneficiary.nationalId : maskNationalId(beneficiary.nationalId)}
              </span>
            </Detail>
            <Detail label="تاريخ الميلاد">
              <span className="tnum">{formatDate(beneficiary.birthDate)}</span>
            </Detail>
            <Detail label="رقم الجوال">
              <span className="tnum">{beneficiary.phone ?? '—'}</span>
            </Detail>
            <Detail label="مصدر الدخل">{beneficiary.incomeSource?.name ?? '—'}</Detail>
            <Detail label="العنوان">{beneficiary.addressNote ?? '—'}</Detail>
            <Detail label="تاريخ التسجيل">
              <span className="tnum">{formatDate(beneficiary.createdAt)}</span>
            </Detail>
            {showHealth ? (
              <Detail label="ملاحظات">
                <span className="prose-limit whitespace-pre-wrap">
                  {beneficiary.notes ?? '—'}
                </span>
              </Detail>
            ) : null}
          </dl>
        </Box>

        <div className="flex min-w-0 flex-col gap-2">
          <Box>
            <BoxHeader>
              <BoxTitle>
                كل الطلبات{' '}
                <span className="tnum font-normal text-fg-muted">
                  ({beneficiary.requests.length})
                </span>
              </BoxTitle>
            </BoxHeader>

            {beneficiary.requests.length === 0 ? (
              <EmptyState title="لا توجد طلبات لهذا المستفيد" />
            ) : (
              <ol className="divide-y divide-[var(--borderColor-default)]">
                {beneficiary.requests.map((r) => {
                  const durationDays =
                    r.submittedAt && r.closedAt
                      ? (r.closedAt.getTime() - r.submittedAt.getTime()) / 86_400_000
                      : null;

                  return (
                    <li key={r.id} className="px-2 py-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <Link
                          href={`/requests/${r.id}`}
                          className="tnum text-sm text-fg-link hover:underline"
                        >
                          {r.requestNo}
                        </Link>
                        <StatusLabel tone={STATUS_TONES[r.status]}>
                          {STATUS_LABELS[r.status]}
                        </StatusLabel>
                      </div>

                      <p className="mt-0.5 text-xs text-fg-muted">
                        <span className="tnum">{formatDate(r.createdAt)}</span>
                        {durationDays !== null ? ` · أُنجز في ${formatDays(durationDays)}` : ''}
                      </p>

                      <ul className="mt-0.5 flex flex-wrap gap-0.5">
                        {r.items.map((item) => (
                          <li
                            key={item.id}
                            className="rounded border border-border px-0.5 text-xs text-fg-muted"
                          >
                            {item.item?.name ?? item.legacyText ?? 'صنف غير مطابَق'}
                            {item.size ? ` · ${item.size}` : ''}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>ما استلمه فعليًا</BoxTitle>
            </BoxHeader>

            {received.size === 0 ? (
              <EmptyState
                title="لم يستلم أي صنف بعد"
                description="تظهر هنا الأصناف التي صُرفت فعليًا، لا التي طُلبت فقط."
              />
            ) : (
              <TableContainer>
                <Table className="min-w-[420px]">
                  <thead>
                    <tr>
                      <Th>الصنف</Th>
                      <Th>البرنامج</Th>
                      <Th>المقاس</Th>
                      <Th textAlign="center">الكمية</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...received.values()].map((row) => (
                      <Tr key={`${row.name}-${row.size ?? ''}`}>
                        <Td>{row.name}</Td>
                        <Td className="text-fg-muted">{row.program}</Td>
                        <Td className="tnum">{row.size ?? '—'}</Td>
                        <Td textAlign="center" className="tnum">
                          {row.qty}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </div>
      </div>
    </div>
  );
}
