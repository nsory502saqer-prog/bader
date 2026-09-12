import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { SettingsForm } from '@/components/admin/settings-form';
import { requirePermission } from '@/lib/session';
import { db } from '@/lib/db';
import { DEFAULT_SLA_DAYS } from '@/lib/workflow';
import type { RequestStatus } from '@prisma/client';

export const metadata: Metadata = { title: 'الإعدادات العامة' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requirePermission('admin:settings');

  const rows = await db.setting.findMany({
    where: { key: { in: ['org.name', 'org.region', 'sla.days'] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const readString = (key: string, fallback: string): string => {
    const value = map.get(key);
    return typeof value === 'string' ? value : fallback;
  };

  const storedSla = map.get('sla.days');
  const sla: Record<string, number> =
    storedSla && typeof storedSla === 'object' && !Array.isArray(storedSla)
      ? Object.fromEntries(
          Object.entries(storedSla as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]),
        )
      : (DEFAULT_SLA_DAYS as Record<string, number>);

  const stages = Object.keys(DEFAULT_SLA_DAYS) as RequestStatus[];

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-2">
      <PageHeader
        title="الإعدادات العامة"
        description="اسم الجمعية يظهر في أوامر الصرف المطبوعة، ومدد الإنجاز تحدّد متى يُعتبر الطلب متأخرًا."
      />
      <SettingsForm
        orgName={readString('org.name', 'جمعية بادر للأجهزة الطبية')}
        orgRegion={readString('org.region', 'منطقة مكة المكرمة')}
        sla={sla}
        stages={stages}
      />
    </div>
  );
}
