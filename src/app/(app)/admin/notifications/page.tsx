import type { Metadata } from 'next';
import Link from 'next/link';
import { NotificationStatus } from '@prisma/client';
import { Box, BoxHeader, BoxTitle, EmptyState, Flash, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { requirePermission } from '@/lib/session';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { maskNationalId } from '@/lib/arabic';
import { can } from '@/lib/rbac';

export const metadata: Metadata = { title: 'سجل الإشعارات' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<NotificationStatus, string> = {
  queued: 'في الانتظار',
  sending: 'قيد الإرسال',
  sent: 'أُرسلت',
  failed: 'أخفقت',
  skipped: 'متخطّاة',
};

const STATUS_TONES = {
  queued: 'neutral',
  sending: 'accent',
  sent: 'success',
  failed: 'danger',
  skipped: 'attention',
} as const;

const TEMPLATE_LABELS: Record<string, string> = {
  request_submitted: 'استلام الطلب',
  request_approved: 'اعتماد الطلب',
  request_rejected: 'رفض الطلب',
  request_ready: 'جاهز للصرف',
  order_issued: 'صدور أمر الصرف',
  request_delivered: 'تم التسليم',
  request_on_hold: 'تأجيل الطلب',
  otp: 'رمز دخول البوابة',
};

export default async function NotificationsLogPage() {
  const user = await requirePermission('admin:audit');
  const showFullPhone = can(user.role, 'beneficiary:read_full_id');

  const [rows, counts] = await Promise.all([
    db.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        channel: true,
        status: true,
        toPhone: true,
        body: true,
        template: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        createdAt: true,
        request: { select: { id: true, requestNo: true } },
        beneficiary: { select: { id: true, fullName: true } },
      },
    }),
    db.notification.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countBy = new Map(counts.map((c) => [c.status, c._count._all]));
  const failed = countBy.get(NotificationStatus.failed) ?? 0;
  const queued = countBy.get(NotificationStatus.queued) ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="سجل الإشعارات"
        description="كل رسالة صادرة من النظام: ماذا قالت، ولمن، وهل وصلت. الرسالة تُكتب هنا قبل إرسالها، فلا تضيع إن تعطّل المزوّد."
        meta={
          <span className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            <span>
              أُرسلت: <span className="tnum">{countBy.get(NotificationStatus.sent) ?? 0}</span>
            </span>
            <span>·</span>
            <span>
              في الانتظار: <span className="tnum">{queued}</span>
            </span>
            <span>·</span>
            <span>
              أخفقت: <span className="tnum">{failed}</span>
            </span>
            <span>·</span>
            <span>
              متخطّاة: <span className="tnum">{countBy.get(NotificationStatus.skipped) ?? 0}</span>
            </span>
          </span>
        }
      />

      {failed > 0 ? (
        <Flash tone="danger">
          <span className="tnum">{failed}</span> رسالة أخفقت بعد استنفاد المحاولات. راجع عمود
          الخطأ أدناه، وتأكد من إعدادات المزوّد.
        </Flash>
      ) : null}

      {queued > 0 ? (
        <Flash tone="attention">
          <span className="tnum">{queued}</span> رسالة في الانتظار. تأكد أن العامل يعمل
          (<span className="tnum">npm run worker</span>).
        </Flash>
      ) : null}

      <Box>
        <BoxHeader>
          <BoxTitle>
            آخر الرسائل <span className="tnum font-normal text-fg-muted">({rows.length})</span>
          </BoxTitle>
        </BoxHeader>

        {rows.length === 0 ? (
          <EmptyState
            title="لم تُرسل أي رسالة بعد"
            description="تُنشأ الرسائل تلقائيًا عند تغيّر حالة الطلب."
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[900px]">
              <thead>
                <tr>
                  <Th>الوقت</Th>
                  <Th>القناة</Th>
                  <Th>النوع</Th>
                  <Th>المستفيد</Th>
                  <Th>الجوال</Th>
                  <Th>الطلب</Th>
                  <Th>الحالة</Th>
                  <Th textAlign="center">المحاولات</Th>
                  <Th>الخطأ</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="tnum whitespace-nowrap text-fg-muted">
                      {formatDateTime(row.sentAt ?? row.createdAt)}
                    </Td>
                    <Td>{row.channel === 'whatsapp' ? 'واتساب' : 'SMS'}</Td>
                    <Td className="text-fg-muted">
                      {TEMPLATE_LABELS[row.template] ?? row.template}
                    </Td>
                    <Td>
                      {row.beneficiary ? (
                        <Link
                          href={`/beneficiaries/${row.beneficiary.id}`}
                          className="text-fg-link hover:underline"
                        >
                          {row.beneficiary.fullName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="tnum text-fg-muted">
                      {row.toPhone
                        ? showFullPhone
                          ? row.toPhone
                          : maskNationalId(row.toPhone)
                        : '—'}
                    </Td>
                    <Td>
                      {row.request ? (
                        <Link
                          href={`/requests/${row.request.id}`}
                          className="tnum text-fg-link hover:underline"
                        >
                          {row.request.requestNo}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <StatusLabel tone={STATUS_TONES[row.status]}>
                        {STATUS_LABELS[row.status]}
                      </StatusLabel>
                    </Td>
                    <Td textAlign="center" className="tnum text-fg-muted">
                      {row.attempts}
                    </Td>
                    <Td className="max-w-[240px] text-xs text-fg-muted">{row.lastError ?? '—'}</Td>
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
