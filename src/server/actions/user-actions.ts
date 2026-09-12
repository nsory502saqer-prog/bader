'use server';

import { revalidatePath } from 'next/cache';
import { hash } from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

const passwordSchema = z
  .string()
  .min(10, 'كلمة المرور يجب ألّا تقل عن 10 محارف.')
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: 'كلمة المرور يجب أن تحتوي حرفًا كبيرًا وحرفًا صغيرًا ورقمًا.',
  });

const createUserSchema = z.object({
  name: z.string().trim().min(3, 'الاسم قصير جدًا.').max(255),
  email: z.string().trim().toLowerCase().email('صيغة البريد الإلكتروني غير صحيحة.'),
  role: z.nativeEnum(Role),
  password: passwordSchema,
});

const updateUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(3, 'الاسم قصير جدًا.').max(255),
  role: z.nativeEnum(Role),
  isActive: z.boolean(),
  /** فارغة تعني: لا تغيّر كلمة المرور */
  password: z.string().optional().nullable(),
});

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع.' };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermissionInAction('admin:users');

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'راجع الحقول المميّزة بالأحمر.',
        fieldErrors: fieldErrors(parsed.error.issues),
      };
    }
    const data = parsed.data;

    const taken = await db.user.findFirst({ where: { email: data.email }, select: { id: true } });
    if (taken) {
      return {
        ok: false,
        error: 'البريد الإلكتروني مستخدم.',
        fieldErrors: { email: 'البريد الإلكتروني مستخدم.' },
      };
    }

    const created = await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        password: await hash(data.password, 12),
      },
      select: { id: true },
    });

    await recordAudit({
      userId: actor.id,
      action: 'create',
      modelType: 'User',
      modelId: created.id,
      // كلمة المرور لا تدخل سجل التدقيق أبدًا، ولا حتى مجزّأة.
      newValues: { name: data.name, email: data.email, role: data.role },
    });

    revalidatePath('/admin/users');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requirePermissionInAction('admin:users');

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'راجع الحقول المميّزة بالأحمر.',
        fieldErrors: fieldErrors(parsed.error.issues),
      };
    }
    const data = parsed.data;

    const before = await db.user.findFirst({
      where: { id: data.id, ...notDeleted },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!before) return { ok: false, error: 'المستخدم غير موجود.' };

    // لا يعطّل المدير نفسه ولا ينزع دوره، فيقفل النظام على الجميع.
    if (actor.id === data.id && (data.role !== Role.admin || !data.isActive)) {
      return { ok: false, error: 'لا يمكنك تعطيل حسابك أو تغيير دورك بنفسك.' };
    }

    if (data.password) {
      const check = passwordSchema.safeParse(data.password);
      if (!check.success) {
        return {
          ok: false,
          error: check.error.issues[0]?.message ?? 'كلمة المرور ضعيفة.',
          fieldErrors: { password: check.error.issues[0]?.message ?? 'كلمة المرور ضعيفة.' },
        };
      }
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.id },
        data: {
          name: data.name,
          role: data.role,
          isActive: data.isActive,
          ...(data.password ? { password: await hash(data.password, 12) } : {}),
        },
      });

      // الجلسات قاعديّة، فتعطيل الحساب أو تغيير كلمة المرور يقطع الوصول فورًا.
      if (!data.isActive || data.password) {
        await tx.session.deleteMany({ where: { userId: data.id } });
      }
    });

    await recordAudit({
      userId: actor.id,
      action: 'update',
      modelType: 'User',
      modelId: data.id,
      oldValues: { name: before.name, role: before.role, isActive: before.isActive },
      newValues: {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        passwordChanged: Boolean(data.password),
      },
    });

    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
