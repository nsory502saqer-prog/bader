'use client';

import { useSearchParams } from 'next/navigation';
import { DownloadIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';

/**
 * زر التصدير إلى Excel.
 *
 * يحمل معه الفلاتر المطبَّقة حاليًا من الرابط، فالملف الناتج مطابق تمامًا لما
 * يراه الموظف على الشاشة — لا قائمة كاملة غير مفلترة تفاجئه.
 *
 * التنزيل عبر رابط عادي لا fetch: المتصفح يتولّى الحفظ، ولا يمرّ الملف
 * بذاكرة الصفحة.
 */
export function ExportButton({
  kind,
  label = 'تصدير إلى Excel',
  /** معاملات إضافية تُضاف لفلاتر الرابط */
  extraParams,
  size = 'md',
}: {
  kind: string;
  label?: string;
  extraParams?: Record<string, string>;
  size?: 'sm' | 'md';
}) {
  const searchParams = useSearchParams();

  const params = new URLSearchParams(searchParams.toString());
  params.delete('page');
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value) params.set(key, value);
  }

  const query = params.toString();
  const href = `/api/export/${kind}${query ? `?${query}` : ''}`;

  return (
    <a href={href} download>
      <Button type="button" size={size} leadingIcon={<DownloadIcon size={16} />}>
        {label}
      </Button>
    </a>
  );
}
