import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * الجدول هو بطل الواجهة في هذا النظام، وصفوفه كثيفة عمدًا:
 * حدّ سفلي رفيع بلا خطوط عمودية، وحشو ضيّق، وترويسة بخلفية أهدأ.
 * الجدول ملفوف في حاوية تمرير أفقي حتى لا يجرّ الصفحة كلها على الجوال.
 *
 * المحاذاة تُمرَّر بـ`textAlign` لا بـ`align`، لأن `align` خاصية HTML قديمة
 * محجوزة على الخلايا ولا تقبل القيم المنطقية (start/end) في RTL.
 */

type Align = 'start' | 'end' | 'center';

const ALIGN: Record<Align, string> = {
  start: 'text-start',
  end: 'text-end',
  center: 'text-center',
};

export function TableContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('scroll-subtle w-full overflow-x-auto', className)}>{children}</div>;
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <table className={cn('w-full min-w-[720px] border-collapse text-sm', className)}>
      {children}
    </table>
  );
}

export function Th({
  children,
  className,
  textAlign = 'start',
  ...props
}: Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> & { textAlign?: Align }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-border bg-canvas-subtle px-2 py-1 text-xs font-semibold text-fg-muted',
        ALIGN[textAlign],
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  textAlign = 'start',
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> & { textAlign?: Align }) {
  return (
    <td
      className={cn('border-b border-border px-2 py-1 align-middle text-fg', ALIGN[textAlign], className)}
      {...props}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-canvas-subtle', className)} {...props}>
      {children}
    </tr>
  );
}
