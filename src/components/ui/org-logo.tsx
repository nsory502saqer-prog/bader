import Image from 'next/image';
import { db } from '@/lib/db';

/**
 * شعار الجمعية — الصورة الزخرفية الوحيدة في النظام.
 *
 * يغيب بصمت إن لم يُرفع: النظام يعمل باسم الجمعية النصي وحده، فلا تظهر أيقونة
 * صورة مكسورة في شاشة الدخول لأن المدير لم يرفع شعارًا بعد.
 */
export async function hasLogo(): Promise<boolean> {
  const setting = await db.setting.findUnique({
    where: { key: 'org.logoPath' },
    select: { value: true },
  });
  return typeof setting?.value === 'string' && setting.value.length > 0;
}

export async function OrgLogo({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  if (!(await hasLogo())) return null;

  return (
    <Image
      src="/api/logo"
      alt="شعار الجمعية"
      width={size}
      height={size}
      unoptimized
      // أبعاد صريحة تمنع إزاحة التخطيط، و`contain` يحفظ نسبة الشعار مهما
      // كانت أبعاد الملف المرفوع.
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
