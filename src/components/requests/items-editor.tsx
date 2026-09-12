'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { RequestItemStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { updateRequestItems } from '@/server/actions/request-actions';

export const ITEM_STATUS_LABELS: Record<RequestItemStatus, string> = {
  pending: 'قيد الانتظار',
  in_stock: 'متوفر بالمستودع',
  to_purchase: 'يحتاج شراء',
  issued: 'صُرف',
  cancelled: 'ملغي',
};

export type EditableItem = {
  id: string;
  name: string;
  programName: string;
  unit: string;
  size: string | null;
  quantity: number;
  itemStatus: RequestItemStatus;
  fulfilledQty: number;
  note: string;
};

export function ItemsEditor({
  requestId,
  items,
  readOnly,
}: {
  requestId: string;
  items: EditableItem[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /**
   * مزامنة الجدول مع الخادم.
   *
   * الصفوف تعيش في حالة محلية ليحرّرها الموظف قبل الحفظ، لكن الخادم قد يغيّرها
   * من تحته: حجز المستودع يحوّل البنود إلى «متوفر» أو «يحتاج شراء». بلا هذه
   * المزامنة تبقى الحالة الأولى معروضة بعد `router.refresh()` فيرى الموظف
   * بيانات قديمة. المقارنة بالبصمة لا بمرجع المصفوفة، لأن المصفوفة جديدة في
   * كل رسم — ولو قارنّا بالمرجع لضاع كل تعديل غير محفوظ عند أي إعادة رسم.
   */
  const signature = JSON.stringify(items);
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) {
    setSyncedSignature(signature);
    setRows(items);
  }

  const dirty = JSON.stringify(rows) !== signature;

  function patch(id: string, changes: Partial<EditableItem>) {
    setSaved(false);
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRequestItems({
        requestId,
        items: rows.map((r) => ({
          id: r.id,
          quantity: r.quantity,
          itemStatus: r.itemStatus,
          fulfilledQty: r.fulfilledQty,
          note: r.note,
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {saved && !dirty ? <Flash tone="success">حُفظت البنود.</Flash> : null}

      <TableContainer>
        <Table className="min-w-[700px]">
          <thead>
            <tr>
              <Th>الصنف</Th>
              <Th>البرنامج</Th>
              <Th>المقاس</Th>
              <Th>المطلوب</Th>
              <Th>المصروف</Th>
              <Th>الحالة</Th>
              <Th>ملاحظة</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>{row.name}</Td>
                <Td className="text-fg-muted">{row.programName}</Td>
                <Td className="tnum">{row.size ?? '—'}</Td>
                <Td>
                  {readOnly ? (
                    <span className="tnum">
                      {row.quantity} {row.unit}
                    </span>
                  ) : (
                    <Input
                      aria-label={`الكمية المطلوبة من ${row.name}`}
                      type="number"
                      min={1}
                      max={999}
                      value={row.quantity}
                      onChange={(e) =>
                        patch(row.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="tnum h-[28px] w-[72px] text-start"
                      dir="ltr"
                    />
                  )}
                </Td>
                <Td>
                  {readOnly ? (
                    <span className="tnum">{row.fulfilledQty}</span>
                  ) : (
                    <Input
                      aria-label={`الكمية المصروفة من ${row.name}`}
                      type="number"
                      min={0}
                      max={row.quantity}
                      value={row.fulfilledQty}
                      onChange={(e) =>
                        patch(row.id, { fulfilledQty: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="tnum h-[28px] w-[72px] text-start"
                      dir="ltr"
                    />
                  )}
                </Td>
                <Td>
                  {readOnly ? (
                    ITEM_STATUS_LABELS[row.itemStatus]
                  ) : (
                    <Select
                      aria-label={`حالة ${row.name}`}
                      value={row.itemStatus}
                      onChange={(e) =>
                        patch(row.id, { itemStatus: e.target.value as RequestItemStatus })
                      }
                      className="h-[28px] w-[150px]"
                    >
                      {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  {readOnly ? (
                    (row.note ?? '—')
                  ) : (
                    <Input
                      aria-label={`ملاحظة ${row.name}`}
                      value={row.note}
                      onChange={(e) => patch(row.id, { note: e.target.value })}
                      className="h-[28px] min-w-[140px]"
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>

      {!readOnly ? (
        <div className="flex items-center gap-1 px-2 pb-2">
          <Button type="button" variant="primary" loading={pending} disabled={!dirty} onClick={save}>
            حفظ البنود
          </Button>
          {dirty ? <span className="text-xs text-fg-attention">توجد تعديلات غير محفوظة.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
