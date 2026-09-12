'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, Flash } from '@/components/ui/surface';
import { beneficiaryInputSchema } from '@/lib/validation/beneficiary';
import {
  checkNationalId,
  createBeneficiary,
  updateBeneficiary,
} from '@/server/actions/beneficiary-actions';
import { formatDate } from '@/lib/format';

export type Lookups = {
  cities: { id: number; name: string }[];
  districts: { id: number; cityId: number; name: string }[];
  incomeSources: { id: number; name: string }[];
};

export type BeneficiaryFormValues = {
  nationalId: string;
  fullName: string;
  gender: 'male' | 'female' | '';
  birthDate: string;
  phone: string;
  incomeSourceId: string;
  cityId: string;
  districtId: string;
  addressNote: string;
  notes: string;
};

const EMPTY: BeneficiaryFormValues = {
  nationalId: '',
  fullName: '',
  gender: '',
  birthDate: '',
  phone: '',
  incomeSourceId: '',
  cityId: '',
  districtId: '',
  addressNote: '',
  notes: '',
};

type DuplicateNotice = {
  id: string;
  fullName: string;
  requestCount: number;
  lastRequestAt: Date | null;
};

export function BeneficiaryForm({
  lookups,
  defaultValues,
  beneficiaryId,
}: {
  lookups: Lookups;
  defaultValues?: Partial<BeneficiaryFormValues>;
  /** وجوده يعني تعديل سجل قائم بدل إنشاء جديد */
  beneficiaryId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateNotice | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<BeneficiaryFormValues>({
    // نفس مخطط Zod المستعمل في الخادم — لا تتفرّع القواعد بين الطرفين.
    resolver: zodResolver(beneficiaryInputSchema) as never,
    defaultValues: { ...EMPTY, ...defaultValues },
    mode: 'onBlur',
  });

  const selectedCity = watch('cityId');
  const districts = lookups.districts.filter((d) => String(d.cityId) === String(selectedCity));

  /** عند مغادرة حقل الهوية: تنبيه بالتكرار لا منع له. */
  async function onNationalIdBlur(value: string) {
    if (beneficiaryId || value.trim().length !== 10) {
      setDuplicate(null);
      return;
    }
    const result = await checkNationalId(value);
    setDuplicate(result.ok && result.data.exists ? result.data.beneficiary : null);
  }

  function onSubmit(values: BeneficiaryFormValues) {
    setFormError(null);

    startTransition(async () => {
      const result = beneficiaryId
        ? await updateBeneficiary({ ...values, id: beneficiaryId })
        : await createBeneficiary(values);

      if (!result.ok) {
        setFormError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as keyof BeneficiaryFormValues, { message });
        }
        return;
      }

      router.push(`/beneficiaries/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      {formError ? <Flash tone="danger">{formError}</Flash> : null}

      {duplicate ? (
        <Flash tone="attention">
          هذا المستفيد مسجّل باسم <span className="font-semibold">{duplicate.fullName}</span>، ولديه{' '}
          <span className="tnum">{duplicate.requestCount}</span> طلبًا سابقًا
          {duplicate.lastRequestAt ? `، آخرها بتاريخ ${formatDate(duplicate.lastRequestAt)}` : ''}.{' '}
          <Link href={`/beneficiaries/${duplicate.id}`} className="text-fg-link underline">
            افتح ملفه
          </Link>{' '}
          إن كان هو المقصود، أو تابع إن كان الرقم مكتوبًا بالخطأ.
        </Flash>
      ) : null}

      <Box>
        <BoxHeader>
          <BoxTitle>البيانات الأساسية</BoxTitle>
        </BoxHeader>

        <div className="grid gap-2 p-2 sm:grid-cols-2">
          <FormField
            label="رقم الهوية"
            htmlFor="nationalId"
            required
            error={errors.nationalId?.message}
            hint="10 أرقام تبدأ بـ1 للمواطن أو 2 للمقيم"
          >
            <Input
              {...register('nationalId', {
                onBlur: (e) => void onNationalIdBlur(e.target.value),
              })}
              inputMode="numeric"
              maxLength={10}
              dir="ltr"
              className="tnum text-start"
            />
          </FormField>

          <FormField
            label="الاسم الرباعي"
            htmlFor="fullName"
            required
            error={errors.fullName?.message}
          >
            <Input {...register('fullName')} autoComplete="off" />
          </FormField>

          <FormField label="الجنس" htmlFor="gender" required error={errors.gender?.message}>
            <Select {...register('gender')}>
              <option value="">اختر…</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </Select>
          </FormField>

          <FormField label="تاريخ الميلاد" htmlFor="birthDate" error={errors.birthDate?.message}>
            <Input {...register('birthDate')} type="date" dir="ltr" className="tnum text-start" />
          </FormField>

          <FormField
            label="رقم الجوال"
            htmlFor="phone"
            error={errors.phone?.message}
            hint="05XXXXXXXX"
          >
            <Input
              {...register('phone')}
              inputMode="tel"
              dir="ltr"
              className="tnum text-start"
              maxLength={14}
            />
          </FormField>

          <FormField
            label="مصدر الدخل"
            htmlFor="incomeSourceId"
            required
            error={errors.incomeSourceId?.message}
          >
            <Select {...register('incomeSourceId')}>
              <option value="">اختر…</option>
              {lookups.incomeSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>العنوان</BoxTitle>
        </BoxHeader>

        <div className="grid gap-2 p-2 sm:grid-cols-2">
          <FormField label="المدينة" htmlFor="cityId" required error={errors.cityId?.message}>
            <Select {...register('cityId')}>
              <option value="">اختر…</option>
              {lookups.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="الحي"
            htmlFor="districtId"
            error={errors.districtId?.message}
            hint={selectedCity ? undefined : 'اختر المدينة أولًا'}
          >
            <Select {...register('districtId')} disabled={!selectedCity}>
              <option value="">— غير محدَّد —</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="تفاصيل العنوان"
            htmlFor="addressNote"
            error={errors.addressNote?.message}
            className="sm:col-span-2"
          >
            <Textarea {...register('addressNote')} rows={2} />
          </FormField>
        </div>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>ملاحظات</BoxTitle>
        </BoxHeader>
        <div className="p-2">
          <FormField label="ملاحظات داخلية" htmlFor="notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} rows={3} />
          </FormField>
        </div>
      </Box>

      <div className="flex items-center gap-1">
        <Button type="submit" variant="primary" loading={pending}>
          {beneficiaryId ? 'حفظ التعديلات' : 'حفظ المستفيد'}
        </Button>
        <Button type="button" onClick={() => router.back()}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
