import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * زر Primer. أربع صيغ لا خامس لها، فلا يختلف شكل الزر بين شاشة وأخرى.
 * الحركة الوحيدة المسموحة هنا: تغذية راجعة فورية عند التحويم والضغط.
 */
type Variant = 'default' | 'primary' | 'danger' | 'invisible';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  default:
    'border border-border bg-canvas-subtle text-fg hover:bg-[var(--control-bgColor-hover)] active:bg-[var(--control-bgColor-active)]',
  primary:
    'border border-[var(--borderColor-success-emphasis)] bg-[var(--button-primary-bgColor-rest)] text-[var(--fgColor-onEmphasis)] hover:bg-[var(--button-primary-bgColor-hover)] active:bg-[var(--button-primary-bgColor-active)]',
  danger:
    'border border-border bg-canvas-subtle text-fg-danger hover:border-[var(--borderColor-danger-emphasis)] hover:bg-[var(--button-danger-bgColor-hover)] hover:text-[var(--fgColor-onEmphasis)]',
  invisible: 'border border-transparent bg-transparent text-fg hover:bg-[var(--bgColor-neutral-muted)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-[28px] gap-0.5 px-1 text-xs',
  md: 'h-[32px] gap-0.5 px-2 text-sm',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** أيقونة Octicon توضع في بداية الزر (16px) */
  leadingIcon?: React.ReactNode;
  /** يعطّل الزر ويعرض حالة انتظار أثناء تنفيذ Server Action */
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', leadingIcon, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded font-semibold transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:border-border disabled:bg-canvas-subtle disabled:text-fg-disabled',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
      {children}
    </button>
  );
});
