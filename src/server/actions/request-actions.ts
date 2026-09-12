'use server';

import { revalidatePath } from 'next/cache';
import { RequestStatus } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { nextRequestNumber } from '@/lib/request-number';
import { checkTransition, isTerminal, STATUS_LABELS } from '@/lib/workflow';
import {
  createRequestSchema,
  transitionSchema,
  updateItemsSchema,
} from '@/lib/validation/request';
import { issueDisbursementOrder, releaseRequestReservations } from '@/server/stock-core';
import { enqueueStatusNotification, scheduleDrain } from '@/server/notifications/outbox';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

function fail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' };
}

function firstIssue(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues[0]?.message ?? 'تحقّق من البيانات المدخلة.';
}

/**
 * إنشاء طلب جديد.
 *
 * كل شيء داخل معاملة واحدة: توليد الرقم، وكتابة البنود، وأول قيد في سجل
 * الحالات. فإن فشل أي جزء لم يبقَ طلب نصف مكتمل في قاعدة البيانات.
 */
export async function createRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('request:create');

    const parsed = createRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error.issues) };
    }
    const data = parsed.data;

    const beneficiary = await db.beneficiary.findFirst({
      where: { id: data.beneficiaryId, ...notDeleted },
      select: { id: true },
    });
    if (!beneficiary) return { ok: false, error: 'المستفيد غير موجود.' };

    const itemIds = [...new Set(data.items.map((i) => i.itemId))];
    const catalogItems = await db.item.findMany({
      where: { id: { in: itemIds }, ...notDeleted, isActive: true },
      select: { id: true, name: true, hasSizes: true },
    });
    const byId = new Map(catalogItems.map((i) => [i.id, i]));

    for (const line of data.items) {
      const catalogItem = byId.get(line.itemId);
      if (!catalogItem) return { ok: false, error: 'أحد الأصناف المختارة غير موجود في الكتالوج.' };
      if (catalogItem.hasSizes && !line.size) {
        return { ok: false, error: `الصنف «${catalogItem.name}» يحتاج تحديد المقاس.` };
      }
      if (!catalogItem.hasSizes && line.size) {
        return { ok: false, error: `الصنف «${catalogItem.name}» ليس له مقاسات.` };
      }
    }

    const now = new Date();
    const initialStatus = data.submit ? RequestStatus.submitted : RequestStatus.draft;

    const created = await db.$transaction(async (tx) => {
      const requestNo = await nextRequestNumber(tx, now);

      const request = await tx.request.create({
        data: {
          requestNo,
          beneficiaryId: data.beneficiaryId,
          status: initialStatus,
          priority: data.priority,
          source: data.source,
          notes: data.notes,
          createdById: user.id,
          submittedAt: data.submit ? now : null,
          items: {
            create: data.items.map((line) => ({
              itemId: line.itemId,
              size: line.size,
              quantity: line.quantity,
              note: line.note,
            })),
          },
        },
        select: { id: true, requestNo: true },
      });

      // أول قيد في السجل: من أنشأ الطلب ومتى. السجل لا يُعدَّل ولا يُحذف لاحقًا.
      await tx.statusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: initialStatus,
          userId: user.id,
          changedAt: now,
          note: data.submit ? 'إنشاء الطلب وتقديمه' : 'إنشاء الطلب كمسودة',
        },
      });

      // المسودة لا إشعار لها: الطلب لم يُقدَّم بعد ولا يعني المستفيد شيء.
      if (data.submit) {
        await enqueueStatusNotification({ tx, requestId: request.id, status: initialStatus });
      }

      return request;
    });

    scheduleDrain();

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'Request',
      modelId: created.id,
      newValues: { requestNo: created.requestNo, status: initialStatus, items: data.items.length },
    });

    revalidatePath('/requests');
    revalidatePath('/my-tasks');
    revalidatePath(`/beneficiaries/${data.beneficiaryId}`);

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * تغيير حالة الطلب.
 *
 * لا مسار خارج آلة الحالات، ولا إجراء خارج صلاحية الدور، ولا رفض أو تأجيل
 * أو إلغاء بلا سبب مكتوب — والتحقق يقع هنا في الخادم لا في الواجهة.
 */
