'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CheckIcon, TrashIcon, PlusIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, Flash } from '@/components/ui/surface';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/workflow';
import { SIZES } from '@/lib/validation/request';
import { checkNationalId } from '@/server/actions/beneficiary-actions';
import { createRequest } from '@/server/actions/request-actions';
import { uploadAttachment } from '@/server/actions/attachment-actions';
import { DOC_TYPE_LABELS } from '@/lib/doc-types';
import type { Catalog } from '@/server/requests';

/**
 * معالج الطلب الجديد — ثلاث خطوات.
 *
 * الهدف الصريح: تسجيل طلب كامل في أقل من دقيقتين. لذلك الخطوة الأولى بحث
 * بالهوية يملأ البيانات تلقائيًا، والثانية بحث فوري في الكتالوج، والثالثة
 * مراجعة واحدة قبل الحفظ.
 */

type Step = 1 | 2 | 3;

type PickedBeneficiary = {
  id: string;
  fullName: string;
  requestCount: number;
  lastRequestAt: Date | null;
};

type Line = {
  key: string;
  itemId: number;
  itemName: string;
  programName: string;
  unit: string;
  hasSizes: boolean;
  size: string | null;
  quantity: number;
  note: string;
};

const STEP_LABELS: Record<Step, string> = {
  1: 'المستفيد',
  2: 'بنود الطلب',
  3: 'المرفقات والمراجعة',
};

