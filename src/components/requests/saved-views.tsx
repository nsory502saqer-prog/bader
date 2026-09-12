'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BookmarkIcon, TrashIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { deleteView, saveView } from '@/server/actions/saved-view-actions';

export type SavedViewRow = {
  id: string;
  name: string;
  filters: Record<string, string>;
  isShared: boolean;
  isMine: boolean;
};

/**
 * العروض المخصصة.
 *
 * الفلاتر تعيش في الرابط، فحفظ العرض = حفظ اسم لمجموعة معاملات. العرض النشط
 * يُميَّز بمقارنة معاملات الرابط الحالي بالمحفوظة، فيعرف الموظف أين هو.
 */
export function SavedViews({ views }: { views: SavedViewRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const current = new URLSearchParams(searchParams.toString());
  current.delete('page');
  const currentEntries = [...current.entries()].filter(([, v]) => v);
  const hasFilters = currentEntries.length > 0;

  function isActive(view: SavedViewRow): boolean {
    const keys = Object.keys(view.filters);
    if (keys.length !== currentEntries.length) return false;
    return keys.every((key) => current.get(key) === view.filters[key]);
  }

  function toHref(view: SavedViewRow): string {
    const params = new URLSearchParams(view.filters);
    return `/requests?${params.toString()}`;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveView({
        name,
        filters: Object.fromEntries(currentEntries),
        isShared: false,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNaming(false);
      setName('');
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteView(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      <div className="flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-0.5 text-xs font-semibold text-fg-muted">
          <BookmarkIcon size={16} />
          عروضي
        </span>

        {views.length === 0 ? (
          <span className="text-xs text-fg-muted">لا توجد عروض محفوظة بعد.</span>
        ) : (
          views.map((view) => {
            const active = isActive(view);
            return (
              <span
                key={view.id}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded border px-0.5 text-xs',
                  active
                    ? 'border-[var(--borderColor-accent-emphasis)] bg-[var(--bgColor-accent-muted)] text-fg-accent'
                    : 'border-border bg-canvas-subtle text-fg-muted',
                )}
              >
                <Link
                  href={toHref(view)}
                  aria-current={active ? 'page' : undefined}
                  className="px-0.5 py-px hover:underline"
                >
                  {view.name}
                </Link>
                {view.isMine ? (
                  <button
                    type="button"
                    aria-label={`حذف العرض ${view.name}`}
                    disabled={pending}
                    onClick={() => remove(view.id)}
                    className="text-fg-muted hover:text-fg-danger"
                  >
                    <TrashIcon size={16} />
                  </button>
                ) : null}
              </span>
            );
          })
        )}

        {hasFilters && !naming ? (
          <Button type="button" size="sm" onClick={() => setNaming(true)}>
            احفظ الفلاتر الحالية كعرض
          </Button>
        ) : null}
      </div>

      {naming ? (
        <div className="flex flex-wrap items-end gap-1 rounded border border-border bg-canvas-subtle p-1">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="view-name" className="mb-0.5 block text-xs font-semibold text-fg">
              اسم العرض
            </label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: طلبات جدة العالقة في المستودع"
              autoFocus
            />
          </div>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={name.trim().length < 2}
            onClick={submit}
          >
            حفظ
          </Button>
          <Button type="button" disabled={pending} onClick={() => setNaming(false)}>
            إلغاء
          </Button>
        </div>
      ) : null}
    </div>
  );
}
