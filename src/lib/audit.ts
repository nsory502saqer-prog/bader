import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { getRequestIp } from '@/lib/session';

/**
 * سجل التدقيق.
 *
 * لا حذف نهائي في هذا النظام، فكل تعديل يجب أن يترك أثرًا يُقرأ لاحقًا:
 * من غيّر، وماذا كانت القيمة قبل، وماذا صارت بعد.
 */

type Client = PrismaClient | Prisma.TransactionClient;

export type AuditAction =
  | 'create'
  | 'update'
  | 'soft_delete'
  | 'restore'
  | 'status_change'
  | 'login'
  | 'export';

export async function recordAudit(args: {
  client?: Client;
  userId: string | null;
  action: AuditAction;
  modelType: string;
  modelId: string;
  oldValues?: unknown;
  newValues?: unknown;
  ip?: string | null;
}): Promise<void> {
  const client = args.client ?? db;
  const ip = args.ip !== undefined ? args.ip : await getRequestIp();

  await client.auditLog.create({
    data: {
      userId: args.userId,
      action: args.action,
      modelType: args.modelType,
      modelId: args.modelId,
      oldValues: (args.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (args.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      ip,
    },
  });
}

/**
 * الفرق بين نسختين من سجل — حتى لا يمتلئ سجل التدقيق بحقول لم تتغيّر.
 * يعيد null إن لم يتغيّر شيء، فتستطيع المستدعية تخطّي الكتابة أصلًا.
 */
export function diffRecords<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { old: Partial<T>; new: Partial<T> } | null {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  let changed = false;

  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before[key];
    const b = after[key];
    const same =
      a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : Object.is(a, b);

    if (!same) {
      oldValues[key] = a;
      newValues[key] = b as T[keyof T];
      changed = true;
    }
  }

  return changed ? { old: oldValues, new: newValues } : null;
}

/**
 * تسجيل الاطّلاع على ملف مستفيد.
 * متطلب صريح من نظام حماية البيانات الشخصية: كل عملية اطلاع على بيانات
 * صحية أو هوية وطنية تُسجَّل بصاحبها ووقتها.
 */
export async function recordBeneficiaryAccess(args: {
  beneficiaryId: string;
  userId: string;
}): Promise<void> {
  const ip = await getRequestIp();
  await db.beneficiaryAccessLog.create({
    data: { beneficiaryId: args.beneficiaryId, userId: args.userId, ip },
  });
}
