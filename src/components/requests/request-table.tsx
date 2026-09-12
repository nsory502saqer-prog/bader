import Link from 'next/link';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/surface';
import { maskNationalId } from '@/lib/arabic';
import { formatDate, daysSince } from '@/lib/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import type { RequestStatus } from '@prisma/client';
import type { RequestListRow } from '@/server/requests';

/**
 * جدول الطلبات.
 * الصف المتأخر عن مدة الإنجاز المستهدفة يُميَّز بنص تحذيري، لا بخلفية صارخة —
 * الجدول يظل قابلًا للقراءة حتى لو تأخّر نصف الصفوف.
 */
export function RequestTable({
  rows,
  showFullId,
  highlightOverdue = false,
  emptyTitle = 'لا توجد طلبات',
  emptyDescription,
  slaDays,
}: {
  rows: RequestListRow[];
  showFullId: boolean;
  highlightOverdue?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** مدد الإنجاز المستهدفة كما ضبطها المدير، لا قيم ثابتة في الكود */
  slaDays?: Partial<Record<RequestStatus, number>>;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} {...(emptyDescription ? { description: emptyDescription } : {})} />;
  }

  return (
    <TableContainer>
      <Table className="min-w-[860px]">
        <thead>
          <tr>
            <Th>رقم الطلب</Th>
            <Th>المستفيد</Th>
            <Th>الهوية</Th>
            <Th>المدينة</Th>
            <Th>البرامج</Th>
            <Th>الحالة</Th>
            <Th>المسؤول</Th>
            <Th>تاريخ الإنشاء</Th>
            {highlightOverdue ? <Th>العمر</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const programs = [
              ...new Set(r.items.map((i) => i.item?.program.name).filter(Boolean)),
            ] as string[];

            const age = daysSince(r.submittedAt ?? r.createdAt);
            const sla = slaDays?.[r.status];
            const overdue = highlightOverdue && age !== null && sla !== undefined && age > sla;

            return (
              <Tr key={r.id}>
                <Td>
                  <Link href={`/requests/${r.id}`} className="tnum text-fg-link hover:underline">
                    {r.requestNo}
                  </Link>
                  {r.priority === 'urgent' ? (
                    <span className="ms-0.5 align-middle">
                      <StatusLabel tone="danger">عاجل</StatusLabel>
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <Link
                    href={`/beneficiaries/${r.beneficiary.id}`}
                    className="text-fg hover:underline"
                  >
                    {r.beneficiary.fullName}
                  </Link>
                </Td>
                <Td className="tnum text-fg-muted">
                  {showFullId ? r.beneficiary.nationalId : maskNationalId(r.beneficiary.nationalId)}
                </Td>
                <Td>{r.beneficiary.city?.name ?? '—'}</Td>
                <Td className="text-fg-muted">{programs.join(' · ') || '—'}</Td>
                <Td>
                  <StatusLabel tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</StatusLabel>
                </Td>
                <Td className="text-fg-muted">{r.assignedTo?.name ?? '—'}</Td>
                <Td className="tnum text-fg-muted">{formatDate(r.createdAt)}</Td>
                {highlightOverdue ? (
                  <Td className={overdue ? 'text-fg-danger' : 'text-fg-muted'}>
                    <span className="tnum">{age ?? 0}</span> يوم
                    {overdue ? <span className="text-xs"> · متأخر</span> : null}
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
}
