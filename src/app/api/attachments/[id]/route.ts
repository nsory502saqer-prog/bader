import { NextResponse } from 'next/server';
import { db, notDeleted } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getCurrentUser } from '@/lib/session';
import { getPortalUser } from '@/server/portal/session';
import { readStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * تنزيل مرفق.
 *
 * المرفقات تحمل تقارير طبية وصور هوية، فلا تُخدَم من مسار عام إطلاقًا:
 * كل طلب هنا يتحقق من الجلسة والصلاحية قبل قراءة أي بايت من التخزين.
 *
 * مسار واحد يخدم جمهورين: موظف بصلاحية `attachment:read`، أو مستفيد من
 * البوابة لمرفقات طلباته هو وحدها. الفصل بينهما صريح أدناه، لا ضمني.
 *
 * `?thumb=1` يعيد المصغّرة 64×64 — نفس فحص الصلاحية، حجم أصغر.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const wantsThumb = new URL(request.url).searchParams.get('thumb') === '1';

  const attachment = await db.attachment.findFirst({
    where: { id, ...notDeleted },
    select: {
      filePath: true,
      thumbPath: true,
      mimeType: true,
      originalName: true,
      request: { select: { beneficiaryId: true } },
    },
  });
  if (!attachment) return new NextResponse('غير موجود', { status: 404 });

  const staff = await getCurrentUser();
  if (staff) {
    if (!can(staff.role, 'attachment:read')) return new NextResponse('ممنوع', { status: 403 });
  } else {
    // المستفيد يفتح مرفقات طلباته فقط — معرفة رقم المرفق لا تكفي.
    const portalUser = await getPortalUser();
    if (!portalUser) return new NextResponse('غير مصرّح', { status: 401 });
    if (portalUser.id !== attachment.request.beneficiaryId) {
      return new NextResponse('ممنوع', { status: 403 });
    }
  }

  const usingThumb = wantsThumb && attachment.thumbPath !== null;
  const filePath = usingThumb ? attachment.thumbPath! : attachment.filePath;
  const mimeType = usingThumb ? 'image/webp' : attachment.mimeType;

  try {
    const body = await readStoredFile(filePath);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        // خاص ولا يُخزَّن مؤقتًا: محتوى صحي لا يُترك في ذاكرة وسيط.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('تعذّرت قراءة الملف', { status: 500 });
  }
}
