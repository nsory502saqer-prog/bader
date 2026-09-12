import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Box } from '@/components/ui/surface';
import { OrgLogo } from '@/components/ui/org-logo';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas-subtle px-2 py-6">
      <div className="w-full max-w-[340px]">
        <div className="mb-3 flex flex-col items-center text-center">
          <OrgLogo size={64} className="mb-1" />
          <h1 className="text-lg font-semibold text-fg">نظام إدارة طلبات الإعانات</h1>
          <p className="mt-0.5 text-sm text-fg-muted">جمعية بادر للأجهزة الطبية</p>
        </div>

        <Box className="p-2">
          <LoginForm />
        </Box>

        <p className="mt-2 text-center text-xs text-fg-muted">
          للحصول على حساب أو استرجاع كلمة المرور، راجع مدير النظام.
        </p>
      </div>
    </main>
  );
}
