'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { deliverOrder } from '@/server/actions/disbursement-actions';

/**
 * شاشة التسليم.
 * التسليم يُغلق الطلب نهائيًا، فاسم المستلم إلزامي — هو الأثر الوحيد الذي
 * يُثبت من استلم الجهاز إن رُوجع الأمر لاحقًا.
 */
export function DeliverForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [receivedByName, setReceivedByName] = useState('');
  const [note, setNote] = useState('');

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deliverOrder({ orderId, receivedByName, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      <FormField
        label="اسم المستلم"
        htmlFor="received-by"
        required
        hint="اسم من استلم فعليًا: المستفيد أو من ينوب عنه."
      >
        <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
      </FormField>

      <FormField label="ملاحظة التسليم" htmlFor="deliver-note">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </FormField>

      <div>
        <Button
          type="button"
          variant="primary"
          loading={pending}
          disabled={receivedByName.trim().length < 3}
          onClick={submit}
        >
          تأكيد التسليم وإغلاق الطلب
        </Button>
      </div>
    </div>
  );
}
