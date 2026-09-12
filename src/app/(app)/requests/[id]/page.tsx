import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RequestStatus } from '@prisma/client';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Timeline } from '@/components/requests/timeline';
import { ItemsEditor } from '@/components/requests/items-editor';
import { AttachmentsPanel } from '@/components/requests/attachments-panel';
import { StatusActions } from '@/components/requests/status-actions';
import { ReserveButton } from '@/components/requests/reserve-button';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { maskNationalId } from '@/lib/arabic';
import { formatDate, formatDateTime, formatDays } from '@/lib/format';
import { allowedTransitions, isTerminal, STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import { getRequestDetail } from '@/server/requests';

export const metadata: Metadata = { title: 'تفاصيل الطلب' };
export const dynamic = 'force-dynamic';

const SOURCE_LABELS = {
  walk_in: 'حضور شخصي',
  phone: 'هاتف',
  portal: 'بوابة إلكترونية',
} as const;

/** المراحل التي يصحّ فيها فحص التوفّر والحجز على المخزون */
const STOCK_STAGES: RequestStatus[] = [
  RequestStatus.approved,
  RequestStatus.warehouse,
  RequestStatus.purchasing,
];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('request:read');
  const { id } = await params;

  const request = await getRequestDetail(id);
  if (!request) notFound();

  const transitions = can(user.role, 'request:transition')
    ? allowedTransitions(request.status, user.role).map((t) => ({
        to: t.to,
        requiresReason: t.requiresReason ?? false,
      }))
    : [];

  const itemsReadOnly = !can(user.role, 'request:update') || isTerminal(request.status);
  const showFullId = can(user.role, 'beneficiary:read_full_id');

  const totalDays =
    request.submittedAt && request.closedAt
      ? (request.closedAt.getTime() - request.submittedAt.getTime()) / 86_400_000
      : request.submittedAt
        ? (Date.now() - request.submittedAt.getTime()) / 86_400_000
        : null;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={<span className="tnum">{request.requestNo}</span>}
        meta={
          <>
            <StatusLabel tone={STATUS_TONES[request.status]}>
              {STATUS_LABELS[request.status]}
            </StatusLabel>
            {request.priority === 'urgent' ? (
              <StatusLabel tone="danger">عاجل</StatusLabel>
            ) : null}
            <Link
              href={`/beneficiaries/${request.beneficiary.id}`}
              className="text-sm text-fg-link hover:underline"
            >
              {request.beneficiary.fullName}
            </Link>
            <span className="tnum text-sm text-fg-muted">
              {showFullId
                ? request.beneficiary.nationalId
                : maskNationalId(request.beneficiary.nationalId)}
            </span>
          </>
        }
      />

      <div className="grid gap-2 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Box>
            <BoxHeader>
              <BoxTitle>
                البنود <span className="tnum font-normal text-fg-muted">({request.items.length})</span>
              </BoxTitle>
              {itemsReadOnly ? (
                <span className="text-xs text-fg-muted">
                  {isTerminal(request.status) ? 'الطلب مغلق' : 'للاطّلاع فقط'}
                </span>
              ) : null}
            </BoxHeader>

            <ItemsEditor
              requestId={request.id}
              readOnly={itemsReadOnly}
              items={request.items.map((item) => ({
                id: item.id,
                name: item.item?.name ?? item.legacyText ?? 'صنف غير مطابَق',
                programName: item.item?.program.name ?? '—',
                unit: item.item?.unit ?? '',
                size: item.size,
                quantity: item.quantity,
                itemStatus: item.itemStatus,
                fulfilledQty: item.fulfilledQty,
                note: item.note ?? '',
              }))}
            />
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>المرفقات</BoxTitle>
            </BoxHeader>
            <AttachmentsPanel
              requestId={request.id}
              attachments={request.attachments}
              canUpload={can(user.role, 'attachment:upload') && !isTerminal(request.status)}
              canDelete={can(user.role, 'attachment:delete')}
            />
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>الخط الزمني</BoxTitle>
              {totalDays !== null ? (
                <span className="text-xs text-fg-muted">
                  إجمالي {formatDays(totalDays)}
                  {request.closedAt ? '' : ' حتى الآن'}
                </span>
              ) : null}
            </BoxHeader>
            <Timeline entries={request.statusHistory} />
          </Box>
        </div>

        <div className="flex flex-col gap-2">
          <Box>
            <BoxHeader>
              <BoxTitle>الإجراءات</BoxTitle>
            </BoxHeader>
            <div className="flex flex-col gap-2 p-2">
              <StatusActions requestId={request.id} transitions={transitions} />

              {/* الحجز متاح للمستودع ما دام الطلب في مرحلة تجهيز */}
              {can(user.role, 'inventory:update') && STOCK_STAGES.includes(request.status) ? (
                <div className="border-t border-border pt-2">
                  <ReserveButton requestId={request.id} />
                </div>
              ) : null}
            </div>
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>بيانات الطلب</BoxTitle>
            </BoxHeader>
            <dl className="grid gap-2 p-2">
              <Detail label="أنشأه">{request.createdBy.name}</Detail>
              <Detail label="تاريخ الإنشاء">
                <span className="tnum">{formatDateTime(request.createdAt)}</span>
              </Detail>
              <Detail label="تاريخ التقديم">
                <span className="tnum">{formatDateTime(request.submittedAt)}</span>
              </Detail>
              <Detail label="تاريخ الإغلاق">
                <span className="tnum">{formatDateTime(request.closedAt)}</span>
              </Detail>
              <Detail label="الموظف المسؤول">{request.assignedTo?.name ?? '— غير مسنَد —'}</Detail>
              <Detail label="مصدر الطلب">{SOURCE_LABELS[request.source]}</Detail>
              {request.legacyRowRef ? (
                <Detail label="مرجع Excel الأصلي">
                  <span className="tnum text-fg-muted">{request.legacyRowRef}</span>
                </Detail>
              ) : null}
              {request.notes ? (
                <Detail label="ملاحظات">
                  <span className="prose-limit whitespace-pre-wrap">{request.notes}</span>
                </Detail>
              ) : null}
            </dl>
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>المستفيد</BoxTitle>
            </BoxHeader>
            <dl className="grid gap-2 p-2">
              <Detail label="الاسم">
                <Link
                  href={`/beneficiaries/${request.beneficiary.id}`}
                  className="text-fg-link hover:underline"
                >
                  {request.beneficiary.fullName}
                </Link>
              </Detail>
              <Detail label="الجنس">
                {request.beneficiary.gender === 'male' ? 'ذكر' : 'أنثى'}
              </Detail>
              <Detail label="الجوال">
                <span className="tnum">{request.beneficiary.phone ?? '—'}</span>
              </Detail>
              <Detail label="المدينة">
                {request.beneficiary.city?.name ?? '—'}
                {request.beneficiary.district ? ` · ${request.beneficiary.district.name}` : ''}
              </Detail>
              <Detail label="مصدر الدخل">{request.beneficiary.incomeSource?.name ?? '—'}</Detail>
            </dl>
          </Box>

          {request.orders.length > 0 ? (
            <Box>
              <BoxHeader>
                <BoxTitle>أوامر الصرف</BoxTitle>
              </BoxHeader>
              <ul className="divide-y divide-[var(--borderColor-default)]">
                {request.orders.map((order) => (
                  <li key={order.id} className="px-2 py-1 text-sm">
                    <span className="tnum text-fg">{order.orderNo}</span>
                    <span className="block text-xs text-fg-muted">
                      صدر <span className="tnum">{formatDate(order.issuedAt)}</span>
                      {order.deliveredAt ? (
                        <>
                          {' · سُلّم '}
                          <span className="tnum">{formatDate(order.deliveredAt)}</span>
                          {order.receivedByName ? ` لـ${order.receivedByName}` : ''}
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}
        </div>
      </div>
    </div>
  );
}
