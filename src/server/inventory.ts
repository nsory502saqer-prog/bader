import type { Prisma } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';

/** استعلامات المستودع (قراءة فقط). */

export type StockRow = {
  inventoryId: string;
  itemId: number;
  itemName: string;
  programName: string;
  unit: string;
  size: string | null;
  onHand: number;
  reserved: number;
  /** المتاح فعليًا للصرف: الرصيد ناقص المحجوز */
  available: number;
  reorderLevel: number;
  belowReorder: boolean;
};

export async function listStock(params: {
  programId?: number | null;
  q?: string;
  onlyBelowReorder?: boolean;
}): Promise<StockRow[]> {
  const where: Prisma.InventoryWhereInput = {
    item: {
      ...notDeleted,
      isActive: true,
      ...(params.programId ? { programId: params.programId } : {}),
      ...(params.q?.trim() ? { name: { contains: params.q.trim() } } : {}),
    },
  };

  const rows = await db.inventory.findMany({
    where,
    select: {
      id: true,
      size: true,
      quantityOnHand: true,
      quantityReserved: true,
      item: {
        select: {
          id: true,
          name: true,
          unit: true,
          reorderLevel: true,
          program: { select: { name: true } },
        },
      },
    },
    orderBy: [{ item: { name: 'asc' } }, { size: 'asc' }],
  });

  const mapped = rows.map((row): StockRow => {
    const available = row.quantityOnHand - row.quantityReserved;
    return {
      inventoryId: row.id,
      itemId: row.item.id,
      itemName: row.item.name,
      programName: row.item.program.name,
      unit: row.item.unit,
      size: row.size,
      onHand: row.quantityOnHand,
      reserved: row.quantityReserved,
      available,
      reorderLevel: row.item.reorderLevel,
      // التنبيه على الرصيد المتاح لا الإجمالي: المحجوز مخصَّص لطلب قائم.
      belowReorder: row.item.reorderLevel > 0 && available <= row.item.reorderLevel,
    };
  });

  return params.onlyBelowReorder ? mapped.filter((r) => r.belowReorder) : mapped;
}

export async function countBelowReorder(): Promise<number> {
  const rows = await listStock({ onlyBelowReorder: true });
  return rows.length;
}

export async function listStockMovements(limit = 100) {
  return db.stockMovement.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      quantity: true,
      size: true,
      referenceType: true,
      referenceId: true,
      note: true,
      createdAt: true,
      item: { select: { id: true, name: true, unit: true } },
      user: { select: { name: true } },
    },
  });
}

export type StockMovementRow = Awaited<ReturnType<typeof listStockMovements>>[number];

/** البنود التي قرّر المستودع أنها تحتاج شراء، مجمّعة بالصنف والمقاس. */
export async function listPurchaseDemand() {
  const rows = await db.requestItem.findMany({
    where: {
      ...notDeleted,
      itemStatus: 'to_purchase',
      request: { ...notDeleted, closedAt: null },
    },
    select: {
      id: true,
      size: true,
      quantity: true,
      fulfilledQty: true,
      item: {
        select: { id: true, name: true, unit: true, program: { select: { name: true } } },
      },
      request: { select: { id: true, requestNo: true, priority: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const grouped = new Map<
    string,
    {
      key: string;
      itemId: number;
      itemName: string;
      programName: string;
      unit: string;
      size: string | null;
      totalNeeded: number;
      requests: { id: string; requestNo: string; qty: number; urgent: boolean }[];
    }
  >();

  for (const row of rows) {
    if (!row.item) continue;
    const outstanding = row.quantity - row.fulfilledQty;
    if (outstanding <= 0) continue;

    const key = `${row.item.id}|${row.size ?? ''}`;
    const existing = grouped.get(key);
    const entry = {
      id: row.request.id,
      requestNo: row.request.requestNo,
      qty: outstanding,
      urgent: row.request.priority === 'urgent',
    };

    if (existing) {
      existing.totalNeeded += outstanding;
      existing.requests.push(entry);
    } else {
      grouped.set(key, {
        key,
        itemId: row.item.id,
        itemName: row.item.name,
        programName: row.item.program.name,
        unit: row.item.unit,
        size: row.size,
        totalNeeded: outstanding,
        requests: [entry],
      });
    }
  }

  return [...grouped.values()].sort((a, b) => b.totalNeeded - a.totalNeeded);
}

export type PurchaseDemandRow = Awaited<ReturnType<typeof listPurchaseDemand>>[number];

export async function listPurchaseOrders() {
  return db.purchaseOrder.findMany({
    where: notDeleted,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      poNo: true,
      status: true,
      orderedAt: true,
      receivedAt: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      items: {
        select: {
          id: true,
          size: true,
          quantity: true,
          receivedQty: true,
          unitCost: true,
          item: { select: { id: true, name: true, unit: true } },
        },
      },
    },
  });
}

export type PurchaseOrderRow = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export async function listSuppliers() {
  return db.supplier.findMany({
    where: notDeleted,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      notes: true,
      isActive: true,
      _count: { select: { purchaseOrders: true, quotations: true } },
    },
  });
}

export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function listQuotations() {
  const rows = await db.quotation.findMany({
    where: notDeleted,
    // عند تساوي السعر يفوز الأحدث: عرض اليوم بنفس سعر عرض العام الماضي هو
    // الأوثق، لأن القديم قد يكون تجاوزه المورّد وإن لم يُسجَّل له تاريخ انتهاء.
    orderBy: [{ itemId: 'asc' }, { unitPrice: 'asc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      size: true,
      unitPrice: true,
      validUntil: true,
      notes: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      item: { select: { id: true, name: true, unit: true } },
    },
  });

  const now = new Date();
  const cheapestSeen = new Set<string>();

  // `Decimal` من Prisma لا يعبر حدّ الخادم إلى العميل، فيُحوَّل إلى رقم هنا.
  return rows.map((row) => {
    const key = `${row.item.id}|${row.size ?? ''}`;
    const expired = row.validUntil !== null && row.validUntil < now;

    // الأرخص لكل صنف/مقاس: الصفوف مرتّبة بالسعر تصاعديًا، فأول غير منتهٍ
    // هو الأرخص الصالح. العرض المنتهي لا يُوصى به مهما كان سعره.
    const isCheapest = !expired && !cheapestSeen.has(key);
    if (isCheapest) cheapestSeen.add(key);

    return {
      id: row.id,
      size: row.size,
      unitPrice: Number(row.unitPrice),
      validUntil: row.validUntil,
      notes: row.notes,
      createdAt: row.createdAt,
      supplier: row.supplier,
      item: row.item,
      expired,
      isCheapest,
    };
  });
}

export type QuotationRow = Awaited<ReturnType<typeof listQuotations>>[number];
