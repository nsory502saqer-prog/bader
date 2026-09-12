import { cn } from '@/lib/cn';

/**
 * قائمة ترتيب بأشرطة داخل الصفوف.
 *
 * ليست رسمًا بيانيًا عمدًا: الصف يحمل الاسم والرقم والشريط معًا في سطر واحد،
 * فتُقرأ القيمة بدقة ويُقارَن الحجم بلمحة، بكثافة أعلى من رسم منفصل — وهذا هو
 * المطلوب في أداة عمل، لا لوحة عرض.
 *
 * الشريط زخرفة مساعدة، لذا هو `aria-hidden` والرقم هو المقروء فعلًا.
 */
export function RankList({
  rows,
  emptyLabel = 'لا توجد بيانات',
  unitLabel,
  className,
}: {
  rows: { key: string; label: string; sublabel?: string; value: number }[];
  emptyLabel?: string;
  unitLabel?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-2 py-3 text-center text-sm text-fg-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className={cn('divide-y divide-[var(--borderColor-default)]', className)}>
      {rows.map((row) => (
        <li key={row.key} className="px-2 py-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-sm text-fg">
              {row.label}
              {row.sublabel ? (
                <span className="text-xs text-fg-muted"> · {row.sublabel}</span>
              ) : null}
            </span>
            <span className="tnum shrink-0 text-sm font-semibold text-fg">
              {row.value}
              {unitLabel ? <span className="text-xs font-normal text-fg-muted"> {unitLabel}</span> : null}
            </span>
          </div>

          <div
            aria-hidden="true"
            className="mt-0.5 h-[4px] w-full overflow-hidden rounded bg-[var(--bgColor-neutral-muted)]"
          >
            <div
              className="h-full rounded bg-[var(--bgColor-accent-emphasis)]"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
