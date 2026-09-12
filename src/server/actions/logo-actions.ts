'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/rbac';
import { requirePermissionInAction } from '@/lib/session';
import { storeFile } from '@/lib/storage';
import type { ActionResult } from '@/server/actions/beneficiary-actions';

/**
 * شعار الجمعية.
 *
 * هو **الصورة الزخرفية الوحيدة** المسموح بها في النظام كله: لا صور مخزون ولا
 * رسوم توضيحية في أي شاشة. يظهر في ترويسة أمر الصرف المطبوع الذي يخرج للناس،
 * وفي شاشة الدخول وبوابة المستفيدين.
 *
 * يُخزَّن كأي مرفق ويُشار إليه من `settings['org.logoPath']`، فلا يُدفن في
 * مجلد ثابت داخل الكود ويمكن تغييره بلا إعادة نشر.
 */

const MAX_LOGO_BYTES = 1024 * 1024; // 1MB — الشعار ليس صورة فوتوغرافية

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

export async function uploadLogo(formData: FormData): Promise<ActionResult<{ path: string }>> {
  try {
    const user = await requirePermissionInAction('admin:settings');

    const file = formData.get('logo');
    if (!(file instanceof File)) return { ok: false, error: 'لم يُختَر أي ملف.' };
    if (file.size === 0) return { ok: false, error: 'الملف فارغ.' };
    if (file.size > MAX_LOGO_BYTES) return { ok: false, error: 'حجم الشعار يتجاوز 1 ميجابايت.' };

    // SVG مستبعد عمدًا: يقبل سكربتات، وشعار برنامج خبيث في ترويسة كل أمر صرف
    // ليس مخاطرة تستحق مرونة الصيغة.
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      return { ok: false, error: 'نوع الملف غير مسموح. المسموح: PNG وWebP وJPG.' };
    }

    const stored = await storeFile(file, 'branding');

    await db.setting.upsert({
      where: { key: 'org.logoPath' },
      update: { value: stored.filePath },
      create: { key: 'org.logoPath', value: stored.filePath },
    });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Setting',
      modelId: 'org.logoPath',
      newValues: { path: stored.filePath, size: stored.size },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/login');
    revalidatePath('/portal');

    return { ok: true, data: { path: stored.filePath } };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    if (error instanceof Error) return { ok: false, error: error.message };
    return { ok: false, error: 'تعذّر رفع الشعار.' };
  }
}

/** يزيل الشعار فيعود النظام إلى الاسم النصي وحده. */
export async function removeLogo(): Promise<ActionResult> {
  try {
    const user = await requirePermissionInAction('admin:settings');

    await db.setting.deleteMany({ where: { key: 'org.logoPath' } });

    await recordAudit({
      userId: user.id,
      action: 'update',
      modelType: 'Setting',
      modelId: 'org.logoPath',
      newValues: { path: null },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/login');
    revalidatePath('/portal');

    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    return { ok: false, error: 'تعذّر إزالة الشعار.' };
  }
}
