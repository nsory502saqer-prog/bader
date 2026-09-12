'use server';

import { revalidatePath } from 'next/cache';
import { PurchaseOrderStatus, StockMovementType } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { ensureInventoryRow } from '@/server/stock-core';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * المشتريات.
 *
 * المسار: بنود لم يجدها المستودع → قائمة طلب مجمّعة → أمر شراء لمورّد →
 * استلام يدخل المخزون تلقائيًا بحركة `in`.
 */

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

// ───────────────────────────── الموردون ─────────────────────────────

const supplierSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, 'اسم المورّد قصير جدًا.').max(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export async function saveSupplier(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermissionInAction('purchasing:manage');

    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { id, ...data } = parsed.data;

    const saved = id
      ? await db.supplier.update({ where: { id }, data, select: { id: true } })
      : await db.supplier.create({ data, select: { id: true } });

    await recordAudit({
      userId: user.id,
      action: id ? 'update' : 'create',
      modelType: 'Supplier',
      modelId: String(saved.id),
      newValues: data,
    });

    revalidatePath('/purchasing');
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return fail(error);
  }
}

// ───────────────────────────── عروض الأسعار ─────────────────────────────

const quotationSchema = z.object({
  supplierId: z.coerce.number().int().positive('اختر المورّد.'),
  itemId: z.coerce.number().int().positive('اختر الصنف.'),
  size: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  unitPrice: z.coerce.number().min(0, 'السعر لا يكون سالبًا.').max(1_000_000),
  validUntil: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export async function addQuotation(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermissionInAction('purchasing:manage');

    const parsed = quotationSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const data = parsed.data;

    const created = await db.quotation.create({
      data: {
        supplierId: data.supplierId,
        itemId: data.itemId,
        size: data.size,
        unitPrice: data.unitPrice,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes,
        createdById: user.id,
      },
      select: { id: true },
    });

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'Quotation',
      modelId: String(created.id),
      newValues: data,
    });

    revalidatePath('/purchasing');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

// ───────────────────────────── أوامر الشراء ─────────────────────────────

const createPoSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  items: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        size: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((v) => v || null),
        quantity: z.coerce.number().int().min(1).max(100_000),
        unitCost: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
      }),
    )
    .min(1, 'أضف بندًا واحدًا على الأقل لأمر الشراء.'),
});

/** رقم أمر الشراء `PO-2026-00001` — تسلسل سنوي بقفل على مفتاح السنة. */
async function nextPoNumber(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  now: Date,
): Promise<string> {
  const year = now.getFullYear();
  const pattern = `PO-${year}-`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`po_no:${year}`}))`;

  const last = await tx.purchaseOrder.findFirst({
    where: { poNo: { startsWith: pattern } },
    orderBy: { poNo: 'desc' },
    select: { poNo: true },
  });

  const lastSeq = last ? Number.parseInt(last.poNo.slice(pattern.length), 10) : 0;
  return `${pattern}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(5, '0')}`;
}

export async function createPurchaseOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('purchasing:manage');

    const parsed = createPoSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const data = parsed.data;

    const now = new Date();
    const created = await db.$transaction(async (tx) => {
      const poNo = await nextPoNumber(tx, now);

      return tx.purchaseOrder.create({
        data: {
          poNo,
          supplierId: data.supplierId ?? null,
          notes: data.notes,
          createdById: user.id,
          status: PurchaseOrderStatus.draft,
          items: {
            create: data.items.map((line) => ({
              itemId: line.itemId,
              size: line.size,
              quantity: line.quantity,
              unitCost: line.unitCost ?? null,
            })),
          },
        },
        select: { id: true, poNo: true },
      });
    });

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'PurchaseOrder',
      modelId: created.id,
      newValues: { poNo: created.poNo, items: data.items.length },
    });

    revalidatePath('/purchasing');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

/** اعتماد أمر الشراء وإرساله للمورّد. */
export async function markPurchaseOrderOrdered(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('purchasing:manage');

    const po = await db.purchaseOrder.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, status: true, supplierId: true },
    });
    if (!po) return { ok: false, error: 'أمر الشراء غير موجود.' };
    if (po.status !== PurchaseOrderStatus.draft) {
      return { ok: false, error: 'أمر الشراء لم يعد مسودة.' };
    }
    if (!po.supplierId) return { ok: false, error: 'حدّد المورّد قبل اعتماد أمر الشراء.' };

    await db.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ordered, orderedAt: new Date() },
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'PurchaseOrder',
      modelId: id,
      oldValues: { status: po.status },
      newValues: { status: PurchaseOrderStatus.ordered },
    });

    revalidatePath('/purchasing');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

const receiveSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        receiveQty: z.coerce.number().int().min(0).max(100_000),
      }),
    )
    .min(1),
});

/**
 * استلام مشتريات: يدخل المخزون تلقائيًا بحركة `in` لكل بند.
 * الاستلام جزئي مسموح، وحالة الأمر تتحدّث تبعًا لما اكتمل.
 */
export async function receivePurchaseOrder(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('purchasing:manage');

    const parsed = receiveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { purchaseOrderId, lines } = parsed.data;

    const po = await db.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, ...notDeleted },
      select: {
        id: true,
        poNo: true,
        status: true,
        items: { select: { id: true, itemId: true, size: true, quantity: true, receivedQty: true } },
      },
    });
    if (!po) return { ok: false, error: 'أمر الشراء غير موجود.' };
    if (po.status === PurchaseOrderStatus.cancelled) {
      return { ok: false, error: 'أمر الشراء ملغي.' };
    }

    const byId = new Map(po.items.map((i) => [i.id, i]));
    for (const line of lines) {
      const item = byId.get(line.id);
      if (!item) return { ok: false, error: 'أحد البنود لا ينتمي لأمر الشراء هذا.' };
      if (item.receivedQty + line.receiveQty > item.quantity) {
        return {
          ok: false,
          error: `الكمية المستلمة تتجاوز المطلوبة في أحد البنود (${item.quantity}).`,
        };
      }
    }

    await db.$transaction(async (tx) => {
      for (const line of lines) {
        if (line.receiveQty <= 0) continue;
        const item = byId.get(line.id);
        if (!item) continue;

        await tx.purchaseOrderItem.update({
          where: { id: line.id },
          data: { receivedQty: { increment: line.receiveQty } },
        });

        const row = await ensureInventoryRow(tx, item.itemId, item.size);
        await tx.inventory.update({
          where: { id: row.id },
          data: { quantityOnHand: { increment: line.receiveQty } },
        });

        await tx.stockMovement.create({
          data: {
            itemId: item.itemId,
            size: item.size,
            type: StockMovementType.in,
            quantity: line.receiveQty,
            referenceType: 'purchase_order',
            referenceId: po.poNo,
            userId: user.id,
            note: `استلام على أمر الشراء ${po.poNo}`,
          },
        });
      }

      const refreshed = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId },
        select: { quantity: true, receivedQty: true },
      });
      const complete = refreshed.every((i) => i.receivedQty >= i.quantity);
      const started = refreshed.some((i) => i.receivedQty > 0);

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          status: complete
            ? PurchaseOrderStatus.received
            : started
              ? PurchaseOrderStatus.partially_received
              : po.status,
          receivedAt: complete ? new Date() : null,
        },
      });
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'PurchaseOrder',
      modelId: purchaseOrderId,
      newValues: { received: lines },
    });

    revalidatePath('/purchasing');
    revalidatePath('/inventory');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
