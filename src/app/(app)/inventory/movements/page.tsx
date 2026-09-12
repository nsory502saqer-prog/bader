import type { Metadata } from 'next';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { requirePermission } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { listStockMovements } from '@/server/inventory';

export const metadata: Metadata = { title: 'سجل حركة المخزون' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS = { in: 'وارد', out: 'صادر', adjust: 'تسوية' } as const;
const TYPE_TONES = { in: 'success', out: 'danger', adjust: 'attention' } as const;

const REFERENCE_LABELS: Record<string, string> = {
  manual_receipt: 'إدخال يدوي',
  stock_count: 'جرد',
  disbursement_order: 'أمر صرف',
  purchase_order: 'أمر شراء',
};

export default async function StockMovementsPage() {
  await requirePermission('inventory:read');
  const rows = await listStockMovements(200);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="سجل حركة المخزون"
        description="كل تغيّر في الرصيد وسببه ومرجعه. الرصيد الحالي نتيجة هذه الحركات، لا رقم يُكتب يدويًا."
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            آخر الحركات <span className="tnum font-normal text-fg-muted">({rows.length})</span>
          </BoxTitle>
        </BoxHeader>

        {rows.length === 0 ? (
          <EmptyState title="لا توجد حركات بعد" />
        ) : (
          <TableContainer>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th>الوقت</Th>
                  <Th>الصنف</Th>
                  <Th>المقاس</Th>
                  <Th>النوع</Th>
                  <Th textAlign="center">الكمية</Th>
                  <Th>المرجع</Th>
                  <Th>المستخدم</Th>
                  <Th>ملاحظة</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <Tr key={m.id}>
                    <Td className="tnum whitespace-nowrap text-fg-muted">
                      {formatDateTime(m.createdAt)}
                    </Td>
                    <Td>{m.item.name}</Td>
                    <Td className="tnum">{m.size ?? '—'}</Td>
                    <Td>
                      <StatusLabel tone={TYPE_TONES[m.type]}>{TYPE_LABELS[m.type]}</StatusLabel>
                    </Td>
                    <Td textAlign="center" className="tnum">
                      {m.type === 'adjust' && m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </Td>
                    <Td className="text-fg-muted">
                      {m.referenceType ? (REFERENCE_LABELS[m.referenceType] ?? m.referenceType) : '—'}
                      {m.referenceId ? <span className="tnum"> · {m.referenceId}</span> : null}
                    </Td>
                    <Td className="text-fg-muted">{m.user.name}</Td>
                    <Td className="max-w-[220px] text-xs text-fg-muted">{m.note ?? '—'}</Td>
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
