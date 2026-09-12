'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { SearchIcon } from '@primer/octicons-react';
import { Input, Select } from '@/components/ui/field';

/**
 * البحث الفوري.
 * يُمهَل 300ms بعد آخر ضغطة مفتاح قبل إرسال الاستعلام، فلا يُقصف الخادم
 * باستعلام لكل حرف، ويبقى الإحساس فوريًا للموظف.
 */
export function BeneficiarySearch({ cities }: { cities: { id: number; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const cityId = searchParams.get('cityId') ?? '';
  const gender = searchParams.get('gender') ?? '';

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    startTransition(() => router.replace(`/beneficiaries?${params.toString()}`));
  }

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (q === current) return;

    const timer = setTimeout(() => push({ q }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-end gap-1">
      <div className="relative min-w-[200px] flex-1">
        <label htmlFor="beneficiary-q" className="mb-0.5 block text-xs font-semibold text-fg">
          بحث
        </label>
        <span className="pointer-events-none absolute bottom-0 start-1 flex h-[32px] items-center text-fg-muted">
          <SearchIcon size={16} />
        </span>
        <Input
          id="beneficiary-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="رقم الهوية أو الاسم أو الجوال"
          className="ps-4"
          autoComplete="off"
        />
      </div>

      <div className="min-w-[140px]">
        <label htmlFor="beneficiary-city" className="mb-0.5 block text-xs font-semibold text-fg">
          المدينة
        </label>
        <Select
          id="beneficiary-city"
          value={cityId}
          onChange={(e) => push({ cityId: e.target.value })}
        >
          <option value="">الكل</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-[110px]">
        <label htmlFor="beneficiary-gender" className="mb-0.5 block text-xs font-semibold text-fg">
          الجنس
        </label>
        <Select
          id="beneficiary-gender"
          value={gender}
          onChange={(e) => push({ gender: e.target.value })}
        >
          <option value="">الكل</option>
          <option value="male">ذكر</option>
          <option value="female">أنثى</option>
        </Select>
      </div>
    </div>
  );
}
