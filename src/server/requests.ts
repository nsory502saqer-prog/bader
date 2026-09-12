import { Prisma, type Role } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';
import { normalizeArabic, toLatinDigits } from '@/lib/arabic';
import { inboxStatusesFor } from '@/lib/workflow';
import type { RequestFilters } from '@/lib/validation/request';

/** استعلامات الطلبات (قراءة فقط). */

export const REQUEST_LIST_SELECT = {
  id: true,
  requestNo: true,
  status: true,
  priority: true,
  createdAt: true,
  submittedAt: true,
  closedAt: true,
  beneficiary: {
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      gender: true,
      city: { select: { id: true, name: true } },
    },
  },
  assignedTo: { select: { id: true, name: true } },
  items: {
    where: { deletedAt: null },
    select: {
      id: true,
      item: { select: { id: true, name: true, program: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.RequestSelect;

export type RequestListRow = Prisma.RequestGetPayload<{ select: typeof REQUEST_LIST_SELECT }>;

/** يبني شرط WHERE من الفلاتر — مشترك بين القائمة والتصدير إلى Excel. */
export async function buildRequestWhere(
  filters: Partial<RequestFilters>,
): Promise<Prisma.RequestWhereInput> {
  const where: Prisma.RequestWhereInput = { ...notDeleted };
  const and: Prisma.RequestWhereInput[] = [];

  if (filters.status) where.status = filters.status;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;

  if (filters.cityId || filters.incomeSourceId || filters.gender) {
    where.beneficiary = {
      ...(filters.cityId ? { cityId: filters.cityId } : {}),
      ...(filters.incomeSourceId ? { incomeSourceId: filters.incomeSourceId } : {}),
      ...(filters.gender ? { gender: filters.gender } : {}),
    };
  }

  if (filters.programId) {
    and.push({
      items: { some: { deletedAt: null, item: { programId: filters.programId } } },
    });
  }

  if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = new Date(filters.from);
    if (filters.to) {
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }

  const q = (filters.q ?? '').trim();
  if (q) {
    const digits = toLatinDigits(q).replace(/\D/g, '');
    const normalized = normalizeArabic(q);
    const or: Prisma.RequestWhereInput[] = [{ requestNo: { contains: q, mode: 'insensitive' } }];

    if (digits.length >= 3) or.push({ beneficiary: { nationalId: { contains: digits } } });
    if (normalized) or.push({ beneficiary: { nameNormalized: { contains: normalized } } });

    and.push({ OR: or });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

export async function listRequests(filters: RequestFilters): Promise<{
  rows: RequestListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where = await buildRequestWhere(filters);
  const { page, pageSize } = filters;

  const [rows, total] = await Promise.all([
    db.request.findMany({
      where,
      select: REQUEST_LIST_SELECT,
      // العاجل أولًا، ثم الأقدم — لأن الطلب الذي طال انتظاره هو الأولى بالمعالجة.
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.request.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

/**
 * صندوق مهامي: الطلبات التي دور هذا الموظف عليها الآن، الأقدم أولًا.
 * لا يعرض ما هو عند غيره، فلا يحتاج الموظف للبحث عن عمله.
 */
export async function listMyTasks(role: Role): Promise<RequestListRow[]> {
  const statuses = inboxStatusesFor(role);
  if (statuses.length === 0) return [];

  return db.request.findMany({
    where: { ...notDeleted, status: { in: statuses } },
    select: REQUEST_LIST_SELECT,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 200,
  });
}

export async function getRequestDetail(id: string) {
  return db.request.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      requestNo: true,
      status: true,
      priority: true,
      source: true,
      notes: true,
      legacyRowRef: true,
      createdAt: true,
      submittedAt: true,
      closedAt: true,
      beneficiary: {
        select: {
          id: true,
          fullName: true,
          nationalId: true,
          gender: true,
          phone: true,
          city: { select: { name: true } },
          district: { select: { name: true } },
          incomeSource: { select: { name: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      items: {
        where: notDeleted,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          size: true,
          quantity: true,
          itemStatus: true,
          fulfilledQty: true,
          legacyText: true,
          note: true,
          item: {
            select: {
              id: true,
              name: true,
              unit: true,
              hasSizes: true,
              program: { select: { id: true, name: true } },
            },
          },
        },
      },
      statusHistory: {
        orderBy: { changedAt: 'asc' },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          changedAt: true,
          note: true,
          user: { select: { id: true, name: true } },
        },
      },
      attachments: {
        where: notDeleted,
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          docType: true,
          size: true,
          mimeType: true,
          uploadedAt: true,
          uploadedBy: { select: { name: true } },
        },
      },
      orders: {
        where: notDeleted,
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          status: true,
          issuedAt: true,
          deliveredAt: true,
          receivedByName: true,
        },
      },
    },
  });
}

export type RequestDetail = NonNullable<Awaited<ReturnType<typeof getRequestDetail>>>;

/** كتالوج الأصناف مجمّعًا ببرامجه — يغذّي الخطوة الثانية من معالج الطلب. */
export async function getCatalog() {
  return db.program.findMany({
    where: { ...notDeleted, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      items: {
        where: { ...notDeleted, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, unit: true, hasSizes: true },
      },
    },
  });
}

export type Catalog = Awaited<ReturnType<typeof getCatalog>>;

/** القوائم المرجعية لفلاتر شاشة الطلبات. */
export async function getRequestFilterOptions() {
  const [programs, cities, incomeSources, staff] = await Promise.all([
    db.program.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    db.city.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.incomeSource.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return { programs, cities, incomeSources, staff };
}
