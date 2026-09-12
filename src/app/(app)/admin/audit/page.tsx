import type { Metadata } from 'next';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { requirePermission } from '@/lib/session';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'سجل التدقيق' };
export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  soft_delete: 'حذف',
  restore: 'استرجاع',
  status_change: 'تغيير حالة',
  login: 'دخول',
  export: 'تصدير',
};

const MODEL_LABELS: Record<string, string> = {
  Beneficiary: 'مستفيد',
  Request: 'طلب',
  RequestItem: 'بنود طلب',
  Attachment: 'مرفق',
  User: 'مستخدم',
  DisbursementOrder: 'أمر صرف',
};

/** يختصر قيم JSON في خلية واحدة بلا أن تنفجر عرض الجدول. */
function summarize(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('admin:audit');

  const raw = await searchParams;
  const pageRaw = Array.isArray(raw['page']) ? raw['page'][0] : raw['page'];
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
  const pageSize = 50;

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        modelType: true,
        modelId: true,
        oldValues: true,
        newValues: true,
        ip: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    db.auditLog.count(),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="سجل التدقيق"
        description="كل إنشاء وتعديل وحذف في النظام، بقيمه قبل وبعد. السجل لا يُعدَّل ولا يُحذف."
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            القيود <span className="tnum font-normal text-fg-muted">({total})</span>
          </BoxTitle>
          <span className="text-xs text-fg-muted">
            صفحة <span className="tnum">{page}</span> من{' '}
            <span className="tnum">{Math.max(1, Math.ceil(total / pageSize))}</span>
          </span>
        </BoxHeader>

        {rows.length === 0 ? (
          <EmptyState title="السجل فارغ" />
        ) : (
          <TableContainer>
            <Table className="min-w-[900px]">
              <thead>
                <tr>
                  <Th>الوقت</Th>
                  <Th>المستخدم</Th>
                  <Th>الإجراء</Th>
                  <Th>السجل</Th>
                  <Th>قبل</Th>
                  <Th>بعد</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="tnum whitespace-nowrap text-fg-muted">
                      {formatDateTime(entry.createdAt)}
                    </Td>
                    <Td>{entry.user?.name ?? '— النظام —'}</Td>
                    <Td>{ACTION_LABELS[entry.action] ?? entry.action}</Td>
                    <Td className="text-fg-muted">
                      {MODEL_LABELS[entry.modelType] ?? entry.modelType}
                    </Td>
                    <Td className="max-w-[240px] text-xs text-fg-muted">
                      {summarize(entry.oldValues)}
                    </Td>
                    <Td className="max-w-[240px] text-xs text-fg-muted">
                      {summarize(entry.newValues)}
                    </Td>
                    <Td className="tnum text-xs text-fg-muted">{entry.ip ?? '—'}</Td>
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
