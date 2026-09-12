'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

/**
 * فلتر الفترة.
 * يعيش في الرابط فيُشارَك كما هو، ويُلتقط في زر التصدير بلا إعداد إضافي.
 */

function monthRange(offsetMonths: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmt(start), to: fmt(end) };
}

export function PeriodFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  function apply(next: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`/reports?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-1">
      <div className="w-[150px]">
        <label htmlFor="rep-from" className="mb-0.5 block text-xs font-semibold text-fg">
          من تاريخ
        </label>
        <Input
          id="rep-from"
          type="date"
          value={from}
          onChange={(e) => apply({ from: e.target.value })}
          dir="ltr"
          className="tnum text-start"
        />
      </div>

      <div className="w-[150px]">
        <label htmlFor="rep-to" className="mb-0.5 block text-xs font-semibold text-fg">
          إلى تاريخ
        </label>
        <Input
          id="rep-to"
          type="date"
          value={to}
          onChange={(e) => apply({ to: e.target.value })}
          dir="ltr"
          className="tnum text-start"
        />
      </div>

      <Button type="button" size="sm" disabled={pending} onClick={() => apply(monthRange(0))}>
        هذا الشهر
      </Button>
      <Button type="button" size="sm" disabled={pending} onClick={() => apply(monthRange(1))}>
        الشهر الماضي
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={pending || (!from && !to)}
        onClick={() => apply({ from: '', to: '' })}
      >
        كل الفترات
      </Button>
    </div>
  );
}
