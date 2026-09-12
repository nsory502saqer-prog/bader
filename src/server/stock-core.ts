import { DisbursementStatus, Prisma, StockMovementType } from '@prisma/client';
import { nextOrderNumber } from '@/lib/request-number';

/**
 * عمليات المخزون الداخلية.
 *
 * هذه الدوال تأخذ معاملة قاعدة بيانات (`tx`) وتُستدعى من داخل الخادم فقط،
 * فهي **ليست** Server Actions ولا تعيش في ملف `'use server'` — لو عاشت هناك
 * لسجّلها Next.js كنقاط استدعاء من المتصفح، وهو ما لا معنى له لدالة تستقبل
 * معاملة، وخطر لا داعي له.
 *
 * القاعدة الثابتة: لا يتغيّر رصيد إلا ومعه صف في `stock_movements`.
 */

export async function ensureInventoryRow(
  tx: Prisma.TransactionClient,
  itemId: number,
  size: string | null,
) {
  const existing = await tx.inventory.findFirst({ where: { itemId, size } });
  if (existing) return existing;
  return tx.inventory.create({ data: { itemId, size } });
}

/**
 * إصدار أمر الصرف: إنشاء الأمر، وخصم الأرصدة، وتحرير الحجز المقابل،
 * وكتابة حركة خروج لكل بند.
 *
 * تُستدعى حصرًا من `transitionRequest` عند الانتقال إلى `order_issued`،
 * فلا يوجد مسار في النظام يخصم المخزون دون المرور بآلة الحالات.
 */
export async function issueDisbursementOrder(args: {
  tx: Prisma.TransactionClient;
  requestId: string;
  userId: string;
  now: Date;
}): Promise<{ orderId: string; orderNo: string }> {
  const { tx, requestId, userId, now } = args;

  const items = await tx.requestItem.findMany({
    where: { requestId, deletedAt: null, itemStatus: { not: 'cancelled' } },
    select: {
      id: true,
      itemId: true,
      size: true,
      quantity: true,
      fulfilledQty: true,
      item: { select: { name: true } },
    },
  });

  if (items.length === 0) {
    throw new Error('لا يمكن إصدار أمر صرف لطلب بلا بنود قابلة للصرف.');
  }

  const orderNo = await nextOrderNumber(tx, now);

  const order = await tx.disbursementOrder.create({
    data: {
      orderNo,
      requestId,
      issuedAt: now,
      issuedById: userId,
      status: DisbursementStatus.issued,
    },
    select: { id: true, orderNo: true },
  });

  for (const line of items) {
    if (!line.itemId) continue;

    // الكمية المصروفة إن حدّدها المستودع، وإلا فالمطلوبة كاملة.
    const issueQty = line.fulfilledQty > 0 ? line.fulfilledQty : line.quantity;
    if (issueQty <= 0) continue;

    const row = await tx.inventory.findFirst({
      where: { itemId: line.itemId, size: line.size },
    });

    if (!row || row.quantityOnHand < issueQty) {
      throw new Error(
        `رصيد «${line.item?.name ?? 'الصنف'}»${line.size ? ` (${line.size})` : ''} لا يكفي: ` +
          `المطلوب ${issueQty} والمتوفر ${row?.quantityOnHand ?? 0}.`,
      );
    }

    await tx.inventory.update({
      where: { id: row.id },
      data: {
        quantityOnHand: { decrement: issueQty },
        quantityReserved: Math.max(0, row.quantityReserved - issueQty),
      },
    });

    await tx.stockMovement.create({
      data: {
        itemId: line.itemId,
        size: line.size,
        type: StockMovementType.out,
        quantity: issueQty,
        referenceType: 'disbursement_order',
        referenceId: order.orderNo,
        userId,
        note: `صرف على أمر ${order.orderNo}`,
      },
    });

    await tx.requestItem.update({
      where: { id: line.id },
      data: { itemStatus: 'issued', fulfilledQty: issueQty },
    });
  }

  return { orderId: order.id, orderNo: order.orderNo };
}

/** تحرير حجز طلب لن يُصرف (مرفوض أو ملغي) فلا يبقى مخزون معلّقًا بلا سبب. */
export async function releaseRequestReservations(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  const items = await tx.requestItem.findMany({
    where: { requestId, deletedAt: null, itemStatus: 'in_stock' },
    select: { itemId: true, size: true, quantity: true, fulfilledQty: true },
  });

  for (const line of items) {
    if (!line.itemId) continue;
    const outstanding = line.quantity - line.fulfilledQty;
    if (outstanding <= 0) continue;

    const row = await tx.inventory.findFirst({
      where: { itemId: line.itemId, size: line.size },
    });
    if (!row) continue;

    await tx.inventory.update({
      where: { id: row.id },
      data: { quantityReserved: Math.max(0, row.quantityReserved - outstanding) },
    });
  }
}
