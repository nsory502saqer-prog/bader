'use server';

import { revalidatePath } from 'next/cache';
import { db, notDeleted } from '@/lib/db';
import { cleanDisplayText, normalizeArabic } from '@/lib/arabic';
import { recordAudit, diffRecords } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import {
  beneficiaryInputSchema,
  beneficiaryUpdateSchema,
  nationalIdSchema,
} from '@/lib/validation/beneficiary';

/**
 * حركات المستفيدين.
 *
 * كل حركة تتحقق من الصلاحية بنفسها في الخادم، وتعيد أخطاء الحقول بصيغة
 * `fieldErrors` ليعرضها النموذج بجانب كل حقل بدل رسالة عامة.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** يحوّل أي استثناء إلى نتيجة يعرضها النموذج، بلا تسريب تفاصيل داخلية. */
function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' };
}

/**
 * التحقق من وجود هوية قبل الحفظ.
 *
 * لا يمنع التكرار — يعرض تنبيهًا ورابطًا للملف، ويدع الموظف يقرر:
 * أهو طلب جديد لنفس الشخص أم خطأ إدخال؟ المنع القاطع كان سيدفع الموظفين
 * لاختراع هويات وهمية، وهو أسوأ من التكرار.
 */
export async function checkNationalId(raw: string): Promise<
  ActionResult<{
    exists: boolean;
    beneficiary: {
      id: string;
      fullName: string;
      requestCount: number;
      lastRequestAt: Date | null;
    } | null;
  }>
> {
  try {
    await requirePermissionInAction('beneficiary:read');

    const parsed = nationalIdSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'رقم الهوية غير صالح.',
        fieldErrors: { nationalId: parsed.error.issues[0]?.message ?? 'رقم الهوية غير صالح.' },
      };
    }

    const found = await db.beneficiary.findFirst({
      where: { nationalId: parsed.data, ...notDeleted },
      select: {
        id: true,
        fullName: true,
        _count: { select: { requests: true } },
        requests: {
          where: notDeleted,
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (!found) return { ok: true, data: { exists: false, beneficiary: null } };

    return {
      ok: true,
      data: {
        exists: true,
        beneficiary: {
          id: found.id,
          fullName: found.fullName,
          requestCount: found._count.requests,
          lastRequestAt: found.requests[0]?.createdAt ?? null,
        },
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createBeneficiary(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('beneficiary:create');

    const parsed = beneficiaryInputSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: 'راجع الحقول المميّزة بالأحمر.', fieldErrors };
    }

    const data = parsed.data;
    const fullName = cleanDisplayText(data.fullName);

    const existing = await db.beneficiary.findFirst({
      where: { nationalId: data.nationalId, ...notDeleted },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: false,
        error: 'رقم الهوية مسجّل مسبقًا لمستفيد آخر.',
        fieldErrors: { nationalId: 'رقم الهوية مسجّل مسبقًا.' },
      };
    }

    const created = await db.beneficiary.create({
      data: {
        nationalId: data.nationalId,
        fullName,
        nameNormalized: normalizeArabic(fullName),
        gender: data.gender,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        phone: data.phone,
        incomeSourceId: data.incomeSourceId,
        cityId: data.cityId,
        districtId: data.districtId,
        addressNote: data.addressNote,
        notes: data.notes,
      },
      select: { id: true },
    });

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'Beneficiary',
      modelId: created.id,
      newValues: { ...data, fullName },
    });

    revalidatePath('/beneficiaries');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateBeneficiary(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('beneficiary:update');

    const parsed = beneficiaryUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: 'راجع الحقول المميّزة بالأحمر.', fieldErrors };
    }

    const data = parsed.data;
    const before = await db.beneficiary.findFirst({
      where: { id: data.id, ...notDeleted },
    });
    if (!before) return { ok: false, error: 'المستفيد غير موجود.' };

    // الهوية مفتاح الهوية الفعلي للسجل: تغييرها يتطلب ألّا تكون مأخوذة.
    if (data.nationalId !== before.nationalId) {
      const taken = await db.beneficiary.findFirst({
        where: { nationalId: data.nationalId, id: { not: data.id }, ...notDeleted },
        select: { id: true },
      });
      if (taken) {
        return {
          ok: false,
          error: 'رقم الهوية مسجّل لمستفيد آخر.',
          fieldErrors: { nationalId: 'رقم الهوية مسجّل لمستفيد آخر.' },
        };
      }
    }

    const fullName = cleanDisplayText(data.fullName);
    const after = {
      nationalId: data.nationalId,
      fullName,
      nameNormalized: normalizeArabic(fullName),
      gender: data.gender,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      phone: data.phone,
      incomeSourceId: data.incomeSourceId,
      cityId: data.cityId,
      districtId: data.districtId,
      addressNote: data.addressNote,
      notes: data.notes,
    };

    await db.beneficiary.update({ where: { id: data.id }, data: after });

    const changes = diffRecords(before as unknown as Record<string, unknown>, after);
    if (changes) {
      await recordAudit({
        userId: user.id,
        action: 'update',
        modelType: 'Beneficiary',
        modelId: data.id,
        oldValues: changes.old,
        newValues: changes.new,
      });
    }

    revalidatePath('/beneficiaries');
    revalidatePath(`/beneficiaries/${data.id}`);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

/** حذف ناعم فقط — لا حذف نهائي لأي سجل في هذا النظام. */
export async function softDeleteBeneficiary(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('beneficiary:delete');

    const before = await db.beneficiary.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, fullName: true, _count: { select: { requests: true } } },
    });
    if (!before) return { ok: false, error: 'المستفيد غير موجود.' };

    const openRequests = await db.request.count({
      where: { beneficiaryId: id, ...notDeleted, closedAt: null },
    });
    if (openRequests > 0) {
      return {
        ok: false,
        error: `لا يمكن حذف المستفيد ولديه ${openRequests} طلبًا لم يُغلق بعد.`,
      };
    }

    await db.beneficiary.update({ where: { id }, data: { deletedAt: new Date() } });

    await recordAudit({
      userId: user.id,
      action: 'soft_delete',
      modelType: 'Beneficiary',
      modelId: id,
      oldValues: { fullName: before.fullName },
    });

    revalidatePath('/beneficiaries');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
