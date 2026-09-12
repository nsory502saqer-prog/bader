'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Flash } from '@/components/ui/surface';
import { removeLogo, uploadLogo } from '@/server/actions/logo-actions';

/**
 * رفع شعار الجمعية.
 *
 * الشعار يظهر في ترويسة أمر الصرف المطبوع الذي يخرج للمستفيدين، فتغييره
 * قرار مرئي للناس لا إعداد داخلي — لذلك تُعرض معاينة قبل الحفظ وبعده.
 */
export function LogoUploader({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // يُبدَّل بعد كل رفع ليتجاوز ذاكرة المتصفح المؤقتة، وإلا بقي الشعار القديم
  // معروضًا رغم نجاح الرفع.
  const [version, setVersion] = useState(0);

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('logo', file);

      const result = await uploadLogo(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (inputRef.current) inputRef.current.value = '';
      setVersion((v) => v + 1);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeLogo();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVersion((v) => v + 1);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      <div className="flex flex-wrap items-center gap-2">
        {hasLogo ? (
          <Image
            key={version}
            src={`/api/logo?v=${version}`}
            alt="شعار الجمعية الحالي"
            width={64}
            height={64}
            unoptimized
            className="rounded border border-border bg-[var(--bgColor-white)] p-0.5"
            style={{ width: 64, height: 64, objectFit: 'contain' }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded border border-dashed border-border text-xs text-fg-muted"
            style={{ width: 64, height: 64 }}
          >
            بلا شعار
          </span>
        )}

        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="text-sm text-fg file:me-1 file:rounded file:border file:border-border file:bg-canvas-subtle file:px-1 file:py-0.5 file:text-sm file:font-semibold file:text-fg"
          />

          {hasLogo ? (
            <div>
              <Button type="button" size="sm" variant="danger" disabled={pending} onClick={remove}>
                إزالة الشعار
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="prose-limit text-xs text-fg-muted">
        PNG أو WebP أو JPG، حتى 1 ميجابايت. يظهر في ترويسة أمر الصرف المطبوع وشاشة الدخول
        وبوابة المستفيدين. صيغة SVG غير مقبولة لأنها تحتمل سكربتات.
      </p>
    </div>
  );
}
