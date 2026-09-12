'use server';

import { revalidatePath } from 'next/cache';
import { DocType } from '@prisma/client';
import { db, notDeleted } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { storeFile, validateUpload } from '@/lib/storage';
import { DOC_TYPE_VALUES } from '@/lib/doc-types';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/** رفع مرفق لطلب. الملف يُتحقق منه في الخادم — تحقق المتصفح تحسينٌ فقط. */
export async function uploadAttachment(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermissionInAction('attachment:upload');

    const requestId = String(formData.get('requestId') ?? '');
    const docTypeRaw = String(formData.get('docType') ?? 'other');
    const file = formData.get('file');

    if (!(file instanceof File)) return { ok: false, error: 'لم يُختَر أي ملف.' };

    const validationError = validateUpload(file);
    if (validationError) return { ok: false, error: validationError };

    const request = await db.request.findFirst({
      where: { id: requestId, ...notDeleted },
      select: { id: true },
    });
    if (!request) return { ok: false, error: 'الطلب غير موجود.' };

    const docType = (DOC_TYPE_VALUES.has(docTypeRaw) ? docTypeRaw : 'other') as DocType;
    const stored = await storeFile(file, `requests/${requestId}`);

    const created = await db.attachment.create({
      data: {
        requestId,
        filePath: stored.filePath,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
        docType,
        uploadedById: user.id,
      },
      select: { id: true },
    });

    await recordAudit({
      userId: user.id,
      action: 'create',
      modelType: 'Attachment',
      modelId: created.id,
      newValues: { requestId, originalName: stored.originalName, docType, size: stored.size },
    });

    revalidatePath(`/requests/${requestId}`);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    if (error instanceof Error) return { ok: false, error: error.message };
    return { ok: false, error: 'تعذّر رفع الملف.' };
  }
}

/** حذف ناعم للمرفق — الملف يبقى على التخزين والسجل يبقى في التدقيق. */
export async function deleteAttachment(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('attachment:delete');

    const attachment = await db.attachment.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, requestId: true, originalName: true },
    });
    if (!attachment) return { ok: false, error: 'المرفق غير موجود.' };

    await db.attachment.update({ where: { id }, data: { deletedAt: new Date() } });

    await recordAudit({
      userId: user.id,
      action: 'soft_delete',
      modelType: 'Attachment',
      modelId: id,
      oldValues: { originalName: attachment.originalName },
    });

    revalidatePath(`/requests/${attachment.requestId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    return { ok: false, error: 'تعذّر حذف المرفق.' };
  }
}
