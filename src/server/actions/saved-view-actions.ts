'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * العروض المخصصة: فلاتر محفوظة لقائمة الطلبات.
 *
 * الفلاتر تعيش في الرابط، فالعرض المحفوظ ليس إلا اسمًا لمجموعة معاملات —
 * لا نسخة من النتائج. هكذا يبقى العرض صحيحًا مهما تغيّرت البيانات بعده.
 */

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

/** المفاتيح المسموح حفظها — قائمة بيضاء تمنع تخزين أي معامل عشوائي. */
const ALLOWED_KEYS = [
  'q',
  'status',
  'programId',
  'cityId',
  'incomeSourceId',
  'gender',
  'assignedToId',
  'from',
  'to',
] as const;

const saveSchema = z.object({
  name: z.string().trim().min(2, 'اسم العرض قصير جدًا.').max(120),
  filters: z.record(z.string(), z.string()),
  isShared: z.boolean().default(false),
});

export async function saveView(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('request:read');

    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }

    const clean: Record<string, string> = {};
    for (const key of ALLOWED_KEYS) {
      const value = parsed.data.filters[key];
      if (value) clean[key] = value;
    }

    if (Object.keys(clean).length === 0) {
      return { ok: false, error: 'طبّق فلترًا واحدًا على الأقل قبل حفظ العرض.' };
    }

    const created = await db.savedView.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        filters: clean,
        isShared: parsed.data.isShared,
      },
      select: { id: true },
    });

    revalidatePath('/requests');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteView(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('request:read');

    // العرض المشترك يحذفه صاحبه فقط، فلا يمسح موظف عرض زميله.
    const view = await db.savedView.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!view) return { ok: false, error: 'العرض غير موجود أو ليس لك.' };

    await db.savedView.delete({ where: { id } });

    revalidatePath('/requests');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
