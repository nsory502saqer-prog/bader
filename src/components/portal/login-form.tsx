'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { Flash } from '@/components/ui/surface';
import { requestPortalOtp, verifyPortalOtp } from '@/server/actions/portal-actions';

/**
 * دخول البوابة برمز تحقق.
 *
 * خطوتان: رقم الهوية ← رمز يصل للجوال المسجّل. لا كلمة مرور، لأن جمهور
 * البوابة لا يدير كلمات مرور، ولأن الجوال المسجّل لدى الجمعية هو أصلًا
 * قناة التواصل المعتمدة.
 */
export function PortalLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<'id' | 'code'>('id');
  const [nationalId, setNationalId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function askForCode() {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await requestPortalOtp({ nationalId });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNotice(
        result.data.hint
          ? `${result.data.message} (${result.data.hint})`
          : result.data.message,
      );
      setStep('code');
    });
  }

  function submitCode() {
    setError(null);

    startTransition(async () => {
      const result = await verifyPortalOtp({ nationalId, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push('/portal/requests');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}
      {notice ? <Flash tone="accent">{notice}</Flash> : null}

      {step === 'id' ? (
        <>
          <FormField
            label="رقم الهوية"
            htmlFor="portal-nid"
            required
            hint="10 أرقام، كما هي مسجّلة لدى الجمعية"
          >
            <Input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  askForCode();
                }
              }}
              inputMode="numeric"
              maxLength={10}
              dir="ltr"
              className="tnum text-start"
              autoComplete="off"
            />
          </FormField>

          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={nationalId.trim().length !== 10}
            onClick={askForCode}
          >
            أرسل رمز الدخول
          </Button>
        </>
      ) : (
        <>
          <FormField
            label="رمز الدخول"
            htmlFor="portal-code"
            required
            hint="ستة أرقام، صالحة لخمس دقائق"
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCode();
                }
              }}
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              className="tnum text-start"
              autoComplete="one-time-code"
              autoFocus
            />
          </FormField>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="primary"
              loading={pending}
              disabled={code.trim().length !== 6}
              onClick={submitCode}
            >
              دخول
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setStep('id');
                setCode('');
                setNotice(null);
                setError(null);
              }}
            >
              تغيير رقم الهوية
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
