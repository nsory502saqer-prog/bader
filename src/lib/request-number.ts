import type { Prisma } from '@prisma/client';

/**
 * توليد رقم الطلب بصيغة `AID-2026-00001`.
 *
 * التسلسل سنوي ويُحسب داخل نفس المعاملة التي تنشئ الطلب، مع قفل على مستوى
 * الجدول لنطاق السنة، فلا ينتج رقمان متطابقان عند تسجيل طلبين في اللحظة نفسها.
 * القيد UNIQUE على `request_no` هو خط الدفاع الأخير إن أخفق كل ما سبق.
 */

const PREFIX = 'AID';

export async function nextRequestNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const pattern = `${PREFIX}-${year}-`;

  // قفل استشاري على مفتاح السنة: يسلسل المتنافسين على نفس العدّاد فقط.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`request_no:${year}`}))`;

  const last = await tx.request.findFirst({
    where: { requestNo: { startsWith: pattern } },
    orderBy: { requestNo: 'desc' },
    select: { requestNo: true },
  });

  const lastSeq = last ? Number.parseInt(last.requestNo.slice(pattern.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;

  return `${pattern}${String(next).padStart(5, '0')}`;
}

/** رقم أمر الصرف بصيغة `DO-2026-00001` — نفس منطق التسلسل السنوي. */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const pattern = `DO-${year}-`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order_no:${year}`}))`;

  const last = await tx.disbursementOrder.findFirst({
    where: { orderNo: { startsWith: pattern } },
    orderBy: { orderNo: 'desc' },
    select: { orderNo: true },
  });

  const lastSeq = last ? Number.parseInt(last.orderNo.slice(pattern.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;

  return `${pattern}${String(next).padStart(5, '0')}`;
}
