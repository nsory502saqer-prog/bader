import { NextResponse } from 'next/server';
import { db, notDeleted } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getCurrentUser } from '@/lib/session';
import { readStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * صورة توقيع المستلم.
 *
 * التوقيع أثر قانوني يثبت من استلم الجهاز، فلا يُخدَم من مسار عام ولا يُخزَّن
 * مؤقتًا: كل طلب يتحقق من الجلسة وصلاحية `disbursement:read` أولًا.
 */
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('غير مصرّح', { status: 401 });
  if (!can(user.role, 'disbursement:read')) return new NextResponse('ممنوع', { status: 403 });

  const { orderId } = await context.params;
  const order = await db.disbursementOrder.findFirst({
    where: { id: orderId, ...notDeleted },
    select: { signaturePath: true },
  });

  if (!order?.signaturePath) return new NextResponse('لا يوجد توقيع', { status: 404 });

  try {
    const body = await readStoredFile(order.signaturePath);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('تعذّرت قراءة التوقيع', { status: 500 });
  }
}
