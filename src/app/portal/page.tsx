import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Box, BoxHeader, BoxTitle } from '@/components/ui/surface';
import { PortalLoginForm } from '@/components/portal/login-form';
import { getPortalUser } from '@/server/portal/session';

export const metadata: Metadata = {
  title: 'بوابة المستفيدين',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function PortalLoginPage() {
  const user = await getPortalUser();
  if (user) redirect('/portal/requests');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h1 className="text-lg font-semibold text-fg">بوابة المستفيدين</h1>
        <p className="prose-limit mt-0.5 text-sm text-fg-muted">
          تابع حالة طلبك وقدّم طلبًا جديدًا. الدخول برقم الهوية ورمز يصل إلى جوالك المسجّل لدى
          الجمعية.
        </p>
      </div>

      <Box>
        <BoxHeader>
          <BoxTitle>الدخول</BoxTitle>
        </BoxHeader>
        <div className="p-2">
          <PortalLoginForm />
        </div>
      </Box>

      <Box className="p-2">
        <p className="text-sm font-semibold text-fg">لم يصلك الرمز؟</p>
        <ul className="mt-0.5 list-disc space-y-0.5 ps-3 text-sm text-fg-muted">
          <li>تأكد أن رقم الهوية مكتوب كما هو مسجّل لدى الجمعية.</li>
          <li>الرمز يصل على الجوال المسجّل في ملفك، لا على أي رقم آخر.</li>
          <li>إن تغيّر جوالك أو لم تكن مسجّلًا بعد، راجع الجمعية لتحديث بياناتك.</li>
        </ul>
      </Box>
    </div>
  );
}
