'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PlusIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, EmptyState, Flash } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { saveItem, saveLookup } from '@/server/actions/catalog-actions';

export type CatalogItem = {
  id: number;
  name: string;
  unit: string;
  hasSizes: boolean;
  isConsumable: boolean;
  reorderLevel: number;
  isActive: boolean;
  programId: number;
  programName: string;
};

export type LookupRow = { id: number; name: string; isActive: boolean; cityId?: number | null };

const EMPTY_ITEM = {
  id: undefined as number | undefined,
  programId: '',
  name: '',
  unit: 'حبة',
  hasSizes: false,
  reorderLevel: '0',
  isActive: true,
};

/**
 * إدارة الكتالوج والقوائم المرجعية.
 *
 * هذه الشاشة هي ما يمنع عودة الإدخال الحر: الصنف الجديد يُضاف هنا فيصير
 * خيارًا في القوائم المنسدلة، بدل أن يكتبه الموظف نصًا فتتكاثر صياغاته كما
 * حدث في ملف Excel.
 */
export function CatalogManager({
  items,
  programs,
  cities,
  districts,
  incomeSources,
}: {
  items: CatalogItem[];
  programs: { id: number; name: string }[];
  cities: LookupRow[];
  districts: (LookupRow & { cityId: number })[];
  incomeSources: LookupRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [itemDraft, setItemDraft] = useState(EMPTY_ITEM);
  const [showItemForm, setShowItemForm] = useState(false);
  const [programFilter, setProgramFilter] = useState('');

  const [lookupKind, setLookupKind] = useState<'city' | 'district' | 'incomeSource'>('city');
  const [lookupName, setLookupName] = useState('');
  const [lookupCityId, setLookupCityId] = useState('');

  const visibleItems = programFilter
    ? items.filter((i) => String(i.programId) === programFilter)
    : items;

  function submitItem() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveItem({
        ...itemDraft,
        reorderLevel: Number(itemDraft.reorderLevel) || 0,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowItemForm(false);
      setItemDraft(EMPTY_ITEM);
      setSuccess('حُفظ الصنف.');
      router.refresh();
    });
  }

  function submitLookup() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveLookup({
        kind: lookupKind,
        name: lookupName,
        cityId: lookupKind === 'district' ? Number(lookupCityId) || null : null,
        isActive: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLookupName('');
      setSuccess('حُفظت القيمة في القائمة المرجعية.');
      router.refresh();
    });
  }

  function edit(item: CatalogItem) {
    setShowItemForm(true);
    setItemDraft({
      id: item.id,
      programId: String(item.programId),
      name: item.name,
      unit: item.unit,
      hasSizes: item.hasSizes,
      reorderLevel: String(item.reorderLevel),
      isActive: item.isActive,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {success ? <Flash tone="success">{success}</Flash> : null}

      <Box>
        <BoxHeader>
          <BoxTitle>
            الأصناف <span className="tnum font-normal text-fg-muted">({items.length})</span>
          </BoxTitle>
          <Button
            type="button"
            size="sm"
            leadingIcon={<PlusIcon size={16} />}
            onClick={() => {
              setShowItemForm((v) => !v);
              setItemDraft(EMPTY_ITEM);
            }}
          >
            {showItemForm ? 'إخفاء النموذج' : 'صنف جديد'}
          </Button>
        </BoxHeader>

        {showItemForm ? (
          <div className="grid gap-2 border-b border-border p-2 sm:grid-cols-3">
            <FormField label="البرنامج" htmlFor="item-program" required>
              <Select
                value={itemDraft.programId}
                onChange={(e) => setItemDraft({ ...itemDraft, programId: e.target.value })}
              >
                <option value="">اختر…</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="اسم الصنف" htmlFor="item-name" required className="sm:col-span-2">
              <Input
                value={itemDraft.name}
                onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })}
              />
            </FormField>

            <FormField label="الوحدة" htmlFor="item-unit" hint="حبة · جهاز · كيس · علبة">
              <Input
                value={itemDraft.unit}
                onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })}
              />
            </FormField>

            <FormField
              label="حد إعادة الطلب"
              htmlFor="item-reorder"
              hint="صفر = بلا تنبيه"
            >
              <Input
                type="number"
                min={0}
                value={itemDraft.reorderLevel}
                onChange={(e) => setItemDraft({ ...itemDraft, reorderLevel: e.target.value })}
                dir="ltr"
                className="tnum text-start"
              />
            </FormField>

            <div className="flex flex-col justify-end gap-1 pb-0.5">
              <label className="flex items-center gap-0.5 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={itemDraft.hasSizes}
                  onChange={(e) => setItemDraft({ ...itemDraft, hasSizes: e.target.checked })}
                />
                له مقاسات (S · M · L · XL · XXL)
              </label>
              <label className="flex items-center gap-0.5 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={itemDraft.isActive}
                  onChange={(e) => setItemDraft({ ...itemDraft, isActive: e.target.checked })}
                />
                نشط ويظهر في قوائم الاختيار
              </label>
            </div>

            <div className="sm:col-span-3">
              <Button type="button" variant="primary" loading={pending} onClick={submitItem}>
                {itemDraft.id ? 'حفظ التعديلات' : 'إضافة الصنف'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="border-b border-border p-2">
          <FormField label="تصفية بالبرنامج" htmlFor="cat-filter" className="max-w-[220px]">
            <Select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
              <option value="">كل البرامج</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <TableContainer>
          <Table className="min-w-[700px]">
            <thead>
              <tr>
                <Th>الصنف</Th>
                <Th>البرنامج</Th>
                <Th>الوحدة</Th>
                <Th textAlign="center">مقاسات</Th>
                <Th textAlign="center">استهلاكي</Th>
                <Th textAlign="center">حد الطلب</Th>
                <Th>الحالة</Th>
                <Th textAlign="center">إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.name}</Td>
                  <Td className="text-fg-muted">{item.programName}</Td>
                  <Td className="text-fg-muted">{item.unit}</Td>
                  <Td textAlign="center">{item.hasSizes ? 'نعم' : '—'}</Td>
                  <Td textAlign="center">{item.isConsumable ? 'نعم' : '—'}</Td>
                  <Td textAlign="center" className="tnum">
                    {item.reorderLevel || '—'}
                  </Td>
                  <Td>
                    <StatusLabel tone={item.isActive ? 'success' : 'neutral'}>
                      {item.isActive ? 'نشط' : 'معطَّل'}
                    </StatusLabel>
                  </Td>
                  <Td textAlign="center">
                    <Button type="button" size="sm" onClick={() => edit(item)}>
                      تعديل
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>القوائم المرجعية</BoxTitle>
          <span className="text-xs text-fg-muted">
            ما يُضاف هنا يصير خيارًا في القوائم المنسدلة — لا حقل نصي حر في أي شاشة
          </span>
        </BoxHeader>

        <div className="flex flex-wrap items-end gap-1 border-b border-border p-2">
          <FormField label="النوع" htmlFor="lookup-kind" className="min-w-[160px]">
            <Select
              value={lookupKind}
              onChange={(e) =>
                setLookupKind(e.target.value as 'city' | 'district' | 'incomeSource')
              }
            >
              <option value="city">مدينة</option>
              <option value="district">حي</option>
              <option value="incomeSource">مصدر دخل</option>
            </Select>
          </FormField>

          {lookupKind === 'district' ? (
            <FormField label="المدينة" htmlFor="lookup-city" required className="min-w-[160px]">
              <Select value={lookupCityId} onChange={(e) => setLookupCityId(e.target.value)}>
                <option value="">اختر…</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField label="الاسم" htmlFor="lookup-name" required className="min-w-[200px] flex-1">
            <Input value={lookupName} onChange={(e) => setLookupName(e.target.value)} />
          </FormField>

          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={lookupName.trim().length < 2}
            onClick={submitLookup}
          >
            إضافة
          </Button>
        </div>

        <div className="grid gap-0 divide-y divide-[var(--borderColor-default)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <LookupColumn title="المدن" rows={cities} />
          <LookupColumn
            title="الأحياء"
            rows={districts.slice(0, 60)}
            note={districts.length > 60 ? `يُعرض 60 من ${districts.length}` : undefined}
          />
          <LookupColumn title="مصادر الدخل" rows={incomeSources} />
        </div>
      </Box>
    </div>
  );
}

function LookupColumn({
  title,
  rows,
  note,
}: {
  title: string;
  rows: LookupRow[];
  note?: string;
}) {
  return (
    <div>
      <p className="border-b border-border bg-canvas-subtle px-2 py-1 text-xs font-semibold text-fg-muted">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <EmptyState title="فارغة" />
      ) : (
        <ul className="scroll-subtle max-h-[280px] overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-1 px-2 py-0.5 text-sm text-fg"
            >
              <span className="truncate">{row.name}</span>
              {!row.isActive ? <StatusLabel tone="neutral">معطَّل</StatusLabel> : null}
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="px-2 py-1 text-xs text-fg-muted">{note}</p> : null}
    </div>
  );
}
