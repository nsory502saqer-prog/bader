import type { RequestStatus } from '@prisma/client';
import { STATUS_LABELS } from '@/lib/workflow';
import { formatDateTime, formatDays } from '@/lib/format';

/**
 * الخط الزمني الكامل للطلب.
 *
 * هذا بالضبط ما كان مستحيلًا استخراجه من ملف Excel: من غيّر الحالة، ومتى،
 * ولماذا، وكم مكث الطلب في كل مرحلة. لذلك تُعرض المدة بين كل قيد والذي يليه.
 */

export type TimelineEntry = {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  changedAt: Date;
  note: string | null;
  user: { id: string; name: string };
};

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-2 py-2 text-sm text-fg-muted">لا يوجد سجل بعد.</p>;
  }

  const now = Date.now();

  return (
    <ol className="relative p-2">
      {entries.map((entry, index) => {
        const next = entries[index + 1];
        const endedAt = next ? next.changedAt.getTime() : now;
        const durationDays = (endedAt - entry.changedAt.getTime()) / 86_400_000;
        const isLast = index === entries.length - 1;

        return (
          <li key={entry.id} className="relative flex gap-2 pb-2 last:pb-0">
            {/* الخط الرأسي الواصل بين القيود */}
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
              <p className="text-sm text-fg">
                {entry.fromStatus ? (
                  <>
                    من <span className="font-semibold">{STATUS_LABELS[entry.fromStatus]}</span> إلى{' '}
                    <span className="font-semibold">{STATUS_LABELS[entry.toStatus]}</span>
                  </>
                ) : (
                  <>
                    إنشاء الطلب بحالة{' '}
                    <span className="font-semibold">{STATUS_LABELS[entry.toStatus]}</span>
                  </>
                )}
              </p>

              <p className="mt-px text-xs text-fg-muted">
                {entry.user.name} · <span className="tnum">{formatDateTime(entry.changedAt)}</span>
                {' · مكث '}
                {formatDays(durationDays)}
                {isLast ? ' حتى الآن' : ''}
              </p>

              {entry.note ? (
                <p className="prose-limit mt-0.5 rounded border border-border bg-canvas-subtle px-1 py-0.5 text-sm text-fg">
                  {entry.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
