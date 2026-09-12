import Link from 'next/link';
import { getPortalUser } from '@/server/portal/session';
import { portalLogout } from '@/server/actions/portal-actions';

/**
 * تخطيط بوابة المستفيد.
 *
 * واجهة عامة، فهي أبسط من واجهة الموظفين عمدًا: بلا شريط جانبي ولا تنقّل
 * معقّد — شاشتان فقط، وخط أكبر قليلًا لأن جمهورها كبار السن ومرضى.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();

  return (
    <div className="min-h-screen bg-canvas-subtle">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-[48px] max-w-[820px] items-center justify-between gap-1 px-2">
          <Link href="/portal" className="text-sm font-semibold text-fg">
            بوابة المستفيدين
          </Link>

          {user ? (
            <div className="flex items-center gap-1">
              <span className="hidden text-xs text-fg-muted sm:inline">{user.fullName}</span>
              <form
                action={async () => {
                  'use server';
                  await portalLogout();
                }}
              >
                <button
                  type="submit"
                  className="h-[32px] rounded border border-border bg-canvas-subtle px-1 text-xs font-semibold text-fg-muted hover:text-fg"
                >
                  خروج
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-2 py-3">{children}</main>

      <footer className="mx-auto max-w-[820px] px-2 pb-3">
        <p className="prose-limit text-xs text-fg-muted">
          هذه بوابة المستفيدين من جمعية بادر للأجهزة الطبية. لن يطلب منك موظف رمز الدخول أبدًا،
          فلا تشاركه مع أحد.
        </p>
      </footer>
    </div>
  );
}
