import { RequestStatus } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';
import { STATUS_LABELS } from '@/lib/workflow';

/**
 * التقارير.
 *
 * كلها مبنية على `status_history` و`request_items`، وهما بالضبط ما لم يكن
 * موجودًا في ملف Excel — فهذه الأرقام كان استخراجها مستحيلًا قبل النظام.
 */

export type Period = { from: Date | null; to: Date | null };

export function periodWhere(period: Period) {
  if (!period.from && !period.to) return {};
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (period.from) createdAt.gte = period.from;
  if (period.to) {
    const end = new Date(period.to);
    end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }
  return { createdAt };
}

/** الطلبات شهريًا — عمود لكل شهر مع عدد المنجز منه. */
export async function requestsByMonth(period: Period) {
  const rows = await db.request.findMany({
    where: { ...notDeleted, ...periodWhere(period) },
    select: { createdAt: true, status: true },
  });

  const buckets = new Map<string, { month: string; total: number; delivered: number }>();

  for (const row of rows) {
    const month = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(month) ?? { month, total: 0, delivered: 0 };
    bucket.total += 1;
    if (row.status === RequestStatus.delivered) bucket.delivered += 1;
    buckets.set(month, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** التوزيع حسب البرنامج — يُحسب على البنود لأن الطلب قد يخلط برامج. */
export async function byProgram(period: Period) {
  const items = await db.requestItem.findMany({
    where: {
      ...notDeleted,
      item: { isNot: null },
      request: { ...notDeleted, ...periodWhere(period) },
    },
    select: {
      quantity: true,
      fulfilledQty: true,
      requestId: true,
      item: { select: { program: { select: { id: true, name: true } } } },
    },
  });

  const buckets = new Map<
    number,
    { programId: number; program: string; items: number; quantity: number; fulfilled: number; requests: Set<string> }
  >();

  for (const item of items) {
    const program = item.item?.program;
    if (!program) continue;

    const bucket = buckets.get(program.id) ?? {
      programId: program.id,
      program: program.name,
      items: 0,
      quantity: 0,
      fulfilled: 0,
      requests: new Set<string>(),
    };
    bucket.items += 1;
    bucket.quantity += item.quantity;
    bucket.fulfilled += item.fulfilledQty;
    bucket.requests.add(item.requestId);
    buckets.set(program.id, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({
      programId: b.programId,
      program: b.program,
      items: b.items,
      quantity: b.quantity,
      fulfilled: b.fulfilled,
      requests: b.requests.size,
    }))
    .sort((a, b) => b.requests - a.requests);
}

/** التوزيع حسب المدينة والحي. */
export async function byCityDistrict(period: Period) {
  const rows = await db.request.findMany({
    where: { ...notDeleted, ...periodWhere(period) },
    select: {
      status: true,
      beneficiary: {
        select: { city: { select: { name: true } }, district: { select: { name: true } } },
      },
    },
  });

  const buckets = new Map<string, { city: string; district: string; total: number; delivered: number }>();

  for (const row of rows) {
    const city = row.beneficiary.city?.name ?? 'غير محدَّد';
    const district = row.beneficiary.district?.name ?? '—';
    const key = `${city}|${district}`;
    const bucket = buckets.get(key) ?? { city, district, total: 0, delivered: 0 };
    bucket.total += 1;
    if (row.status === RequestStatus.delivered) bucket.delivered += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total);
}

/** أعلى الأصناف استهلاكًا — يُحسب على المصروف فعليًا لا على المطلوب. */
export async function topItems(period: Period, limit = 20, consumableOnly = false) {
  const items = await db.requestItem.findMany({
    where: {
      ...notDeleted,
      fulfilledQty: { gt: 0 },
      item: consumableOnly ? { isConsumable: true } : { isNot: null },
      request: { ...notDeleted, ...periodWhere(period) },
    },
    select: {
      size: true,
      fulfilledQty: true,
      item: { select: { id: true, name: true, unit: true, program: { select: { name: true } } } },
    },
  });

  const buckets = new Map<
    string,
    { key: string; item: string; program: string; unit: string; size: string | null; quantity: number; lines: number }
  >();

  for (const row of items) {
    if (!row.item) continue;
    const key = `${row.item.id}|${row.size ?? ''}`;
    const bucket = buckets.get(key) ?? {
      key,
      item: row.item.name,
      program: row.item.program.name,
      unit: row.item.unit,
      size: row.size,
      quantity: 0,
      lines: 0,
    };
    bucket.quantity += row.fulfilledQty;
    bucket.lines += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

/** المستفيدون المتكررون: من له أكثر من طلب. */
export async function repeatBeneficiaries(period: Period, minRequests = 2, limit = 100) {
  const beneficiaries = await db.beneficiary.findMany({
    where: { ...notDeleted, requests: { some: { ...notDeleted, ...periodWhere(period) } } },
    select: {
      id: true,
      nationalId: true,
      fullName: true,
      city: { select: { name: true } },
      requests: {
        where: { ...notDeleted, ...periodWhere(period) },
        select: { createdAt: true, status: true },
      },
    },
  });

  return beneficiaries
    .map((b) => {
      const dates = b.requests.map((r) => r.createdAt.getTime());
      return {
        id: b.id,
        nationalId: b.nationalId,
        fullName: b.fullName,
        city: b.city?.name ?? '—',
        requests: b.requests.length,
        delivered: b.requests.filter((r) => r.status === RequestStatus.delivered).length,
        firstAt: dates.length ? new Date(Math.min(...dates)) : null,
        lastAt: dates.length ? new Date(Math.max(...dates)) : null,
      };
    })
    .filter((b) => b.requests >= minRequests)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);
}

/**
 * متوسط زمن كل مرحلة بالأيام.
 *
 * يُحسب من الفروق بين القيود المتتالية في `status_history`: المدة التي مكثها
 * الطلب في حالة ما هي الفاصل بين دخوله إليها وخروجه منها.
 */
export async function stageDurations(period: Period) {
  const requests = await db.request.findMany({
    // نفس سبب استثناء المرحَّلات في متوسط الإنجاز: لها قيد واحد بتاريخ اصطناعي.
    where: { ...notDeleted, ...periodWhere(period), legacyRowRef: null },
    select: {
      id: true,
      statusHistory: { orderBy: { changedAt: 'asc' }, select: { toStatus: true, changedAt: true } },
    },
  });

  const buckets = new Map<RequestStatus, { totalMs: number; count: number }>();

  for (const request of requests) {
    const history = request.statusHistory;
    for (let i = 0; i < history.length - 1; i += 1) {
      const current = history[i];
      const next = history[i + 1];
      if (!current || !next) continue;

      const elapsed = next.changedAt.getTime() - current.changedAt.getTime();
      if (elapsed < 0) continue;

      const bucket = buckets.get(current.toStatus) ?? { totalMs: 0, count: 0 };
      bucket.totalMs += elapsed;
      bucket.count += 1;
      buckets.set(current.toStatus, bucket);
    }
  }

  return [...buckets.entries()]
    .map(([status, bucket]) => ({
      status,
      label: STATUS_LABELS[status],
      averageDays: bucket.totalMs / bucket.count / 86_400_000,
      samples: bucket.count,
    }))
    .sort((a, b) => b.averageDays - a.averageDays);
}

/**
 * متوسط زمن الإنجاز الكلي: من التقديم حتى الإغلاق.
 *
 * السجلات المرحَّلة من Excel مستثناة عمدًا: الملف القديم لم يكن فيه أي عمود
 * تاريخ، فتواريخها اصطناعية (أول الشهر لكليهما) وإدخالها يعطي متوسطًا صفريًا
 * كاذبًا. المؤشر يقيس ما تتبّعه النظام فعلًا، ويبقى «—» حتى تتراكم بيانات
 * حقيقية كافية.
 */
export async function averageCompletionDays(period: Period): Promise<number | null> {
  const rows = await db.request.findMany({
    where: {
      ...notDeleted,
      ...periodWhere(period),
      submittedAt: { not: null },
      closedAt: { not: null },
      legacyRowRef: null,
    },
    select: { submittedAt: true, closedAt: true },
  });

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, r) => {
    if (!r.submittedAt || !r.closedAt) return sum;
    return sum + (r.closedAt.getTime() - r.submittedAt.getTime());
  }, 0);

  return total / rows.length / 86_400_000;
}

/** التوزيع حسب الحالة — أساس تقرير الشهر الشامل. */
export async function byStatus(period: Period) {
  const grouped = await db.request.groupBy({
    by: ['status'],
    where: { ...notDeleted, ...periodWhere(period) },
    _count: { _all: true },
  });

  return grouped
    .map((g) => ({ status: g.status, label: STATUS_LABELS[g.status], count: g._count._all }))
    .sort((a, b) => b.count - a.count);
}

/** التوزيع حسب الجنس ومصدر الدخل — يُطلب في التقرير الشهري الشامل. */
export async function demographics(period: Period) {
  const rows = await db.request.findMany({
    where: { ...notDeleted, ...periodWhere(period) },
    select: {
      beneficiary: { select: { gender: true, incomeSource: { select: { name: true } } } },
    },
  });

  const gender = { male: 0, female: 0 };
  const income = new Map<string, number>();

  for (const row of rows) {
    if (row.beneficiary.gender === 'male') gender.male += 1;
    else gender.female += 1;

    const source = row.beneficiary.incomeSource?.name ?? 'غير محدَّد';
    income.set(source, (income.get(source) ?? 0) + 1);
  }

  return {
    gender,
    income: [...income.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** الأصناف التي وصلت حد إعادة الطلب — تُعرض في اللوحة والتقارير. */
export async function belowReorder() {
  const rows = await db.inventory.findMany({
    where: { item: { ...notDeleted, isActive: true, reorderLevel: { gt: 0 } } },
    select: {
      size: true,
      quantityOnHand: true,
      quantityReserved: true,
      item: {
        select: { id: true, name: true, unit: true, reorderLevel: true, program: { select: { name: true } } },
      },
    },
  });

  return rows
    .map((row) => ({
      item: row.item.name,
      program: row.item.program.name,
      unit: row.item.unit,
      size: row.size,
      available: row.quantityOnHand - row.quantityReserved,
      reorderLevel: row.item.reorderLevel,
    }))
    .filter((row) => row.available <= row.reorderLevel)
    .sort((a, b) => a.available - b.available);
}
