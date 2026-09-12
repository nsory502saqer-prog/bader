import { NextResponse } from 'next/server';
import { db, notDeleted } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getCurrentUser } from '@/lib/session';
import { readStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * تنزيل مرفق.
 *
 * المرفقات تحمل تقارير طبية وصور هوية، فلا تُخدَم من مسار عام إطلاقًا:
 * كل طلب هنا يتحقق من الجلسة والصلاحية قبل قراءة أي بايت من التخزين.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('غير مصرّح', { status: 401 });
  if (!can(user.role, 'attachment:read')) return new NextResponse('ممنوع', { status: 403 });

  const { id } = await context.params;
  const attachment = await db.attachment.findFirst({
    where: { id, ...notDeleted },
    select: { filePath: true, mimeType: true, originalName: true },
  });
  if (!attachment) return new NextResponse('غير موجود', { status: 404 });

  try {
    const body = await readStoredFile(attachment.filePath);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('تعذّرت قراءة الملف', { status: 500 });
  }
}
