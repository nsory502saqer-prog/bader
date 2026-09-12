import Link from 'next/link';
import { signOut } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/workflow';
import type { CurrentUser } from '@/lib/session';
import { MobileNav } from './sidebar';
import { ThemeToggle } from './theme-toggle';
import type { NavItem } from './nav-items';

/** أول حرفين من الاسم — بديل الصورة الرمزية حتى تُرفع صورة فعلية. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0] ?? '').join('');
}

export function Header({ user, items }: { user: CurrentUser; items: NavItem[] }) {
  return (
    <header className="sticky top-0 z-40 flex h-[48px] items-center justify-between gap-1 border-b border-border bg-canvas-subtle px-2">
      <div className="flex min-w-0 items-center gap-1">
        <MobileNav items={items} />
        <Link href="/dashboard" className="truncate text-sm font-semibold text-fg">
          نظام إدارة طلبات الإعانات
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />

        <div className="hidden items-center gap-1 sm:flex">
          <span
            aria-hidden="true"
            className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[var(--bgColor-neutral-muted)] text-xs font-semibold text-fg-muted"
          >
            {initials(user.name)}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-fg">{user.name}</span>
            <span className="text-xs text-fg-muted">{ROLE_LABELS[user.role]}</span>
          </span>
        </div>

        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
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
    </header>
  );
}
