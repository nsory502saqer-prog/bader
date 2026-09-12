'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { RequestStatus } from '@prisma/client';
import { SearchIcon, XIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { STATUS_LABELS } from '@/lib/workflow';

export type FilterOptions = {
  programs: { id: number; name: string }[];
  cities: { id: number; name: string }[];
  incomeSources: { id: number; name: string }[];
  staff: { id: string; name: string }[];
};

/**
 * فلاتر قائمة الطلبات.
 * الفلاتر تعيش في الـURL لا في حالة المكوّن، فيمكن حفظ الرابط أو مشاركته
 * أو تحويله إلى «عرض مخصص» لاحقًا بلا تغيير في هذا المكوّن.
 */
export function RequestFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    startTransition(() => router.replace(`/requests?${params.toString()}`));
  }

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (q === current) return;
    const timer = setTimeout(() => push({ q }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const get = (key: string) => searchParams.get(key) ?? '';
  const activeCount = [
    'status',
    'programId',
    'cityId',
    'incomeSourceId',
    'gender',
    'assignedToId',
    'from',
    'to',
  ].filter((key) => get(key)).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-1">
        <Field label="بحث" htmlFor="req-q" className="min-w-[200px] flex-1">
          <span className="pointer-events-none absolute bottom-0 start-1 flex h-[32px] items-center text-fg-muted">
            <SearchIcon size={16} />
          </span>
          <Input
            id="req-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="رقم الطلب أو اسم المستفيد أو الهوية"
            className="ps-4"
            autoComplete="off"
          />
        </Field>

        <Field label="الحالة" htmlFor="req-status" className="min-w-[150px]">
          <Select
            id="req-status"
            value={get('status')}
            onChange={(e) => push({ status: e.target.value })}
          >
            <option value="">كل الحالات</option>
            {Object.values(RequestStatus).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="البرنامج" htmlFor="req-program" className="min-w-[140px]">
          <Select
            id="req-program"
            value={get('programId')}
            onChange={(e) => push({ programId: e.target.value })}
          >
            <option value="">كل البرامج</option>
            {options.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="المدينة" htmlFor="req-city" className="min-w-[130px]">
          <Select
            id="req-city"
            value={get('cityId')}
            onChange={(e) => push({ cityId: e.target.value })}
          >
            <option value="">كل المدن</option>
            {options.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-1">
        <Field label="مصدر الدخل" htmlFor="req-income" className="min-w-[150px]">
          <Select
            id="req-income"
            value={get('incomeSourceId')}
            onChange={(e) => push({ incomeSourceId: e.target.value })}
          >
            <option value="">الكل</option>
            {options.incomeSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="الجنس" htmlFor="req-gender" className="min-w-[110px]">
          <Select
            id="req-gender"
            value={get('gender')}
            onChange={(e) => push({ gender: e.target.value })}
          >
            <option value="">الكل</option>
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </Select>
        </Field>

        <Field label="الموظف المسؤول" htmlFor="req-assignee" className="min-w-[160px]">
          <Select
            id="req-assignee"
            value={get('assignedToId')}
            onChange={(e) => push({ assignedToId: e.target.value })}
          >
            <option value="">الكل</option>
            {options.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="من تاريخ" htmlFor="req-from" className="min-w-[140px]">
          <Input
            id="req-from"
            type="date"
            value={get('from')}
            onChange={(e) => push({ from: e.target.value })}
            dir="ltr"
            className="tnum text-start"
          />
        </Field>

        <Field label="إلى تاريخ" htmlFor="req-to" className="min-w-[140px]">
          <Input
            id="req-to"
            type="date"
            value={get('to')}
            onChange={(e) => push({ to: e.target.value })}
            dir="ltr"
            className="tnum text-start"
          />
        </Field>

        {activeCount > 0 ? (
          <Button
            type="button"
            size="sm"
            leadingIcon={<XIcon size={16} />}
            onClick={() => startTransition(() => router.replace('/requests'))}
          >
            مسح الفلاتر ({activeCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="mb-0.5 block text-xs font-semibold text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}
