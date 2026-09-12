import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * حقول الإدخال. حدّ رفيع، زاوية 6px، بلا ظل — تمامًا كحقول GitHub.
 * كل حقل مربوط بتسميته عبر htmlFor/id، ورسالة الخطأ مربوطة بـaria-describedby.
 */

const CONTROL_BASE =
  'w-full rounded border border-border bg-canvas text-sm text-fg transition-colors ' +
  'placeholder:text-fg-muted focus:border-[var(--borderColor-accent-emphasis)] ' +
  'disabled:cursor-not-allowed disabled:bg-canvas-subtle disabled:text-fg-disabled';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_BASE, 'h-[32px] px-1', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL_BASE, 'resize-y px-1 py-1 leading-6', className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(CONTROL_BASE, 'h-[32px] px-1', className)} {...props}>
      {children}
    </select>
  );
});

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {/*
        نجمة الحقل الإلزامي تُرسم بـCSS لا كنص داخل <label>.
        لو كانت نصًا لصار اسم الحقل «المدينة *» بدل «المدينة»، فتختلّ مطابقة
        التسمية بالحقل في أدوات القراءة والاختبارات معًا.
      */}
      <label
        htmlFor={htmlFor}
        data-required={required ? 'true' : undefined}
        className="text-xs font-semibold text-fg data-[required]:after:text-fg-danger data-[required]:after:content-['_*']"
      >
        {label}
      </label>

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            'aria-required': required ? true : undefined,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
          })
        : children}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-fg-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