export async function transitionRequest(input: unknown): Promise<ActionResult<{ status: RequestStatus }>> {
  try {
    const user = await requirePermissionInAction('request:transition');

    const parsed = transitionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues) };
    const { requestId, to, reason } = parsed.data;

    const request = await db.request.findFirst({
      where: { id: requestId, ...notDeleted },
      select: {
        id: true,
        status: true,
        beneficiaryId: true,
        items: { where: notDeleted, select: { id: true, itemStatus: true } },
      },
    });
    if (!request) return { ok: false, error: 'الطلب غير موجود.' };

    const check = checkTransition({ from: request.status, to, role: user.role, reason });
    if (!check.ok) return { ok: false, error: check.error };

    // لا يُغلق طلب وفيه بند ما زال معلّقًا.
    if (isTerminal(to) && to !== RequestStatus.cancelled && to !== RequestStatus.rejected) {
      const pending = request.items.filter((i) => i.itemStatus === 'pending');
      if (pending.length > 0) {
        return {
          ok: false,
          error: `لا يمكن إغلاق الطلب وفيه ${pending.length} بندًا بحالة «قيد الانتظار». حدّث حالة البنود أولًا.`,
        };
      }
    }

    const now = new Date();
    const closesRequest = isTerminal(to);

    await db.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: requestId },
        data: {
          status: to,
          closedAt: closesRequest ? now : null,
          submittedAt:
            request.status === RequestStatus.draft && to === RequestStatus.submitted
              ? now
              : undefined,
        },
      });

      await tx.statusHistory.create({
        data: {
          requestId,
          fromStatus: request.status,
          toStatus: to,
          userId: user.id,
          changedAt: now,
          note: reason,
        },
      });

      // إصدار أمر الصرف يخصم من المخزون. كلاهما في هذه المعاملة، فإن أخفق
      // الخصم لم يُصدَر أمر ولم تتغيّر الحالة.
      if (to === RequestStatus.order_issued) {
        await issueDisbursementOrder({ tx, requestId, userId: user.id, now });
      }

      // الطلب الذي لن يُصرف يُحرَّر حجزه فورًا، فلا يبقى مخزون معلّقًا بلا سبب.
      if (to === RequestStatus.rejected || to === RequestStatus.cancelled) {
        await releaseRequestReservations(tx, requestId);
      }

      // الإشعار يُكتب في الصندوق داخل المعاملة لا يُرسل هنا: لو فشل أي جزء
      // مما سبق، تراجعت الرسالة معه فلا يصل المستفيد خبر لم يقع.
      await enqueueStatusNotification({ tx, requestId, status: to, reason });
    });

    // الإرسال الفعلي بعد نجاح المعاملة، وبلا انتظار — تغيير الحالة لا يتعلّق
    // باستجابة مزوّد الرسائل، وما يفشل يبقى في الصندوق لمحاولة لاحقة.
    scheduleDrain();

    await recordAudit({
      userId: user.id,
      action: 'status_change',
      modelType: 'Request',
      modelId: requestId,
      oldValues: { status: request.status },
      newValues: { status: to, reason },
    });

    revalidatePath('/requests');
    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/my-tasks');
    revalidatePath('/dashboard');
    revalidatePath(`/beneficiaries/${request.beneficiaryId}`);

    return { ok: true, data: { status: to } };
  } catch (error) {
    return fail(error);
  }
}

/** تحديث بنود الطلب (المستودع والمشتريات). */
export async function updateRequestItems(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('request:update');

    const parsed = updateItemsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues) };
    const { requestId, items } = parsed.data;

    const request = await db.request.findFirst({
      where: { id: requestId, ...notDeleted },
      select: { id: true, status: true, items: { where: notDeleted, select: { id: true } } },
    });
    if (!request) return { ok: false, error: 'الطلب غير موجود.' };
    if (isTerminal(request.status)) {
      return {
        ok: false,
        error: `لا يمكن تعديل بنود طلب في حالة «${STATUS_LABELS[request.status]}».`,
      };
    }

    const known = new Set(request.items.map((i) => i.id));
    for (const line of items) {
      if (!known.has(line.id)) return { ok: false, error: 'أحد البنود لا ينتمي لهذا الطلب.' };
      if (line.fulfilledQty > line.quantity) {
        return { ok: false, error: 'الكمية المصروفة لا يمكن أن تتجاوز الكمية المطلوبة.' };
      }
    }

    await db.$transaction(
      items.map((line) =>
        db.requestItem.update({
          where: { id: line.id },
          data: {
            quantity: line.quantity,
            itemStatus: line.itemStatus,
            fulfilledQty: line.fulfilledQty,
            note: line.note,
          },
        }),
      ),
    );

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'RequestItem',
      modelId: requestId,
      newValues: { items },
    });

    revalidatePath(`/requests/${requestId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

/** إسناد الطلب لموظف. */
export async function assignRequest(
  requestId: string,
  assignedToId: string | null,
): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('request:assign');

    const request = await db.request.findFirst({
      where: { id: requestId, ...notDeleted },
      select: { id: true, assignedToId: true },
    });
    if (!request) return { ok: false, error: 'الطلب غير موجود.' };

    if (assignedToId) {
      const staff = await db.user.findFirst({
        where: { id: assignedToId, ...notDeleted, isActive: true },
        select: { id: true },
      });
      if (!staff) return { ok: false, error: 'الموظف غير موجود أو حسابه معطَّل.' };
    }

    await db.request.update({ where: { id: requestId }, data: { assignedToId } });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Request',
      modelId: requestId,
      oldValues: { assignedToId: request.assignedToId },
      newValues: { assignedToId },
    });

    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/my-tasks');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
