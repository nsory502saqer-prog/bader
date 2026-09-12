'use server';

import { revalidatePath } from 'next/cache';
import { StockMovementType } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { ensureInventoryRow } from '@/server/stock-core';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * حركات المخزون.
 *
 * قاعدة واحدة تحكم هذا الملف: **لا يتغيّر رصيد إلا ومعه صف في
 * `stock_movements`**. الرصيد الحالي نتيجة، والحركات هي المصدر الذي يُراجَع
 * ويُدقَّق. لذلك كل تعديل هنا داخل معاملة تكتب الاثنين معًا.
 */

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

const movementSchema = z.object({
  itemId: z.coerce.number().int().positive('اختر الصنف.'),
  size: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  quantity: z.coerce.number().int().min(1, 'الكمية لا تقل عن 1.').max(100_000),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

/** إدخال وارد للمستودع. */
export async function receiveStock(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('inventory:update');

    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { itemId, size, quantity, note } = parsed.data;

    const item = await db.item.findFirst({
      where: { id: itemId, ...notDeleted },
      select: { id: true, name: true, hasSizes: true },
    });
    if (!item) return { ok: false, error: 'الصنف غير موجود.' };
    if (item.hasSizes && !size) return { ok: false, error: `الصنف «${item.name}» يحتاج مقاسًا.` };
    if (!item.hasSizes && size) return { ok: false, error: `الصنف «${item.name}» ليس له مقاسات.` };

    await db.$transaction(async (tx) => {
      const row = await ensureInventoryRow(tx, itemId, size);

      await tx.inventory.update({
        where: { id: row.id },
        data: { quantityOnHand: { increment: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          itemId,
          size,
          type: StockMovementType.in,
          quantity,
          referenceType: 'manual_receipt',
          userId: user.id,
          note,
        },
      });
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Inventory',
      modelId: `${itemId}:${size ?? '-'}`,
      newValues: { type: 'in', quantity, note },
    });

    revalidatePath('/inventory');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

/**
 * تسوية جرد: تضبط الرصيد على رقم مُعدّ فعليًا في المستودع.
 * تُسجَّل كحركة `adjust` بالفارق، فيبقى سبب اختلاف الرصيد مقروءًا لاحقًا.
 */
export async function adjustStock(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('inventory:update');

    const schema = movementSchema.extend({
      quantity: z.coerce.number().int().min(0, 'الرصيد لا يكون سالبًا.').max(100_000),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { itemId, size, quantity: countedQty, note } = parsed.data;

    if (!note) return { ok: false, error: 'تسوية الجرد تتطلب كتابة السبب.' };

    await db.$transaction(async (tx) => {
      const row = await ensureInventoryRow(tx, itemId, size);
      const delta = countedQty - row.quantityOnHand;
      if (delta === 0) return;

      if (countedQty < row.quantityReserved) {
        throw new Error(
          `الرصيد الجديد (${countedQty}) أقل من المحجوز (${row.quantityReserved}). حرّر الحجز أولًا.`,
        );
      }

      await tx.inventory.update({
        where: { id: row.id },
        data: { quantityOnHand: countedQty },
      });

      await tx.stockMovement.create({
        data: {
          itemId,
          size,
          type: StockMovementType.adjust,
          quantity: delta,
          referenceType: 'stock_count',
          userId: user.id,
          note,
        },
      });
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Inventory',
      modelId: `${itemId}:${size ?? '-'}`,
      newValues: { type: 'adjust', countedQty, note },
    });

    revalidatePath('/inventory');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

/**
 * حجز بنود طلب على المخزون.
 *
 * الحجز لا يخصم الرصيد، بل يرفع `quantity_reserved` فيقلّ **المتاح**. الخصم
 * الفعلي يقع عند إصدار أمر الصرف. هكذا لا يُصرف صنف محجوز لطلب آخر، ولا
 * يختفي من الجرد قبل أن يخرج من المستودع فعلًا.
 */
export async function reserveRequestItems(requestId: string): Promise<ActionResult<{ reserved: number }>> {
  try {
    const user = await requirePermissionInAction('inventory:update');

    const request = await db.request.findFirst({
      where: { id: requestId, ...notDeleted },
      select: {
        id: true,
        items: {
          where: { ...notDeleted, itemStatus: { in: ['pending', 'in_stock'] } },
          select: { id: true, itemId: true, size: true, quantity: true, fulfilledQty: true },
        },
      },
    });
    if (!request) return { ok: false, error: 'الطلب غير موجود.' };

    let reserved = 0;
    const shortages: string[] = [];

    await db.$transaction(async (tx) => {
      for (const line of request.items) {
        if (!line.itemId) continue;
        const needed = line.quantity - line.fulfilledQty;
        if (needed <= 0) continue;

        const row = await ensureInventoryRow(tx, line.itemId, line.size);
        const available = row.quantityOnHand - row.quantityReserved;

        if (available >= needed) {
          await tx.inventory.update({
            where: { id: row.id },
            data: { quantityReserved: { increment: needed } },
          });
          await tx.requestItem.update({
            where: { id: line.id },
            data: { itemStatus: 'in_stock' },
          });
          reserved += 1;
        } else {
          // غير متوفر: يتحوّل تلقائيًا إلى قائمة الشراء بدل أن يبقى معلّقًا.
          await tx.requestItem.update({
            where: { id: line.id },
            data: { itemStatus: 'to_purchase' },
          });
          const item = await tx.item.findUnique({
            where: { id: line.itemId },
            select: { name: true },
          });
          shortages.push(`${item?.name ?? 'صنف'}${line.size ? ` (${line.size})` : ''}`);
        }
      }
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Request',
      modelId: requestId,
      newValues: { action: 'reserve', reserved, shortages },
    });

    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/inventory');
    revalidatePath('/purchasing');

    if (shortages.length > 0) {
      return {
        ok: false,
        error: `حُجز ${reserved} بندًا. غير متوفر وحُوّل للشراء: ${shortages.join(' · ')}`,
      };
    }

    return { ok: true, data: { reserved } };
  } catch (error) {
    return fail(error);
  }
}

