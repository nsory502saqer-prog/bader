import type { Metadata } from 'next';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { SettingsForm } from '@/components/admin/settings-form';
import { LogoUploader } from '@/components/admin/logo-uploader';
import { hasLogo } from '@/components/ui/org-logo';
import { requirePermission } from '@/lib/session';
import { db } from '@/lib/db';
import { DEFAULT_SLA_DAYS } from '@/lib/workflow';
import { storageDescription } from '@/lib/storage';
import { defaultChannel, notificationsEnabled } from '@/server/notifications/drivers';
import type { RequestStatus } from '@prisma/client';

export const metadata: Metadata = { title: 'الإعدادات العامة' };
export const dynamic = 'force-dynamic';

const CHANNEL_LABELS = { whatsapp: 'واتساب', sms: 'رسائل SMS' } as const;

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
  const logoPresent = await hasLogo();

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

      <Box>
        <BoxHeader>
          <BoxTitle>شعار الجمعية</BoxTitle>
          <span className="text-xs text-fg-muted">الصورة الزخرفية الوحيدة في النظام</span>
        </BoxHeader>
        <LogoUploader hasLogo={logoPresent} />
      </Box>

      {/*
        إعدادات البيئة تُعرض ولا تُعدَّل من الواجهة: تغييرها يعني إعادة نشر،
        والمفاتيح لا يصحّ أن تمرّ عبر متصفح. المقصود أن يرى المدير ما يعمل
        فعلًا بدل أن يخمّنه.
      */}
      <Box>
        <BoxHeader>
          <BoxTitle>إعدادات البيئة</BoxTitle>
          <span className="text-xs text-fg-muted">للاطّلاع — تُضبط في ملف .env</span>
        </BoxHeader>
        <dl className="grid gap-2 p-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fg-muted">تخزين المرفقات</dt>
            <dd className="text-sm text-fg">{storageDescription()}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">قناة الإشعارات</dt>
            <dd className="text-sm text-fg">
              {notificationsEnabled()
                ? `${CHANNEL_LABELS[defaultChannel()]} · مزوّد ${process.env['NOTIFICATIONS_DRIVER'] ?? 'log'}`
                : 'معطّلة'}
            </dd>
          </div>
        </dl>

        {(process.env['NOTIFICATIONS_DRIVER'] ?? 'log') === 'log' ? (
          <div className="border-t border-border px-2 py-1">
            <p className="prose-limit text-xs text-fg-attention">
              مزوّد الإشعارات الحالي «log» يسجّل الرسائل ولا يرسلها. هذا مناسب للتجربة، وعند
              التشغيل الحقيقي اضبط NOTIFICATIONS_DRIVER على whatsapp أو sms.
            </p>
          </div>
        ) : null}

        {(process.env['STORAGE_DRIVER'] ?? 'local') === 'local' ? (
          <div className="border-t border-border px-2 py-1">
            <p className="prose-limit text-xs text-fg-attention">
              المرفقات تُخزَّن على قرص الخادم. للإنتاج استعمل تخزينًا متوافقًا مع S3 مستضافًا
              داخل المملكة، فالمرفقات تحوي تقارير طبية وصور هوية.
            </p>
          </div>
        ) : null}
      </Box>
    </div>
  );
}
