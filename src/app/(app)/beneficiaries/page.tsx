import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from '@primer/octicons-react';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/ui/export-button';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { maskNationalId } from '@/lib/arabic';
import { formatDate } from '@/lib/format';
import { searchBeneficiaries } from '@/server/beneficiaries';
import { db, notDeleted } from '@/lib/db';
import { BeneficiarySearch } from '@/components/beneficiaries/beneficiary-search';

export const metadata: Metadata = { title: 'المستفيدون' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function BeneficiariesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePermission('beneficiary:read');
  const params = await searchParams;

  const q = one(params['q']);
  const cityIdRaw = one(params['cityId']);
  const genderRaw = one(params['gender']);
  const page = Number.parseInt(one(params['page']) || '1', 10) || 1;

  const [{ rows, total, pageSize }, cities] = await Promise.all([
    searchBeneficiaries({
      q,
      cityId: cityIdRaw ? Number(cityIdRaw) : null,
      gender: genderRaw === 'male' || genderRaw === 'female' ? genderRaw : null,
      page,
    }),
    // المدن وحدها: فلتر هذه الشاشة لا يحتاج الأحياء، وجلبها كان يحمّل
    // مئات الصفوف في كل زيارة بلا فائدة.
    db.city.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  // الهوية رقم وطني حسّاس: تُخفى جزئيًا لمن لا يملك صلاحية رؤيتها كاملة.
  const showFullId = can(user.role, 'beneficiary:read_full_id');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="المستفيدون"
        description="ابحث برقم الهوية أو الاسم أو الجوال. البحث بالاسم تقريبي، فيجد «عائشة» السجلَّ المكتوب «عايشه»."
        actions={
          <>
            <ExportButton kind="beneficiaries" />
            {can(user.role, 'beneficiary:create') ? (
              <Link href="/beneficiaries/new">
                <Button variant="primary" leadingIcon={<PlusIcon size={16} />}>
                  مستفيد جديد
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            نتائج البحث <span className="tnum font-normal text-fg-muted">({total})</span>
          </BoxTitle>
        </BoxHeader>

        <div className="border-b border-border p-2">
          <BeneficiarySearch cities={cities} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="لا توجد نتائج"
            description={
              q
                ? 'جرّب رقم الهوية كاملًا، أو جزءًا من الاسم، أو آخر أربعة أرقام من الجوال.'
                : 'لم يُسجَّل أي مستفيد بعد.'
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th>رقم الهوية</Th>
                  <Th>الاسم</Th>
                  <Th>الجنس</Th>
                  <Th>المدينة</Th>
                  <Th>الجوال</Th>
                  <Th textAlign="center">الطلبات</Th>
                  <Th>تاريخ التسجيل</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <Tr key={b.id}>
                    <Td>
                      <Link
                        href={`/beneficiaries/${b.id}`}
                        className="tnum text-fg-link hover:underline"
                      >
                        {showFullId ? b.nationalId : maskNationalId(b.nationalId)}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/beneficiaries/${b.id}`} className="text-fg hover:underline">
                        {b.fullName}
                      </Link>
                    </Td>
                    <Td>{b.gender === 'male' ? 'ذكر' : 'أنثى'}</Td>
                    <Td>
                      {b.city?.name ?? '—'}
                      {b.district ? (
                        <span className="text-fg-muted"> · {b.district.name}</span>
                      ) : null}
                    </Td>
                    <Td className="tnum">{b.phone ?? '—'}</Td>
                    <Td textAlign="center" className="tnum">
                      {b._count.requests}
                    </Td>
                    <Td className="tnum text-fg-muted">{formatDate(b.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}

        {totalPages > 1 ? (
          <nav
            aria-label="ترقيم الصفحات"
            className="flex items-center justify-between gap-1 px-2 py-1 text-xs"
          >
            <span className="text-fg-muted">
              صفحة <span className="tnum">{page}</span> من <span className="tnum">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <PageLink params={params} page={page - 1} disabled={page <= 1}>
                السابق
              </PageLink>
              <PageLink params={params} page={page + 1} disabled={page >= totalPages}>
                التالي
              </PageLink>
            </div>
          </nav>
        ) : null}
      </Box>
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded border border-border px-1 py-0.5 text-fg-disabled">{children}</span>
    );
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page') continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) search.set(key, v);
  }
  search.set('page', String(page));

  return (
    <Link
      href={`/beneficiaries?${search.toString()}`}
      className="rounded border border-border px-1 py-0.5 text-fg hover:bg-canvas-subtle"
    >
      {children}
    </Link>
  );
}
