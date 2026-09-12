'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { RequestStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { Box, BoxHeader, BoxTitle, Flash } from '@/components/ui/surface';
import { STATUS_LABELS } from '@/lib/workflow';
import { saveSettings } from '@/server/actions/catalog-actions';

/**
 * الإعدادات العامة.
 *
 * مدد الإنجاز المستهدفة ليست زينة: «صندوق مهامي» يستعملها لتمييز الطلب
 * المتأخر بلون مختلف، فتغييرها هنا يغيّر ما يراه الموظف فورًا.
 */
export function SettingsForm({
  orgName: initialName,
  orgRegion: initialRegion,
  sla: initialSla,
  stages,
}: {
  orgName: string;
  orgRegion: string;
  sla: Record<string, number>;
  stages: RequestStatus[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [orgName, setOrgName] = useState(initialName);
  const [orgRegion, setOrgRegion] = useState(initialRegion);
  const [sla, setSla] = useState<Record<string, string>>(
    Object.fromEntries(stages.map((s) => [s, String(initialSla[s] ?? 0)])),
  );

  function submit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveSettings({
        orgName,
        orgRegion,
        sla: Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, Number(v) || 0])),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess('حُفظت الإعدادات.');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {success ? <Flash tone="success">{success}</Flash> : null}

      <Box>
        <BoxHeader>
          <BoxTitle>بيانات الجمعية</BoxTitle>
          <span className="text-xs text-fg-muted">تظهر في ترويسة أوامر الصرف المطبوعة</span>
        </BoxHeader>
        <div className="grid gap-2 p-2 sm:grid-cols-2">
          <FormField label="اسم الجمعية" htmlFor="org-name" required>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </FormField>
          <FormField label="المنطقة" htmlFor="org-region">
            <Input value={orgRegion} onChange={(e) => setOrgRegion(e.target.value)} />
          </FormField>
        </div>
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>مدد الإنجاز المستهدفة (SLA)</BoxTitle>
          <span className="text-xs text-fg-muted">
            بالأيام — الطلب الذي يتجاوزها يُميَّز في صندوق المهام
          </span>
        </BoxHeader>
        <div className="grid gap-2 p-2 sm:grid-cols-3">
          {stages.map((stage) => (
            <FormField key={stage} label={STATUS_LABELS[stage]} htmlFor={`sla-${stage}`}>
              <Input
                type="number"
                min={0}
                max={365}
                value={sla[stage] ?? '0'}
                onChange={(e) => setSla({ ...sla, [stage]: e.target.value })}
                dir="ltr"
                className="tnum text-start"
              />
            </FormField>
          ))}
        </div>
      </Box>

      <div>
        <Button type="button" variant="primary" loading={pending} onClick={submit}>
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  );
}
