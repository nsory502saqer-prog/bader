import type { Metadata } from 'next';
import Link from 'next/link';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { maskNationalId } from '@/lib/arabic';
import { formatDate } from '@/lib/format';
import { ExportButton } from '@/components/ui/export-button';
import { listDisbursementOrders } from '@/server/disbursements';

export const metadata: Metadata = { title: 'أوامر الصرف' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  issued: 'صادر — بانتظار التسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
} as const;

const STATUS_TONES = { issued: 'accent', delivered: 'done', cancelled: 'neutral' } as const;

export default async function DisbursementsPage() {
  const user = await requirePermission('disbursement:read');
  const orders = await listDisbursementOrders();

  const showFullId = can(user.role, 'beneficiary:read_full_id');
  const pendingDelivery = orders.filter((o) => o.status === 'issued').length;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="أوامر الصرف"
        description="أمر الصرف يُصدر من صفحة الطلب عند بلوغه «جاهز للصرف»، وإصداره يخصم من المخزون."
        meta={
          <span className="text-xs text-fg-muted">
            بانتظار التسليم: <span className="tnum">{pendingDelivery}</span>
          </span>
        }
        actions={<ExportButton kind="disbursements" />}
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            الأرشيف <span className="tnum font-normal text-fg-muted">({orders.length})</span>
          </BoxTitle>
        </BoxHeader>

        {orders.length === 0 ? (
          <EmptyState
            title="لا توجد أوامر صرف بعد"
            description="ينشأ أمر الصرف تلقائيًا عند نقل الطلب إلى «صدر أمر الصرف»."
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th>رقم الأمر</Th>
                  <Th>الطلب</Th>
                  <Th>المستفيد</Th>
                  <Th>الهوية</Th>
                  <Th>الحالة</Th>
                  <Th>تاريخ الإصدار</Th>
                  <Th>التسليم</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <Tr key={order.id}>
                    <Td>
                      <Link
                        href={`/disbursements/${order.id}`}
                        className="tnum text-fg-link hover:underline"
                      >
                        {order.orderNo}
                      </Link>
                    </Td>
                    <Td>
                      <Link
                        href={`/requests/${order.request.id}`}
                        className="tnum text-fg-muted hover:underline"
                      >
                        {order.request.requestNo}
                      </Link>
                    </Td>
                    <Td>{order.request.beneficiary.fullName}</Td>
                    <Td className="tnum text-fg-muted">
                      {showFullId
                        ? order.request.beneficiary.nationalId
                        : maskNationalId(order.request.beneficiary.nationalId)}
                    </Td>
                    <Td>
                      <StatusLabel tone={STATUS_TONES[order.status]}>
                        {STATUS_LABELS[order.status]}
                      </StatusLabel>
                    </Td>
                    <Td className="tnum text-fg-muted">{formatDate(order.issuedAt)}</Td>
                    <Td className="text-fg-muted">
                      {order.deliveredAt ? (
                        <>
                          <span className="tnum">{formatDate(order.deliveredAt)}</span>
                          {order.receivedByName ? ` · ${order.receivedByName}` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </div>
  );
}
