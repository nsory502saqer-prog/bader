'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { PlusIcon, TrashIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, Flash } from '@/components/ui/surface';
import { SIZES } from '@/lib/validation/request';
import { submitPortalRequest } from '@/server/actions/portal-actions';
import type { Catalog } from '@/server/requests';

type Line = {
  key: string;
  itemId: number;
  itemName: string;
  programName: string;
  hasSizes: boolean;
  size: string | null;
  quantity: number;
};

/**
 * التقديم الذاتي.
 *
 * أبسط من معالج الموظف عمدًا: لا خطوات ولا أولويات ولا مصدر طلب — المستفيد
 * يختار ما يحتاجه ويكتب ملاحظة. كل ما عدا ذلك يقرّره الفرز لاحقًا.
 */
export function PortalNewRequestForm({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [programId, setProgramId] = useState('');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');

  const flatItems = useMemo(
    () =>
      catalog.flatMap((program) =>
        program.items.map((item) => ({
          ...item,
          programId: program.id,
          programName: program.name,
        })),
      ),
    [catalog],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return flatItems.filter((item) => {
      if (programId && String(item.programId) !== programId) return false;
      if (!q) return true;
      return item.name.includes(q);
    });
  }, [flatItems, programId, query]);

  function add(item: (typeof flatItems)[number]) {
    if (lines.some((l) => l.itemId === item.id)) return;
    setLines((current) => [
      ...current,
      {
        key: `${item.id}`,
        itemId: item.id,
        itemName: item.name,
        programName: item.programName,
        hasSizes: item.hasSizes,
        size: item.hasSizes ? 'L' : null,
        quantity: 1,
      },
    ]);
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const result = await submitPortalRequest({
        items: lines.map((l) => ({ itemId: l.itemId, size: l.size, quantity: l.quantity })),
        notes,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push('/portal/requests');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      <Box>
        <BoxHeader>
          <BoxTitle>اختر ما تحتاجه</BoxTitle>
        </BoxHeader>

        <div className="flex flex-wrap items-end gap-1 border-b border-border p-2">
          <FormField label="البرنامج" htmlFor="portal-program" className="min-w-[160px]">
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">كل البرامج</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="بحث" htmlFor="portal-q" className="min-w-[200px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب اسم الصنف"
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="scroll-subtle max-h-[300px] overflow-y-auto">
          <ul className="divide-y divide-[var(--borderColor-default)]">
            {filtered.map((item) => {
              const added = lines.some((l) => l.itemId === item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-1 px-2 py-1 text-sm"
                >
                  <span className="min-w-0">
                    <span className="text-fg">{item.name}</span>
                    <span className="text-xs text-fg-muted"> · {item.programName}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={added}
                    leadingIcon={added ? undefined : <PlusIcon size={16} />}
                    onClick={() => add(item)}
                  >
                    {added ? 'مضاف' : 'إضافة'}
                  </Button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-center text-sm text-fg-muted">لا يوجد صنف مطابق.</li>
            ) : null}
          </ul>
        </div>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>
            طلبك <span className="tnum font-normal text-fg-muted">({lines.length})</span>
          </BoxTitle>
        </BoxHeader>

        {lines.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-fg-muted">
            لم تختر شيئًا بعد. اختر من القائمة أعلاه.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--borderColor-default)]">
            {lines.map((line) => (
              <li key={line.key} className="flex flex-wrap items-center gap-1 px-2 py-1">
                <span className="min-w-0 flex-1 text-sm text-fg">
                  {line.itemName}
                  <span className="text-xs text-fg-muted"> · {line.programName}</span>
                </span>

                {line.hasSizes ? (
                  <Select
                    aria-label={`مقاس ${line.itemName}`}
                    value={line.size ?? ''}
                    onChange={(e) =>
                      setLines((c) =>
                        c.map((l) => (l.key === line.key ? { ...l, size: e.target.value } : l)),
                      )
                    }
                    className="h-[32px] w-[90px]"
                  >
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                ) : null}

                <Input
                  aria-label={`عدد ${line.itemName}`}
                  type="number"
                  min={1}
                  max={20}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((c) =>
                      c.map((l) =>
                        l.key === line.key
                          ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                          : l,
                      ),
                    )
                  }
                  className="tnum h-[32px] w-[76px] text-start"
                  dir="ltr"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  aria-label={`حذف ${line.itemName}`}
                  onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                >
                  <TrashIcon size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border p-2">
          <FormField
            label="ملاحظة للجمعية"
            htmlFor="portal-notes"
            hint="اكتب ما يساعد الفرز: حالة المريض، أو تفاصيل تخصّ الطلب."
          >
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </div>
      </Box>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="primary"
          loading={pending}
          disabled={lines.length === 0}
          onClick={submit}
        >
          تقديم الطلب
        </Button>
        <span className="text-xs text-fg-muted">
          سيصلك إشعار على جوالك عند تغيّر حالة الطلب.
        </span>
      </div>
    </div>
  );
}
