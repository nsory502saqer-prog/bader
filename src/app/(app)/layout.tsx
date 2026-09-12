import { Header } from '@/components/shell/header';
import { NavList } from '@/components/shell/sidebar';
import { navItemsFor } from '@/components/shell/nav-items';
import { requireUser } from '@/lib/session';

/**
 * تخطيط التطبيق المحمي.
 * الحماية في الخادم: أي صفحة تحت هذا التخطيط لا تُرسم أصلًا بلا جلسة صالحة،
 * ولا يُعتمد على إخفاء الروابط وحده.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = navItemsFor(user.role);

  return (
    <div className="min-h-screen bg-canvas">
      <Header user={user} items={items} />

      <div className="flex">
        <aside className="sticky top-[48px] hidden h-[calc(100vh-48px)] w-[220px] shrink-0 overflow-y-auto border-s border-border bg-canvas-subtle md:block">
          <NavList items={items} />
        </aside>

        <main className="min-w-0 flex-1 px-2 py-2">{children}</main>
      </div>
    </div>
  );
}
