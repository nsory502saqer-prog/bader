import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Box, BoxHeader, BoxTitle } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { formatDate } from '@/lib/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import { getPortalRequest, requirePortalUser } from '@/server/portal/session';

export const metadata: Metadata = {
  title: 'تتبّع الطلب',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function PortalRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePortalUser();
  const { id } = await params;

  // الاستعلام مقيَّد بصاحب الجلسة: معرفة رقم الطلب وحدها لا تفتحه.
  const request = await getPortalRequest(id, user.id);
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Link href="/portal/requests" className="text-xs text-fg-link hover:underline">
          ← كل طلباتي
        </Link>
        <h1 className="tnum mt-0.5 text-lg font-semibold text-fg">{request.requestNo}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <StatusLabel tone={STATUS_TONES[request.status]}>
            {STATUS_LABELS[request.status]}
          </StatusLabel>
          <span className="text-xs text-fg-muted">
            قُدّم في <span className="tnum">{formatDate(request.createdAt)}</span>
          </span>
        </div>
      </div>

      <Box>
        <BoxHeader>
          <BoxTitle>الأصناف المطلوبة</BoxTitle>
        </BoxHeader>
        <ul className="divide-y divide-[var(--borderColor-default)]">
          {request.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="min-w-0 text-sm text-fg">
                {item.item?.name ?? item.legacyText ?? 'صنف'}
                {item.size ? <span className="tnum text-fg-muted"> · {item.size}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                {item.item?.program.name ?? ''}
                {item.quantity > 1 ? ` · العدد ${item.quantity}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>مراحل الطلب</BoxTitle>
        </BoxHeader>

        {/*
          الخط الزمني هنا مختصر: الحالة وتاريخها فقط — بلا أسماء الموظفين ولا
          أسباب داخلية. تفاصيل السجل الكامل تخصّ الجمعية لا المستفيد.
        */}
        <ol className="p-2">
          {request.statusHistory.map((entry, index) => {
            const isLast = index === request.statusHistory.length - 1;
            return (
              <li key={entry.id} className="relative flex gap-2 pb-2 last:pb-0">
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-[16px] h-full w-px bg-[var(--borderColor-default)]"
                    style={{ insetInlineStart: '5px' }}
                  />
                ) : null}

                <span
                  aria-hidden="true"
                  className="relative z-10 mt-0.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--bgColor-default)] bg-[var(--bgColor-neutral-emphasis)]"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{STATUS_LABELS[entry.toStatus]}</p>
                  <p className="tnum text-xs text-fg-muted">{formatDate(entry.changedAt)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Box>

      <p className="prose-limit text-xs text-fg-muted">
        للاستفسار عن هذا الطلب، راجع الجمعية واذكر رقمه: {request.requestNo}
      </p>
    </div>
  );
}
