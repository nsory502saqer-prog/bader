import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * الأسطح: صندوق بحدّ رفيع وخلفية صلبة. لا ظلال ولا تدرجات ولا زوايا مفرطة.
 * الفصل بين العناصر يتم بالحدّ، وهذا هو المنطق البصري لكامل النظام.
 */

export function Box({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded border border-border bg-canvas', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** ترويسة الصندوق: خلفية أهدأ وحدّ سفلي يفصلها عن المحتوى */
export function BoxHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-[40px] flex-wrap items-center justify-between gap-1 border-b border-border bg-canvas-subtle px-2 py-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function BoxTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-fg">{children}</h2>;
}

/** ترويسة الصفحة: عنوان 20px، وصف اختياري، وإجراءات في الطرف المقابل */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        {description ? (
          <p className="prose-limit mt-0.5 text-sm text-fg-muted">{description}</p>
        ) : null}
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-1">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/** حالة الفراغ: نص هادئ وإجراء واحد. لا رسوم توضيحية ولا عبارات حماسية. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-6 text-center">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="prose-limit text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** هيكل تحميل — الحركة الوظيفية الوحيدة المسموحة مع تغذية الأزرار الراجعة */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-skeleton rounded bg-[var(--bgColor-neutral-muted)]', className)}
    />
  );
}

/** شريط تنبيه داخل الصفحة (Flash) */
export function Flash({
  tone = 'accent',
  children,
  className,
}: {
  tone?: 'accent' | 'success' | 'attention' | 'danger';
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    accent: 'border-[var(--borderColor-accent-muted)] bg-[var(--bgColor-accent-muted)] text-fg',
    success: 'border-[var(--borderColor-success-muted)] bg-[var(--bgColor-success-muted)] text-fg',
    attention:
      'border-[var(--borderColor-attention-muted)] bg-[var(--bgColor-attention-muted)] text-fg',
    danger: 'border-[var(--borderColor-danger-muted)] bg-[var(--bgColor-danger-muted)] text-fg',
  } as const;

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded border px-2 py-1 text-sm', tones[tone], className)}
    >
      {children}
    </div>
  );
}
