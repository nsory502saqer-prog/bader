import * as React from 'react';
import { cn } from '@/lib/cn';
import type { StatusTone } from '@/lib/workflow';

/**
 * شارة Primer (Label). الحالات تُعرض هكذا — خلفية خفيفة ونص من نفس العائلة
 * اللونية — لا كأزرار ملوّنة صلبة.
 */

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-[var(--bgColor-neutral-muted)] text-fg-muted',
  accent: 'bg-[var(--bgColor-accent-muted)] text-fg-accent',
  success: 'bg-[var(--bgColor-success-muted)] text-fg-success',
  attention: 'bg-[var(--bgColor-attention-muted)] text-fg-attention',
  danger: 'bg-[var(--bgColor-danger-muted)] text-fg-danger',
  done: 'bg-[var(--bgColor-done-muted)] text-fg-done',
};

export function StatusLabel({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-0.5 py-px text-xs font-semibold leading-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** شارة محايدة بحدّ رفيع — للعدّادات والوسوم الثانوية */
export function CountLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[20px] items-center justify-center rounded-full border border-border bg-canvas-subtle px-0.5 text-xs text-fg-muted tnum',
        className,
      )}
    >
      {children}
    </span>
  );
}
