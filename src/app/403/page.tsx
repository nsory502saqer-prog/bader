import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'لا تملك صلاحية' };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-2">
      <div className="max-w-[420px] text-center">
        <h1 className="text-lg font-semibold text-fg">لا تملك صلاحية الوصول لهذه الصفحة</h1>
        <p className="prose-limit mt-1 text-sm text-fg-muted">
          هذه الشاشة مخصّصة لدور مختلف عن دورك. إن كنت تحتاج الوصول إليها، راجع مدير النظام.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex h-[32px] items-center rounded border border-border bg-canvas-subtle px-2 text-sm font-semibold text-fg"
        >
          العودة إلى لوحة المعلومات
        </Link>
      </div>
    </main>
  );
}
