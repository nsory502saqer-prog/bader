'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { PlusIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, EmptyState, Flash } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { SIZES } from '@/lib/validation/request';
import { addQuotation } from '@/server/actions/purchasing-actions';
import type { QuotationRow, SupplierRow } from '@/server/inventory';
import type { Catalog } from '@/server/requests';

/**
 * عروض الأسعار.
 *
 * الغرض المفاضلة قبل إصدار أمر الشراء: الأرخص الصالح لكل صنف يُوسَم صراحةً،
 * والمنتهي يبقى معروضًا لكنه لا يُوصى به — حذفه يُضيّع تاريخ الأسعار الذي
 * يُحتاج عند التفاوض في الموسم التالي.
 */
export function QuotationsPanel({
  quotations,
  suppliers,
  catalog,
  canManage,
}: {
  quotations: QuotationRow[];
  suppliers: SupplierRow[];
  catalog: Catalog;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [draft, setDraft] = useState({
    supplierId: '',
    itemId: '',
    size: '',
    unitPrice: '',
    validUntil: '',
    notes: '',
  });

  const flatItems = useMemo(
    () =>
      catalog.flatMap((program) =>
        program.items.map((item) => ({ ...item, programName: program.name })),
      ),
    [catalog],
  );

  const selectedItem = flatItems.find((i) => String(i.id) === draft.itemId);

  function submit() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await addQuotation({
        ...draft,
        // المقاس يُرسل للأصناف ذات المقاسات فقط.
        size: selectedItem?.hasSizes ? draft.size : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setShowForm(false);
      setDraft({ supplierId: '', itemId: '', size: '', unitPrice: '', validUntil: '', notes: '' });
      setSuccess('أُضيف عرض السعر.');
      router.refresh();
    });
  }

  return (
    <Box>
      <BoxHeader>
        <BoxTitle>
          عروض الأسعار <span className="tnum font-normal text-fg-muted">({quotations.length})</span>
        </BoxTitle>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            leadingIcon={<PlusIcon size={16} />}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'إخفاء' : 'عرض سعر جديد'}
          </Button>
        ) : null}
      </BoxHeader>

      {error ? (
        <div className="p-2">
          <Flash tone="danger">{error}</Flash>
        </div>
      ) : null}
      {success ? (
        <div className="p-2">
          <Flash tone="success">{success}</Flash>
        </div>
      ) : null}

      {showForm ? (
        <div className="grid gap-2 border-b border-border p-2 sm:grid-cols-3">
          <FormField label="المورّد" htmlFor="q-supplier" required>
            <Select
              value={draft.supplierId}
              onChange={(e) => setDraft({ ...draft, supplierId: e.target.value })}
            >
              <option value="">اختر…</option>
              {suppliers
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </FormField>

          <FormField label="الصنف" htmlFor="q-item" required className="sm:col-span-2">
            <Select
              value={draft.itemId}
              onChange={(e) => setDraft({ ...draft, itemId: e.target.value, size: '' })}
            >
              <option value="">اختر…</option>
              {flatItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.programName}
                </option>
              ))}
            </Select>
          </FormField>

          {selectedItem?.hasSizes ? (
            <FormField label="المقاس" htmlFor="q-size" required>
              <Select value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })}>
                <option value="">اختر…</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField
            label="سعر الوحدة"
            htmlFor="q-price"
            required
            hint={selectedItem ? `لكل ${selectedItem.unit}` : 'بالريال'}
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.unitPrice}
              onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
              dir="ltr"
              className="tnum text-start"
            />
          </FormField>

          <FormField
            label="صالح حتى"
            htmlFor="q-valid"
            hint="اتركه فارغًا إن كان مفتوحًا"
          >
            <Input
              type="date"
              value={draft.validUntil}
              onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
              dir="ltr"
              className="tnum text-start"
            />
          </FormField>

          <FormField label="ملاحظات" htmlFor="q-notes" className="sm:col-span-3">
            <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </FormField>

          <div className="sm:col-span-3">
            <Button
              type="button"
              variant="primary"
              loading={pending}
              disabled={
                !draft.supplierId ||
                !draft.itemId ||
                draft.unitPrice === '' ||
                (selectedItem?.hasSizes === true && !draft.size)
              }
              onClick={submit}
            >
              حفظ عرض السعر
            </Button>
          </div>
        </div>
      ) : null}

      {quotations.length === 0 ? (
        <EmptyState
          title="لا توجد عروض أسعار"
          description="أضف عروض الموردين هنا لتُقارن الأسعار قبل إصدار أمر الشراء."
        />
      ) : (
        <TableContainer>
          <Table className="min-w-[760px]">
            <thead>
              <tr>
                <Th>الصنف</Th>
                <Th>المقاس</Th>
                <Th>المورّد</Th>
                <Th textAlign="end">سعر الوحدة</Th>
                <Th>صالح حتى</Th>
                <Th>الحالة</Th>
                <Th>ملاحظات</Th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <Tr key={q.id}>
                  <Td>{q.item.name}</Td>
                  <Td className="tnum">{q.size ?? '—'}</Td>
                  <Td className="text-fg-muted">{q.supplier.name}</Td>
                  <Td textAlign="end" className="tnum font-semibold">
                    {q.unitPrice.toFixed(2)}
                    <span className="text-xs font-normal text-fg-muted"> ريال</span>
                  </Td>
                  <Td className="tnum text-fg-muted">{formatDate(q.validUntil)}</Td>
                  <Td>
                    {q.expired ? (
                      <StatusLabel tone="neutral">منتهٍ</StatusLabel>
                    ) : q.isCheapest ? (
                      <StatusLabel tone="success">الأرخص</StatusLabel>
                    ) : (
                      <span className="text-xs text-fg-muted">ساري</span>
                    )}
                  </Td>
                  <Td className="max-w-[200px] text-xs text-fg-muted">{q.notes ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
