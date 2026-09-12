import { cache } from 'react';
import type { RequestStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { DEFAULT_SLA_DAYS } from '@/lib/workflow';

/**
 * قراءة الإعدادات العامة.
 *
 * المدد المخزَّنة تسبق الافتراضية دائمًا، فتغييرها من شاشة الإعدادات ينعكس
 * فورًا على تمييز الطلبات المتأخرة في صندوق المهام — وإلا كانت الشاشة زينة.
 *
 * ملفوفة بـ`cache` فلا تُقرأ الإعدادات أكثر من مرة في الطلب الواحد.
 */
export const getSlaDays = cache(async (): Promise<Partial<Record<RequestStatus, number>>> => {
  const row = await db.setting.findUnique({
    where: { key: 'sla.days' },
    select: { value: true },
  });

  const stored = row?.value;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_SLA_DAYS;
  }

  const parsed: Partial<Record<RequestStatus, number>> = {};
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    const days = Number(value);
    if (Number.isFinite(days) && days > 0) parsed[key as RequestStatus] = days;
  }

  return Object.keys(parsed).length > 0 ? parsed : DEFAULT_SLA_DAYS;
});
