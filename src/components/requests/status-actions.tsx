'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { RequestStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { FormField, Textarea } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { STATUS_LABELS } from '@/lib/workflow';
import { transitionRequest } from '@/server/actions/request-actions';

export type AvailableTransition = {
  to: RequestStatus;
  requiresReason: boolean;
};

/**
 * أزرار تغيير الحالة.
 *
 * الأزرار المعروضة هنا هي ما يسمح به دور المستخدم فقط، لكن القرار النهائي
 * للخادم: `transitionRequest` تعيد التحقق من المسار والدور والسبب قبل الكتابة.
 */
export function StatusActions({
  requestId,
  transitions,
}: {
  requestId: string;
  transitions: AvailableTransition[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AvailableTransition | null>(null);
  const [reason, setReason] = useState('');

  if (transitions.length === 0) {
    return (
      <p className="text-xs text-fg-muted">
        لا يوجد إجراء متاح لك على هذا الطلب في حالته الحالية.
      </p>
    );
  }

  function run(target: AvailableTransition, note: string) {
    setError(null);
    startTransition(async () => {
      const result = await transitionRequest({
        requestId,
        to: target.to,
        reason: note || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setActive(null);
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      <div className="flex flex-wrap gap-1">
        {transitions.map((t) => (
          <Button
            key={t.to}
            type="button"
            variant={t.to === 'rejected' || t.to === 'cancelled' ? 'danger' : 'default'}
            disabled={pending}
            onClick={() => {
              if (t.requiresReason) {
                setActive(t);
                setReason('');
              } else {
                run(t, '');
              }
            }}
          >
            {STATUS_LABELS[t.to]}
          </Button>
        ))}
      </div>

      {active ? (
        <div className="rounded border border-border bg-canvas-subtle p-2">
          <FormField
            label={`سبب الانتقال إلى «${STATUS_LABELS[active.to]}»`}
            htmlFor="transition-reason"
            required
            hint="السبب يُحفظ في سجل الطلب ولا يمكن تعديله لاحقًا."
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </FormField>

          <div className="mt-1 flex items-center gap-1">
            <Button
              type="button"
              variant="primary"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() => run(active, reason)}
            >
              تأكيد
            </Button>
            <Button type="button" onClick={() => setActive(null)} disabled={pending}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
