import { format, formatDistanceToNowStrict, differenceInCalendarDays } from 'date-fns';
import { ar } from 'date-fns/locale';

/**
 * التنسيق.
 * التواريخ ميلادية بأرقام لاتينية في الجداول حتى تُقارن بصريًا بسهولة،
 * والصيغة النسبية («قبل 3 أيام») للخطوط الزمنية فقط.
 */

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return format(d, 'yyyy/MM/dd');
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return format(d, 'yyyy/MM/dd HH:mm');
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return `قبل ${formatDistanceToNowStrict(d, { locale: ar })}`;
}

/** عدد الأيام منذ تاريخ — يُستعمل لقياس التأخر عن مدة الإنجاز المستهدفة. */
export function daysSince(value: Date | null | undefined): number | null {
  if (!value) return null;
  return differenceInCalendarDays(new Date(), value);
}

/** صياغة المدة بالأيام بصيغة عربية سليمة العدد. */
export function formatDays(days: number): string {
  const n = Math.round(days);
  if (n === 0) return 'اليوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * مدة بالأيام للعرض في المؤشرات.
 * ما دون اليوم يُكتب «أقل من يوم» لا «0.0 يوم» — الصفر يوحي بعطل، والعبارة
 * تقول الحقيقة: الطلب أُنجز في نفس اليوم.
 */
export function formatDurationDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) return 'أقل من يوم';
  return `${days.toFixed(1)} يوم`;
}
