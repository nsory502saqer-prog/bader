'use client';

import { useEffect } from 'react';

/**
 * يفتح حوار الطباعة تلقائيًا عند فتح الصفحة في تبويب جديد.
 * الطباعة تبقى ممكنة يدويًا لو حجب المتصفح النداء التلقائي.
 */
export function PrintTrigger() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
