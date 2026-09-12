import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { DeliverForm } from '@/components/disbursements/deliver-form';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { maskNationalId } from '@/lib/arabic';
import { formatDateTime } from '@/lib/format';
import { getDisbursementOrder } from '@/server/disbursements';

export const metadata: Metadata = { title: 'أمر صرف' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  issued: 'صادر — بانتظار التسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
} as const;

const STATUS_TONES = { issued: 'accent', delivered: 'done', cancelled: 'neutral' } as const;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export default async function DisbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('disbursement:read');
  const { id } = await params;

  const order = await getDisbursementOrder(id);
  if (!order) notFound();

  const showFullId = can(user.role, 'beneficiary:read_full_id');
  const canDeliver = can(user.role, 'disbursement:deliver') && order.status === 'issued';

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={<span className="tnum">{order.orderNo}</span>}
        meta={
          <>
            <StatusLabel tone={STATUS_TONES[order.status]}>
              {STATUS_LABELS[order.status]}
            </StatusLabel>
            <Link
              href={`/requests/${order.request.id}`}
              className="tnum text-sm text-fg-link hover:underline"
            >
              {order.request.requestNo}
            </Link>
            <span className="text-sm text-fg-muted">{order.request.beneficiary.fullName}</span>
          </>
        }
        actions={
          <Link href={`/disbursements/${order.id}/print`} target="_blank">
            <span className="inline-flex h-[32px] items-center rounded border border-border bg-canvas-subtle px-2 text-sm font-semibold text-fg">
              طباعة / حفظ PDF
            </span>
          </Link>
        }
      />

      <div className="grid gap-2 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Box>
            <BoxHeader>
              <BoxTitle>الأصناف المصروفة</BoxTitle>
            </BoxHeader>
            <TableContainer>
              <Table className="min-w-[520px]">
                <thead>
                  <tr>
                    <Th>الصنف</Th>
                    <Th>البرنامج</Th>
                    <Th>المقاس</Th>
                    <Th textAlign="center">الكمية</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.request.items.map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.item?.name ?? item.legacyText ?? 'صنف غير مطابَق'}</Td>
                      <Td className="text-fg-muted">{item.item?.program.name ?? '—'}</Td>
                      <Td className="tnum">{item.size ?? '—'}</Td>
                      <Td textAlign="center" className="tnum">
                        {item.fulfilledQty > 0 ? item.fulfilledQty : item.quantity}{' '}
                        <span className="text-xs text-fg-muted">{item.item?.unit ?? ''}</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </Box>

          {canDeliver ? (
            <Box>
              <BoxHeader>
                <BoxTitle>تسجيل التسليم</BoxTitle>
              </BoxHeader>
              <DeliverForm orderId={order.id} />
            </Box>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Box>
            <BoxHeader>
              <BoxTitle>بيانات الأمر</BoxTitle>
            </BoxHeader>
            <dl className="grid gap-2 p-2">
              <Detail label="أصدره">{order.issuedBy.name}</Detail>
              <Detail label="تاريخ الإصدار">
                <span className="tnum">{formatDateTime(order.issuedAt)}</span>
              </Detail>
              <Detail label="تاريخ التسليم">
                <span className="tnum">{formatDateTime(order.deliveredAt)}</span>
              </Detail>
              <Detail label="اسم المستلم">{order.receivedByName ?? '—'}</Detail>
            </dl>
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>المستفيد</BoxTitle>
            </BoxHeader>
            <dl className="grid gap-2 p-2">
              <Detail label="الاسم">
                <Link
                  href={`/beneficiaries/${order.request.beneficiary.id}`}
                  className="text-fg-link hover:underline"
                >
                  {order.request.beneficiary.fullName}
                </Link>
              </Detail>
              <Detail label="رقم الهوية">
                <span className="tnum">
                  {showFullId
                    ? order.request.beneficiary.nationalId
                    : maskNationalId(order.request.beneficiary.nationalId)}
                </span>
              </Detail>
              <Detail label="الجوال">
                <span className="tnum">{order.request.beneficiary.phone ?? '—'}</span>
              </Detail>
              <Detail label="العنوان">
                {order.request.beneficiary.city?.name ?? '—'}
                {order.request.beneficiary.district
                  ? ` · ${order.request.beneficiary.district.name}`
                  : ''}
              </Detail>
            </dl>
          </Box>
        </div>
      </div>
    </div>
  );
}
