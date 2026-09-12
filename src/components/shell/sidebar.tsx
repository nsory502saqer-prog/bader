'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThreeBarsIcon, XIcon } from '@primer/octicons-react';
import { cn } from '@/lib/cn';
import { NavIcon } from './icon';
import type { NavItem } from './nav-items';

/**
 * التنقّل الرئيسي.
 * `NavList` هي القائمة نفسها، و`MobileNav` غلافها على الشاشات الضيقة —
 * لأن موظفي المستودع يستعملون النظام من الهاتف أثناء التجهيز.
 */

export function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="التنقّل الرئيسي" className="flex flex-col gap-px p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(item.href) ? 'page' : undefined}
          className={cn(
            'flex items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors duration-100',
            isActive(item.href)
              ? 'bg-[var(--bgColor-neutral-muted)] font-semibold text-fg'
              : 'text-fg-muted hover:bg-[var(--bgColor-neutral-muted)] hover:text-fg',
          )}
        >
          <NavIcon name={item.icon} />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح قائمة التنقّل"
        aria-expanded={open}
        className="inline-flex h-[32px] w-[32px] items-center justify-center rounded border border-border bg-canvas-subtle text-fg md:hidden"
      >
        <ThreeBarsIcon size={16} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--bgColor-inverse)] opacity-50"
          />
          <div className="absolute inset-y-0 start-0 w-[240px] border-e border-border bg-canvas">
            <div className="flex h-[48px] items-center justify-between border-b border-border px-1">
              <span className="text-sm font-semibold text-fg">التنقّل</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق القائمة"
                className="inline-flex h-[28px] w-[28px] items-center justify-center rounded text-fg-muted hover:bg-[var(--bgColor-neutral-muted)] hover:text-fg"
              >
                <XIcon size={16} />
              </button>
            </div>
            <NavList items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
