import { db, notDeleted } from '@/lib/db';

/** استعلامات أوامر الصرف (قراءة فقط). */

export async function listDisbursementOrders() {
  return db.disbursementOrder.findMany({
    where: notDeleted,
    orderBy: { issuedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      orderNo: true,
      status: true,
      issuedAt: true,
      deliveredAt: true,
      receivedByName: true,
      issuedBy: { select: { name: true } },
      request: {
        select: {
          id: true,
          requestNo: true,
          beneficiary: {
            select: { id: true, fullName: true, nationalId: true, phone: true },
          },
        },
      },
    },
  });
}

export type DisbursementRow = Awaited<ReturnType<typeof listDisbursementOrders>>[number];

export async function getDisbursementOrder(id: string) {
  return db.disbursementOrder.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      orderNo: true,
      status: true,
      issuedAt: true,
      deliveredAt: true,
      receivedByName: true,
      issuedBy: { select: { name: true } },
      request: {
        select: {
          id: true,
          requestNo: true,
          notes: true,
          beneficiary: {
            select: {
              id: true,
              fullName: true,
              nationalId: true,
              phone: true,
              city: { select: { name: true } },
              district: { select: { name: true } },
            },
          },
          items: {
            where: notDeleted,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              size: true,
              quantity: true,
              fulfilledQty: true,
              itemStatus: true,
              legacyText: true,
              item: {
                select: { id: true, name: true, unit: true, program: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });
}

export type DisbursementDetail = NonNullable<Awaited<ReturnType<typeof getDisbursementOrder>>>;

/** الإعدادات التي تظهر في ترويسة أمر الصرف المطبوع. */
export async function getOrgSettings(): Promise<{ name: string; region: string }> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['org.name', 'org.region'] } },
    select: { key: true, value: true },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: string, fallback: string) => {
    const value = map.get(key);
    return typeof value === 'string' ? value : fallback;
  };

  return {
    name: read('org.name', 'جمعية بادر للأجهزة الطبية'),
    region: read('org.region', 'منطقة مكة المكرمة'),
  };
}
