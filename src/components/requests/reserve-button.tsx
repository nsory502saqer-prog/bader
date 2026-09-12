'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Flash } from '@/components/ui/surface';
import { reserveRequestItems } from '@/server/actions/inventory-actions';

/**
 * فحص التوفّر وحجز المتاح.
 *
 * البند المتوفر يُحجز فيصير «متوفر بالمستودع»، وغير المتوفر يتحوّل تلقائيًا
 * إلى «يحتاج شراء» فيظهر في لوحة المشتريات — بلا خطوة يدوية بين القسمين.
 */
export function ReserveButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'success' | 'attention'; text: string } | null>(
    null,
  );

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await reserveRequestItems(requestId);

      setMessage(
        result.ok
          ? { tone: 'success', text: `حُجز ${result.data.reserved} بندًا على المخزون.` }
          : { tone: 'attention', text: result.error },
      );

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {message ? <Flash tone={message.tone}>{message.text}</Flash> : null}
      <Button type="button" loading={pending} onClick={run}>
        فحص التوفّر وحجز المتاح
      </Button>
    </div>
  );
}
