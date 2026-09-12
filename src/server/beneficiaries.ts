import { Prisma } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';
import { normalizeArabic, toLatinDigits } from '@/lib/arabic';

/**
 * استعلامات المستفيدين (قراءة فقط).
 * منفصلة عن الـServer Actions لأن الصفحات تستدعيها مباشرة بلا حاجة لـ'use server'.
 */

export const BENEFICIARY_LIST_SELECT = {
  id: true,
  nationalId: true,
  fullName: true,
  gender: true,
  phone: true,
  createdAt: true,
  city: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  incomeSource: { select: { id: true, name: true } },
  _count: { select: { requests: true } },
} satisfies Prisma.BeneficiarySelect;

export type BeneficiaryListRow = Prisma.BeneficiaryGetPayload<{
  select: typeof BENEFICIARY_LIST_SELECT;
}>;

/**
 * البحث الفوري: بالهوية أو الجوال أو الاسم.
 *
 * الاسم يُطابَق على `name_normalized` بالتشابه الثلاثي (pg_trgm)، فالبحث عن
 * «عائشة» يعثر على «عايشه». الأرقام تُحوَّل من العربية‑الهندية أولًا، لأن
 * الموظف قد يكتب بلوحة مفاتيح عربية.
 */
export async function searchBeneficiaries(params: {
  q?: string;
  cityId?: number | null;
  gender?: 'male' | 'female' | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: BeneficiaryListRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const q = (params.q ?? '').trim();

  const where: Prisma.BeneficiaryWhereInput = { ...notDeleted };
  if (params.cityId) where.cityId = params.cityId;
  if (params.gender) where.gender = params.gender;

  if (q) {
    const digits = toLatinDigits(q).replace(/\D/g, '');
    const normalized = normalizeArabic(q);
    const or: Prisma.BeneficiaryWhereInput[] = [];

    if (digits.length >= 3) {
      or.push({ nationalId: { contains: digits } });
      or.push({ phone: { contains: digits } });
    }
    if (normalized) {
      or.push({ nameNormalized: { contains: normalized } });
    }

    // بحث تقريبي على الاسم: يلتقط اختلافات الهمزة والتاء المربوطة والأخطاء الإملائية.
    if (normalized.length >= 3) {
      const fuzzy = await db.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM beneficiaries
        WHERE deleted_at IS NULL
          AND name_normalized % ${normalized}
        ORDER BY similarity(name_normalized, ${normalized}) DESC
        LIMIT 200
      `;
      if (fuzzy.length > 0) {
        or.push({ id: { in: fuzzy.map((r) => r.id) } });
      }
    }

    if (or.length === 0) return { rows: [], total: 0, page, pageSize };
    where.OR = or;
  }

  const [rows, total] = await Promise.all([
    db.beneficiary.findMany({
      where,
      select: BENEFICIARY_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.beneficiary.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

/** البحث بالهوية الدقيقة — تستعمله الخطوة الأولى في معالج الطلب الجديد. */
export async function findByNationalId(nationalId: string) {
  return db.beneficiary.findFirst({
    where: { nationalId, ...notDeleted },
    select: {
      ...BENEFICIARY_LIST_SELECT,
      birthDate: true,
      addressNote: true,
      notes: true,
      requests: {
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, requestNo: true, status: true, createdAt: true },
      },
    },
  });
}

export async function getBeneficiaryProfile(id: string) {
  return db.beneficiary.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      nationalId: true,
      fullName: true,
      gender: true,
      birthDate: true,
      phone: true,
      addressNote: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      city: { select: { id: true, name: true } },
      district: { select: { id: true, name: true } },
      incomeSource: { select: { id: true, name: true } },
      requests: {
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requestNo: true,
          status: true,
          priority: true,
          createdAt: true,
          submittedAt: true,
          closedAt: true,
          items: {
            where: notDeleted,
            select: {
              id: true,
              quantity: true,
              size: true,
              itemStatus: true,
              fulfilledQty: true,
              legacyText: true,
              item: { select: { id: true, name: true, program: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
}

/**
 * كل مرفقات المستفيد عبر طلباته.
 *
 * المواصفة تطلب المرفقات في ملف المستفيد لا في الطلب وحده: الباحث الاجتماعي
 * يريد أن يرى التقرير الطبي الذي رُفع قبل ستة أشهر وهو ينظر في طلب اليوم،
 * لا أن يفتح كل طلب سابق يبحث عنه.
 */
export async function getBeneficiaryAttachments(beneficiaryId: string) {
  return db.attachment.findMany({
    where: { ...notDeleted, request: { beneficiaryId, ...notDeleted } },
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      originalName: true,
      thumbPath: true,
      docType: true,
      size: true,
      mimeType: true,
      uploadedAt: true,
      uploadedBy: { select: { name: true } },
      request: { select: { id: true, requestNo: true } },
    },
  });
}

export type BeneficiaryAttachment = Awaited<
  ReturnType<typeof getBeneficiaryAttachments>
>[number];

/** القوائم المرجعية التي تحتاجها نماذج المستفيدين. */
export async function getLookups() {
  const [cities, districts, incomeSources] = await Promise.all([
    db.city.findMany({ where: { ...notDeleted, isActive: true }, orderBy: { name: 'asc' } }),
    db.district.findMany({ where: { ...notDeleted, isActive: true }, orderBy: { name: 'asc' } }),
    db.incomeSource.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return { cities, districts, incomeSources };
}
