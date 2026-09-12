'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit, diffRecords } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { cleanDisplayText } from '@/lib/arabic';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * الكتالوج والقوائم المرجعية.
 *
 * هذه الشاشة هي السدّ الذي يمنع عودة الإدخال الحر: حين يحتاج الموظف صنفًا
 * جديدًا يضيفه المدير هنا فيصير خيارًا في القائمة المنسدلة، بدل أن يكتبه
 * الموظف نصًا حرًا فتتكاثر صياغاته.
 *
 * لا حذف نهائي: الصنف يُعطَّل (`is_active=false`) فيختفي من قوائم الاختيار
 * وتبقى الطلبات القديمة المرتبطة به سليمة.
 */

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

// ───────────────────────────── الأصناف ─────────────────────────────

const itemSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  programId: z.coerce.number().int().positive('اختر البرنامج.'),
  name: z.string().trim().min(2, 'اسم الصنف قصير جدًا.').max(200),
  unit: z.string().trim().min(1).max(40).default('حبة'),
  hasSizes: z.boolean().default(false),
  reorderLevel: z.coerce.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
});

export async function saveItem(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermissionInAction('admin:catalog');

    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { id, ...data } = parsed.data;
    const name = cleanDisplayText(data.name);

    const program = await db.program.findFirst({
      where: { id: data.programId, ...notDeleted },
      select: { id: true, code: true },
    });
    if (!program) return { ok: false, error: 'البرنامج غير موجود.' };

    const clash = await db.item.findFirst({
      where: { programId: data.programId, name, ...(id ? { id: { not: id } } : {}) },
      select: { id: true },
    });
    if (clash) return { ok: false, error: 'يوجد صنف بنفس الاسم في هذا البرنامج.' };

    const payload = {
      programId: data.programId,
      name,
      unit: data.unit,
      hasSizes: data.hasSizes,
      // أصناف كفالة مريض استهلاكية بطبيعتها، فتُوسم تلقائيًا.
      isConsumable: program.code === 'PATIENT_CARE',
      reorderLevel: data.reorderLevel,
      isActive: data.isActive,
    };

    if (id) {
      const before = await db.item.findUnique({ where: { id } });
      if (!before) return { ok: false, error: 'الصنف غير موجود.' };

      // تغيير hasSizes بعد وجود أرصدة يخلط الأرصدة بين المقاسات.
      if (before.hasSizes !== payload.hasSizes) {
        const stocked = await db.inventory.findFirst({
          where: { itemId: id, OR: [{ quantityOnHand: { gt: 0 } }, { quantityReserved: { gt: 0 } }] },
          select: { id: true },
        });
        if (stocked) {
          return {
            ok: false,
            error: 'لا يمكن تغيير خاصية المقاسات لصنف له رصيد. صفِّر الرصيد أولًا أو أنشئ صنفًا جديدًا.',
          };
        }
      }

      await db.item.update({ where: { id }, data: payload });

      const changes = diffRecords(before as unknown as Record<string, unknown>, payload);
      if (changes) {
        await recordAudit({
          userId: user.id,
          action: 'update',
          modelType: 'Item',
          modelId: String(id),
          oldValues: changes.old,
          newValues: changes.new,
        });
      }

      revalidatePath('/admin/catalog');
      revalidatePath('/inventory');
      return { ok: true, data: { id } };
    }

    const created = await db.item.create({ data: payload, select: { id: true } });

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'Item',
      modelId: String(created.id),
      newValues: payload,
    });

    revalidatePath('/admin/catalog');
    revalidatePath('/inventory');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

// ───────────────────────────── القوائم المرجعية ─────────────────────────────

const lookupSchema = z.object({
  kind: z.enum(['city', 'district', 'incomeSource']),
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, 'الاسم قصير جدًا.').max(120),
  /** مطلوب للأحياء فقط */
  cityId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function saveLookup(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermissionInAction('admin:lookups');

    const parsed = lookupSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { kind, id, cityId, isActive } = parsed.data;
    const name = cleanDisplayText(parsed.data.name);

    let savedId: number;

    if (kind === 'city') {
      const row = id
        ? await db.city.update({ where: { id }, data: { name, isActive }, select: { id: true } })
        : await db.city.create({ data: { name, isActive }, select: { id: true } });
      savedId = row.id;
    } else if (kind === 'incomeSource') {
      const row = id
        ? await db.incomeSource.update({
            where: { id },
            data: { name, isActive },
            select: { id: true },
          })
        : await db.incomeSource.create({ data: { name, isActive }, select: { id: true } });
      savedId = row.id;
    } else {
      if (!cityId) return { ok: false, error: 'اختر المدينة التي يتبع لها الحي.' };
      const row = id
        ? await db.district.update({
            where: { id },
            data: { name, cityId, isActive },
            select: { id: true },
          })
        : await db.district.create({ data: { name, cityId, isActive }, select: { id: true } });
      savedId = row.id;
    }

    await recordAudit({
      userId: user.id,
      action: id ? 'update' : 'create',
      modelType: kind,
      modelId: String(savedId),
      newValues: { name, cityId, isActive },
    });

    revalidatePath('/admin/catalog');
    return { ok: true, data: { id: savedId } };
  } catch (error) {
    return fail(error);
  }
}

// ───────────────────────────── الإعدادات العامة ─────────────────────────────

const settingsSchema = z.object({
  orgName: z.string().trim().min(2).max(200),
  orgRegion: z.string().trim().max(200),
  sla: z.record(z.string(), z.coerce.number().int().min(0).max(365)),
});

export async function saveSettings(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('admin:settings');

    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }
    const { orgName, orgRegion, sla } = parsed.data;

    const entries: { key: string; value: unknown }[] = [
      { key: 'org.name', value: orgName },
      { key: 'org.region', value: orgRegion },
      { key: 'sla.days', value: sla },
    ];

    for (const entry of entries) {
      await db.setting.upsert({
        where: { key: entry.key },
        update: { value: entry.value as never },
        create: { key: entry.key, value: entry.value as never },
      });
    }

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Setting',
      modelId: 'general',
      newValues: { orgName, orgRegion, sla },
    });

    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
