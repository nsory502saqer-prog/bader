'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@primer/octicons-react';

type Mode = 'light' | 'dark';

/**
 * تبديل الوضع الليلي باستبدال رموز Primer الداكنة، لا بقلب الألوان.
 * الاختيار يُحفظ محليًا ويُقرأ في سكربت الإقلاع قبل أول رسم.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-color-mode');
    setMode(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-color-mode', next);
    try {
      localStorage.setItem('bader-color-mode', next);
    } catch {
      // التخزين المحلي قد يكون محجوبًا — التبديل يبقى فعّالًا لهذه الجلسة.
    }
    setMode(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === 'dark' ? 'التحويل إلى الوضع الفاتح' : 'التحويل إلى الوضع الليلي'}
      title={mode === 'dark' ? 'الوضع الفاتح' : 'الوضع الليلي'}
      className="inline-flex h-[32px] w-[32px] items-center justify-center rounded border border-border bg-canvas-subtle text-fg-muted hover:text-fg"
    >
      {mode === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}
