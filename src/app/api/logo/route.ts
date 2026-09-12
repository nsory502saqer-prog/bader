import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * شعار الجمعية.
 *
 * المسار الوحيد غير المحمي في النظام، وهذا مقصود: الشعار يظهر في شاشة الدخول
 * وبوابة المستفيدين قبل أي جلسة، وهو علامة تجارية معلنة لا بيانات.
 *
 * ومع ذلك يُقرأ مساره من الإعدادات لا من معامل الطلب: لو قبل مسارًا من
 * المستخدم لصار قارئ ملفات عامًّا يكشف كل مرفق في التخزين.
 */
export async function GET() {
  const setting = await db.setting.findUnique({
    where: { key: 'org.logoPath' },
    select: { value: true },
  });

  const path = typeof setting?.value === 'string' ? setting.value : null;
  if (!path) return new NextResponse('لا يوجد شعار', { status: 404 });

  try {
    const body = await readStoredFile(path);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        // التخزين يحوّل الصور إلى WebP عند الرفع.
        'Content-Type': path.endsWith('.webp') ? 'image/webp' : 'image/png',
        // الشعار نادر التغيير وعام، فيُخزَّن مؤقتًا بعكس بقية المرفقات.
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('تعذّرت قراءة الشعار', { status: 500 });
  }
}
