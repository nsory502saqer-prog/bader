'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PurchaseOrderStatus } from '@prisma/client';
import { PlusIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, EmptyState, Flash } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import {
  createPurchaseOrder,
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
  saveSupplier,
} from '@/server/actions/purchasing-actions';
import type { PurchaseDemandRow, PurchaseOrderRow, SupplierRow } from '@/server/inventory';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'مسودة',
  ordered: 'مُرسل للمورّد',
  partially_received: 'مستلم جزئيًا',
  received: 'مستلم بالكامل',
  cancelled: 'ملغي',
};

const PO_STATUS_TONES = {
  draft: 'neutral',
  ordered: 'accent',
  partially_received: 'attention',
  received: 'success',
  cancelled: 'neutral',
} as const;

/**
 * لوحة المشتريات.
 *
 * «الاحتياج» ليس قائمة يكتبها أحد: هو تجميع آلي لكل بند قرّر المستودع أنه
 * غير متوفر، مجمَّعًا بالصنف والمقاس عبر كل الطلبات المفتوحة — فيُشترى مرة
 * واحدة بكمية كافية بدل أمر شراء لكل طلب.
 */
export function PurchasingBoard({
  demand,
  orders,
  suppliers,
  canManage,
}: {
  demand: PurchaseDemandRow[];
  orders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({ name: '', phone: '', email: '', notes: '' });

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});

  const selectedCount = Object.values(selected).filter((v) => v > 0).length;

  function toggle(row: PurchaseDemandRow) {
    setSelected((current) => {
      const next = { ...current };
      if (next[row.key]) delete next[row.key];
      else next[row.key] = row.totalNeeded;
      return next;
    });
  }

  function buildOrder() {
    setError(null);
    setSuccess(null);

    const items = demand
      .filter((row) => (selected[row.key] ?? 0) > 0)
      .map((row) => ({
        itemId: row.itemId,
        size: row.size,
        quantity: selected[row.key] ?? row.totalNeeded,
      }));

    if (items.length === 0) {
      setError('اختر بندًا واحدًا على الأقل.');
      return;
    }

    startTransition(async () => {
      const result = await createPurchaseOrder({
        supplierId: supplierId ? Number(supplierId) : null,
        notes: poNotes,
        items,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSelected({});
      setPoNotes('');
      setSuccess('أُنشئ أمر الشراء كمسودة.');
      router.refresh();
    });
  }

  function submitSupplier() {
    setError(null);
    startTransition(async () => {
      const result = await saveSupplier({ ...supplierDraft, isActive: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowSupplierForm(false);
      setSupplierDraft({ name: '', phone: '', email: '', notes: '' });
      setSuccess('أُضيف المورّد.');
      router.refresh();
    });
  }

  function sendToSupplier(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await markPurchaseOrderOrdered(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess('اعتُمد أمر الشراء.');
      router.refresh();
    });
  }

  function submitReceive(order: PurchaseOrderRow) {
    setError(null);
    startTransition(async () => {
      const result = await receivePurchaseOrder({
        purchaseOrderId: order.id,
        lines: order.items.map((i) => ({ id: i.id, receiveQty: receiveQty[i.id] ?? 0 })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReceivingId(null);
      setReceiveQty({});
      setSuccess('سُجّل الاستلام ودخل المخزون.');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {success ? <Flash tone="success">{success}</Flash> : null}

      <Box>
        <BoxHeader>
          <BoxTitle>
            الاحتياج المجمَّع{' '}
            <span className="tnum font-normal text-fg-muted">({demand.length})</span>
          </BoxTitle>
          <span className="text-xs text-fg-muted">
            بنود لم يجدها المستودع في طلبات ما زالت مفتوحة
          </span>
        </BoxHeader>

        {demand.length === 0 ? (
          <EmptyState
            title="لا يوجد احتياج شراء"
            description="كل بنود الطلبات المفتوحة متوفرة في المستودع."
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  {canManage ? <Th textAlign="center">اختيار</Th> : null}
                  <Th>الصنف</Th>
                  <Th>البرنامج</Th>
                  <Th>المقاس</Th>
                  <Th textAlign="center">الاحتياج</Th>
                  <Th>الطلبات</Th>
                </tr>
              </thead>
              <tbody>
                {demand.map((row) => (
                  <Tr key={row.key}>
                    {canManage ? (
                      <Td textAlign="center">
                        <input
                          type="checkbox"
                          aria-label={`اختيار ${row.itemName}`}
                          checked={Boolean(selected[row.key])}
                          onChange={() => toggle(row)}
                        />
                      </Td>
                    ) : null}
                    <Td>{row.itemName}</Td>
                    <Td className="text-fg-muted">{row.programName}</Td>
                    <Td className="tnum">{row.size ?? '—'}</Td>
                    <Td textAlign="center">
                      {canManage && selected[row.key] ? (
                        <Input
                          aria-label={`كمية شراء ${row.itemName}`}
                          type="number"
                          min={1}
                          value={selected[row.key]}
                          onChange={(e) =>
                            setSelected((c) => ({
                              ...c,
                              [row.key]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          className="tnum mx-auto h-[28px] w-[80px] text-start"
                          dir="ltr"
                        />
                      ) : (
                        <span className="tnum font-semibold">
                          {row.totalNeeded} {row.unit}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {row.requests.map((r) => (
                        <Link
                          key={`${r.id}-${r.qty}`}
                          href={`/requests/${r.id}`}
                          className={`tnum me-0.5 hover:underline ${
                            r.urgent ? 'text-fg-danger' : 'text-fg-muted'
                          }`}
                        >
                          {r.requestNo}
                        </Link>
                      ))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}

        {canManage && selectedCount > 0 ? (
          <div className="flex flex-wrap items-end gap-1 border-t border-border bg-canvas-subtle p-2">
            <FormField label="المورّد" htmlFor="po-supplier" className="min-w-[200px]">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— يُحدَّد لاحقًا —</option>
                {suppliers
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </FormField>

            <FormField label="ملاحظات" htmlFor="po-notes" className="min-w-[240px] flex-1">
              <Input value={poNotes} onChange={(e) => setPoNotes(e.target.value)} />
            </FormField>

            <Button type="button" variant="primary" loading={pending} onClick={buildOrder}>
              إنشاء أمر شراء ({selectedCount})
            </Button>
          </div>
        ) : null}
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>
            أوامر الشراء <span className="tnum font-normal text-fg-muted">({orders.length})</span>
          </BoxTitle>
        </BoxHeader>

        {orders.length === 0 ? (
          <EmptyState title="لا توجد أوامر شراء بعد" />
        ) : (
          <ul className="divide-y divide-[var(--borderColor-default)]">
            {orders.map((order) => (
              <li key={order.id} className="p-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <span className="tnum text-sm font-semibold text-fg">{order.poNo}</span>
                    <StatusLabel tone={PO_STATUS_TONES[order.status]}>
                      {PO_STATUS_LABELS[order.status]}
                    </StatusLabel>
                    <span className="text-xs text-fg-muted">
                      {order.supplier?.name ?? 'بلا مورّد'}
                    </span>
                  </span>

                  {canManage ? (
                    <span className="flex items-center gap-1">
                      {order.status === PurchaseOrderStatus.draft ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={pending}
                          onClick={() => sendToSupplier(order.id)}
                        >
                          اعتماد وإرسال
                        </Button>
                      ) : null}

                      {order.status === PurchaseOrderStatus.ordered ||
                      order.status === PurchaseOrderStatus.partially_received ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setReceivingId(receivingId === order.id ? null : order.id);
                            setReceiveQty(
                              Object.fromEntries(
                                order.items.map((i) => [i.id, i.quantity - i.receivedQty]),
                              ),
                            );
                          }}
                        >
                          {receivingId === order.id ? 'إغلاق' : 'استلام'}
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                </div>

                <p className="mt-0.5 text-xs text-fg-muted">
                  أُنشئ <span className="tnum">{formatDate(order.createdAt)}</span> بواسطة{' '}
                  {order.createdBy.name}
                  {order.receivedAt ? (
                    <>
                      {' · اكتمل استلامه '}
                      <span className="tnum">{formatDate(order.receivedAt)}</span>
                    </>
                  ) : null}
                </p>

                <ul className="mt-1 flex flex-wrap gap-0.5">
                  {order.items.map((i) => (
                    <li
                      key={i.id}
                      className="rounded border border-border px-0.5 text-xs text-fg-muted"
                    >
                      {i.item.name}
                      {i.size ? ` · ${i.size}` : ''} · <span className="tnum">{i.receivedQty}</span>
                      /<span className="tnum">{i.quantity}</span>
                    </li>
                  ))}
                </ul>

                {receivingId === order.id ? (
                  <div className="mt-1 rounded border border-border bg-canvas-subtle p-2">
                    <p className="mb-1 text-xs font-semibold text-fg">
                      الكميات المستلمة الآن — تدخل المخزون فور الحفظ
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {order.items.map((i) => (
                        <label key={i.id} className="flex items-center gap-0.5 text-xs text-fg">
                          <span>
                            {i.item.name}
                            {i.size ? ` (${i.size})` : ''}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={i.quantity - i.receivedQty}
                            value={receiveQty[i.id] ?? 0}
                            onChange={(e) =>
                              setReceiveQty((c) => ({
                                ...c,
                                [i.id]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            className="tnum h-[28px] w-[72px] text-start"
                            dir="ltr"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={pending}
                        onClick={() => submitReceive(order)}
                      >
                        حفظ الاستلام
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>
            الموردون <span className="tnum font-normal text-fg-muted">({suppliers.length})</span>
          </BoxTitle>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              leadingIcon={<PlusIcon size={16} />}
              onClick={() => setShowSupplierForm((v) => !v)}
            >
              {showSupplierForm ? 'إخفاء' : 'مورّد جديد'}
            </Button>
          ) : null}
        </BoxHeader>

        {showSupplierForm ? (
          <div className="grid gap-2 border-b border-border p-2 sm:grid-cols-2">
            <FormField label="اسم المورّد" htmlFor="sup-name" required>
              <Input
                value={supplierDraft.name}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })}
              />
            </FormField>
            <FormField label="الجوال" htmlFor="sup-phone">
              <Input
                value={supplierDraft.phone}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, phone: e.target.value })}
                dir="ltr"
                className="tnum text-start"
              />
            </FormField>
            <FormField label="البريد الإلكتروني" htmlFor="sup-email">
              <Input
                value={supplierDraft.email}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, email: e.target.value })}
                dir="ltr"
                className="text-start"
              />
            </FormField>
            <FormField label="ملاحظات" htmlFor="sup-notes">
              <Textarea
                value={supplierDraft.notes}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, notes: e.target.value })}
                rows={2}
              />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="button" variant="primary" loading={pending} onClick={submitSupplier}>
                حفظ المورّد
              </Button>
            </div>
          </div>
        ) : null}

        {suppliers.length === 0 ? (
          <EmptyState title="لا يوجد موردون مسجّلون" />
        ) : (
          <TableContainer>
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>الاسم</Th>
                  <Th>الجوال</Th>
                  <Th>البريد</Th>
                  <Th textAlign="center">أوامر الشراء</Th>
                  <Th>الحالة</Th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <Tr key={s.id}>
                    <Td>{s.name}</Td>
                    <Td className="tnum text-fg-muted">{s.phone ?? '—'}</Td>
                    <Td dir="ltr" className="text-start text-fg-muted">
                      {s.email ?? '—'}
                    </Td>
                    <Td textAlign="center" className="tnum">
                      {s._count.purchaseOrders}
                    </Td>
                    <Td>
                      <StatusLabel tone={s.isActive ? 'success' : 'neutral'}>
                        {s.isActive ? 'نشط' : 'موقوف'}
                      </StatusLabel>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </div>
  );
}
