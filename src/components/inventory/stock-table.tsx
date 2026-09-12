'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { adjustStock, receiveStock } from '@/server/actions/inventory-actions';
import type { StockRow } from '@/server/inventory';

/**
 * جدول الأرصدة.
 *
 * العمود الحاسم هو **المتاح** لا الرصيد: المحجوز مخصَّص لطلب قائم ولا يُصرف
 * لغيره، وتنبيه إعادة الطلب يُحسب على المتاح لهذا السبب.
 */
export function StockTable({ rows, canEdit }: { rows: StockRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [mode, setMode] = useState<'in' | 'count'>('in');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');

  function submit(row: StockRow) {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const payload = {
        itemId: row.itemId,
        size: row.size,
        quantity: Number(qty),
        note,
      };

      const result = mode === 'in' ? await receiveStock(payload) : await adjustStock(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpenRow(null);
      setQty('1');
      setNote('');
      setSuccess(mode === 'in' ? 'أُدخل الوارد.' : 'سُجّلت تسوية الجرد.');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {success ? <Flash tone="success">{success}</Flash> : null}

      <TableContainer>
        <Table className="min-w-[780px]">
          <thead>
            <tr>
              <Th>الصنف</Th>
              <Th>البرنامج</Th>
              <Th>المقاس</Th>
              <Th textAlign="center">الرصيد</Th>
              <Th textAlign="center">المحجوز</Th>
              <Th textAlign="center">المتاح</Th>
              <Th textAlign="center">حد إعادة الطلب</Th>
              {canEdit ? <Th textAlign="center">إجراء</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.itemId}-${row.size ?? ''}`;
              return (
                <Tr key={key}>
                  <Td>
                    <span className="flex items-center gap-0.5">
                      {row.belowReorder ? (
                        <AlertIcon size={16} className="shrink-0 text-fg-attention" />
                      ) : null}
                      {row.itemName}
                    </span>
                  </Td>
                  <Td className="text-fg-muted">{row.programName}</Td>
                  <Td className="tnum">{row.size ?? '—'}</Td>
                  <Td textAlign="center" className="tnum">
                    {row.onHand}
                  </Td>
                  <Td textAlign="center" className="tnum text-fg-muted">
                    {row.reserved}
                  </Td>
                  <Td textAlign="center">
                    {row.belowReorder ? (
                      <StatusLabel tone="attention">{row.available}</StatusLabel>
                    ) : (
                      <span className="tnum font-semibold">{row.available}</span>
                    )}
                  </Td>
                  <Td textAlign="center" className="tnum text-fg-muted">
                    {row.reorderLevel || '—'}
                  </Td>
                  {canEdit ? (
                    <Td textAlign="center">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setOpenRow(openRow === key ? null : key);
                          setMode('in');
                          setQty('1');
                          setNote('');
                        }}
                      >
                        {openRow === key ? 'إغلاق' : 'تحريك'}
                      </Button>
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableContainer>

      {canEdit && openRow ? (
        <MovementForm
          row={rows.find((r) => `${r.itemId}-${r.size ?? ''}` === openRow)!}
          mode={mode}
          setMode={setMode}
          qty={qty}
          setQty={setQty}
          note={note}
          setNote={setNote}
          pending={pending}
          onSubmit={submit}
          onCancel={() => setOpenRow(null)}
        />
      ) : null}
    </div>
  );
}

function MovementForm({
  row,
  mode,
  setMode,
  qty,
  setQty,
  note,
  setNote,
  pending,
  onSubmit,
  onCancel,
}: {
  row: StockRow;
  mode: 'in' | 'count';
  setMode: (m: 'in' | 'count') => void;
  qty: string;
  setQty: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  pending: boolean;
  onSubmit: (row: StockRow) => void;
  onCancel: () => void;
}) {
  return (
    <div className="m-2 rounded border border-border bg-canvas-subtle p-2">
      <p className="mb-1 text-sm font-semibold text-fg">
        {row.itemName}
        {row.size ? ` · ${row.size}` : ''}
      </p>

      <div className="flex flex-wrap items-end gap-1">
        <div className="min-w-[160px]">
          <label htmlFor="movement-mode" className="mb-0.5 block text-xs font-semibold text-fg">
            نوع الحركة
          </label>
          <Select
            id="movement-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'in' | 'count')}
          >
            <option value="in">إدخال وارد</option>
            <option value="count">تسوية جرد</option>
          </Select>
        </div>

        <div className="w-[120px]">
          <label htmlFor="movement-qty" className="mb-0.5 block text-xs font-semibold text-fg">
            {mode === 'in' ? 'الكمية الواردة' : 'الرصيد المعدود'}
          </label>
          <Input
            id="movement-qty"
            type="number"
            min={mode === 'in' ? 1 : 0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            dir="ltr"
            className="tnum text-start"
          />
        </div>

        <div className="min-w-[220px] flex-1">
          <label htmlFor="movement-note" className="mb-0.5 block text-xs font-semibold text-fg">
            ملاحظة{mode === 'count' ? ' (إلزامية للتسوية)' : ''}
          </label>
          <Input
            id="movement-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'in' ? 'مصدر الوارد' : 'سبب اختلاف الرصيد'}
          />
        </div>

        <Button
          type="button"
          variant="primary"
          loading={pending}
          disabled={mode === 'count' && note.trim().length === 0}
          onClick={() => onSubmit(row)}
        >
          حفظ الحركة
        </Button>
        <Button type="button" onClick={onCancel} disabled={pending}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