function StepBar({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-1 text-xs">
      {([1, 2, 3] as Step[]).map((step) => (
        <li key={step} className="flex items-center gap-1">
          <span
            className={cn(
              'flex h-[20px] min-w-[20px] items-center justify-center rounded-full border px-0.5 tnum',
              step < current && 'border-[var(--borderColor-success-emphasis)] text-fg-success',
              step === current && 'border-[var(--borderColor-accent-emphasis)] text-fg-accent',
              step > current && 'border-border text-fg-muted',
            )}
          >
            {step < current ? <CheckIcon size={16} /> : step}
          </span>
          <span className={cn(step === current ? 'font-semibold text-fg' : 'text-fg-muted')}>
            {STEP_LABELS[step]}
          </span>
          {step < 3 ? <span className="text-fg-muted">—</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function RequestWizard({
  catalog,
  initialBeneficiary,
}: {
  catalog: Catalog;
  initialBeneficiary?: PickedBeneficiary | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>(initialBeneficiary ? 2 : 1);
  const [error, setError] = useState<string | null>(null);

  // الخطوة 1
  const [nationalId, setNationalId] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'found' | 'missing'>(
    initialBeneficiary ? 'found' : 'idle',
  );
  const [beneficiary, setBeneficiary] = useState<PickedBeneficiary | null>(
    initialBeneficiary ?? null,
  );

  // الخطوة 2
  const [lines, setLines] = useState<Line[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [programFilter, setProgramFilter] = useState('');

  // الخطوة 3
  const [files, setFiles] = useState<{ file: File; docType: string }[]>([]);
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [source, setSource] = useState<'walk_in' | 'phone' | 'portal'>('walk_in');
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

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim();
    return flatItems.filter((item) => {
      if (programFilter && String(item.programId) !== programFilter) return false;
      if (!q) return true;
      return item.name.includes(q);
    });
  }, [flatItems, itemQuery, programFilter]);

  async function lookup() {
    setError(null);
    setLookupState('searching');

    const result = await checkNationalId(nationalId);
    if (!result.ok) {
      setError(result.error);
      setLookupState('idle');
      return;
    }

    if (result.data.exists && result.data.beneficiary) {
      setBeneficiary(result.data.beneficiary);
      setLookupState('found');
    } else {
      setBeneficiary(null);
      setLookupState('missing');
    }
  }

  function addLine(item: (typeof flatItems)[number]) {
    setLines((current) => [
      ...current,
      {
        key: `${item.id}-${Date.now()}`,
        itemId: item.id,
        itemName: item.name,
        programName: item.programName,
        unit: item.unit,
        hasSizes: item.hasSizes,
        size: item.hasSizes ? 'L' : null,
        quantity: 1,
        note: '',
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  function submit(asDraft: boolean) {
    setError(null);

    if (!beneficiary) {
      setError('اختر المستفيد أولًا.');
      setStep(1);
      return;
    }
    if (lines.length === 0) {
      setError('أضف بندًا واحدًا على الأقل قبل حفظ الطلب.');
      setStep(2);
      return;
    }

    startTransition(async () => {
      const result = await createRequest({
        beneficiaryId: beneficiary.id,
        priority,
        source,
        notes,
        submit: !asDraft,
        items: lines.map((l) => ({
          itemId: l.itemId,
          size: l.size,
          quantity: l.quantity,
          note: l.note,
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // المرفقات تُرفع بعد إنشاء الطلب حتى لا تبقى ملفات يتيمة عند فشل الحفظ.
      for (const entry of files) {
        const formData = new FormData();
        formData.set('requestId', result.data.id);
        formData.set('docType', entry.docType);
        formData.set('file', entry.file);
        const upload = await uploadAttachment(formData);
        if (!upload.ok) {
          setError(`حُفظ الطلب، لكن تعذّر رفع «${entry.file.name}»: ${upload.error}`);
        }
      }

      router.push(`/requests/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <StepBar current={step} />

      {error ? <Flash tone="danger">{error}</Flash> : null}

      {step === 1 ? (
        <Box>
          <BoxHeader>
            <BoxTitle>الخطوة 1 — تحديد المستفيد</BoxTitle>
          </BoxHeader>

          <div className="flex flex-col gap-2 p-2">
            <div className="flex flex-wrap items-end gap-1">
              <FormField
                label="رقم الهوية"
                htmlFor="wizard-nid"
                required
                hint="10 أرقام تبدأ بـ1 أو 2"
                className="min-w-[200px] flex-1"
              >
                <Input
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    setLookupState('idle');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void lookup();
                    }
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  dir="ltr"
                  className="tnum text-start"
                />
              </FormField>
              <Button
                type="button"
                onClick={() => void lookup()}
                loading={lookupState === 'searching'}
              >
                بحث
              </Button>
            </div>

            {lookupState === 'found' && beneficiary ? (
              <Flash tone="attention">
                <span className="font-semibold">{beneficiary.fullName}</span> — لديه{' '}
                <span className="tnum">{beneficiary.requestCount}</span> طلبًا سابقًا
                {beneficiary.lastRequestAt
                  ? `، آخرها بتاريخ ${formatDate(beneficiary.lastRequestAt)}`
                  : ''}
                .{' '}
                <Link
                  href={`/beneficiaries/${beneficiary.id}`}
                  target="_blank"
                  className="text-fg-link underline"
                >
                  افتح ملفه في تبويب جديد
                </Link>
              </Flash>
            ) : null}

            {lookupState === 'missing' ? (
              <Flash tone="accent">
                لا يوجد مستفيد بهذا الرقم.{' '}
                <Link href="/beneficiaries/new" className="text-fg-link underline">
                  سجّل مستفيدًا جديدًا
                </Link>{' '}
                ثم ارجع لإنشاء الطلب من ملفه.
              </Flash>
            ) : null}

            <div>
              <Button
                type="button"
                variant="primary"
                disabled={!beneficiary}
                onClick={() => setStep(2)}
              >
                التالي — بنود الطلب
              </Button>
            </div>
          </div>
        </Box>
      ) : null}

      {step === 2 ? (
        <>
          <Box>
            <BoxHeader>
              <BoxTitle>الخطوة 2 — إضافة البنود من الكتالوج</BoxTitle>
              <span className="text-xs text-fg-muted">
                يمكن خلط بنود من أكثر من برنامج في الطلب الواحد
              </span>
            </BoxHeader>

            <div className="flex flex-wrap items-end gap-1 border-b border-border p-2">
              <FormField label="بحث في الأصناف" htmlFor="item-q" className="min-w-[200px] flex-1">
                <Input
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  placeholder="اكتب اسم الصنف"
                  autoComplete="off"
                />
              </FormField>
              <FormField label="البرنامج" htmlFor="item-program" className="min-w-[160px]">
                <Select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
                  <option value="">كل البرامج</option>
                  {catalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="scroll-subtle max-h-[260px] overflow-y-auto">
              <ul className="divide-y divide-[var(--borderColor-default)]">
                {filteredItems.map((item) => (
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
                      leadingIcon={<PlusIcon size={16} />}
                      onClick={() => addLine(item)}
                    >
                      إضافة
                    </Button>
                  </li>
                ))}
                {filteredItems.length === 0 ? (
                  <li className="px-2 py-2 text-center text-sm text-fg-muted">
                    لا يوجد صنف مطابق.
                  </li>
                ) : null}
              </ul>
            </div>
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>
                البنود المضافة <span className="tnum font-normal text-fg-muted">({lines.length})</span>
              </BoxTitle>
            </BoxHeader>

            {lines.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-fg-muted">
                لم تُضف أي بنود بعد. الطلب لا يُحفظ بدون بند واحد على الأقل.
              </p>
            ) : (
              <TableContainer>
                <Table className="min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>الصنف</Th>
                      <Th>البرنامج</Th>
                      <Th>المقاس</Th>
                      <Th>الكمية</Th>
                      <Th>ملاحظة</Th>
                      <Th textAlign="center">حذف</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <Tr key={line.key}>
                        <Td>{line.itemName}</Td>
                        <Td className="text-fg-muted">{line.programName}</Td>
                        <Td>
                          {line.hasSizes ? (
                            <Select
                              aria-label={`مقاس ${line.itemName}`}
                              value={line.size ?? ''}
                              onChange={(e) => updateLine(line.key, { size: e.target.value })}
                              className="h-[28px] w-[80px]"
                            >
                              {SIZES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </Td>
                        <Td>
                          <Input
                            aria-label={`كمية ${line.itemName}`}
                            type="number"
                            min={1}
                            max={999}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="tnum h-[28px] w-[72px] text-start"
                            dir="ltr"
                          />
                        </Td>
                        <Td>
                          <Input
                            aria-label={`ملاحظة ${line.itemName}`}
                            value={line.note}
                            onChange={(e) => updateLine(line.key, { note: e.target.value })}
                            className="h-[28px] min-w-[140px]"
                          />
                        </Td>
                        <Td textAlign="center">
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            aria-label={`حذف ${line.itemName}`}
                            onClick={() => removeLine(line.key)}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Box>

          <div className="flex items-center gap-1">
            <Button type="button" onClick={() => setStep(1)}>
              رجوع
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={lines.length === 0}
              onClick={() => setStep(3)}
            >
              التالي — المرفقات والمراجعة
            </Button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Box>
            <BoxHeader>
              <BoxTitle>الخطوة 3 — المرفقات</BoxTitle>
              <span className="text-xs text-fg-muted">JPG · PNG · WebP · PDF — حتى 10MB للملف</span>
            </BoxHeader>

            <div className="flex flex-col gap-1 p-2">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []).map((file) => ({
                    file,
                    docType: 'other',
                  }));
                  setFiles((current) => [...current, ...picked]);
                  e.target.value = '';
                }}
                className="text-sm text-fg file:me-1 file:rounded file:border file:border-border file:bg-canvas-subtle file:px-1 file:py-0.5 file:text-sm file:font-semibold file:text-fg"
              />

              {files.length > 0 ? (
                <ul className="divide-y divide-[var(--borderColor-default)] rounded border border-border">
                  {files.map((entry, index) => (
                    <li
                      key={`${entry.file.name}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-1 px-1 py-0.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{entry.file.name}</span>
                      <span className="flex items-center gap-1">
                        <Select
                          aria-label={`نوع المستند لـ${entry.file.name}`}
                          value={entry.docType}
                          onChange={(e) =>
                            setFiles((current) =>
                              current.map((f, i) =>
                                i === index ? { ...f, docType: e.target.value } : f,
                              ),
                            )
                          }
                          className="h-[28px] w-[140px]"
                        >
                          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          aria-label={`إزالة ${entry.file.name}`}
                          onClick={() =>
                            setFiles((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <TrashIcon size={16} />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Box>

          <Box>
            <BoxHeader>
              <BoxTitle>المراجعة النهائية</BoxTitle>
            </BoxHeader>

            <div className="grid gap-2 border-b border-border p-2 sm:grid-cols-3">
              <FormField label="الأولوية" htmlFor="priority">
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                >
                  <option value="normal">عادي</option>
                  <option value="urgent">عاجل</option>
                </Select>
              </FormField>

              <FormField label="مصدر الطلب" htmlFor="source">
                <Select
                  value={source}
                  onChange={(e) => setSource(e.target.value as 'walk_in' | 'phone' | 'portal')}
                >
                  <option value="walk_in">حضور شخصي</option>
                  <option value="phone">هاتف</option>
                  <option value="portal">بوابة إلكترونية</option>
                </Select>
              </FormField>

              <FormField label="ملاحظات الطلب" htmlFor="notes" className="sm:col-span-3">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </FormField>
            </div>

            <dl className="grid gap-1 p-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg-muted">المستفيد</dt>
                <dd className="text-fg">{beneficiary?.fullName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">عدد البنود</dt>
                <dd className="tnum text-fg">{lines.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">المرفقات</dt>
                <dd className="tnum text-fg">{files.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">الحالة بعد الحفظ</dt>
                <dd className="text-fg">{STATUS_LABELS.submitted}</dd>
              </div>
            </dl>
          </Box>

          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" onClick={() => setStep(2)}>
              رجوع
            </Button>
            <Button type="button" variant="primary" loading={pending} onClick={() => submit(false)}>
              حفظ وتقديم الطلب
            </Button>
            <Button type="button" loading={pending} onClick={() => submit(true)}>
              حفظ كمسودة
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
