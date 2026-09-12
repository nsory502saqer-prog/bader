'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DocType } from '@prisma/client';
import { FileIcon, XIcon } from '@primer/octicons-react';
import { EmptyState } from '@/components/ui/surface';
import { formatDate } from '@/lib/format';
import { DOC_TYPE_LABELS } from '@/lib/doc-types';

export type BeneficiaryAttachmentRow = {
  id: string;
  originalName: string;
  thumbPath: string | null;
  docType: DocType;
  size: number;
  uploadedAt: Date;
  uploadedBy: { name: string };
  request: { id: string; requestNo: string };
};

const THUMB = 64;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

/**
 * مرفقات المستفيد عبر كل طلباته.
 *
 * للاطّلاع فقط: الرفع يقع في سياق طلب بعينه، فلا معنى لرفع مرفق «للمستفيد»
 * بلا طلب يربطه. لذلك كل صف يذكر رقم الطلب الذي جاء منه ويربط إليه.
 */
export function BeneficiaryAttachments({
  attachments,
}: {
  attachments: BeneficiaryAttachmentRow[];
}) {
  const [viewing, setViewing] = useState<BeneficiaryAttachmentRow | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!viewing) return;

    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewing(null);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [viewing]);

  if (attachments.length === 0) {
    return (
      <EmptyState
        title="لا توجد مرفقات"
        description="تُرفع المرفقات من صفحة الطلب، وتظهر هنا مجمَّعة عبر كل طلبات المستفيد."
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-[var(--borderColor-default)]">
        {attachments.map((a) => {
          const href = `/api/attachments/${a.id}`;
          const isImage = a.thumbPath !== null;

          return (
            <li key={a.id} className="flex items-center gap-2 px-2 py-1">
              {isImage ? (
                <button
                  type="button"
                  onClick={() => setViewing(a)}
                  aria-label={`عرض ${a.originalName} بالحجم الكامل`}
                  className="inline-flex shrink-0 overflow-hidden rounded border border-border"
                >
                  <Image
                    src={`${href}?thumb=1`}
                    alt=""
                    width={THUMB}
                    height={THUMB}
                    unoptimized
                    className="block object-cover"
                    style={{ width: THUMB, height: THUMB }}
                  />
                </button>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center justify-center rounded border border-border bg-canvas-subtle text-fg-muted"
                  style={{ width: THUMB + 2, height: THUMB + 2 }}
                >
                  <FileIcon size={24} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm text-fg-link hover:underline"
                >
                  {a.originalName}
                </a>
                <p className="text-xs text-fg-muted">
                  {DOC_TYPE_LABELS[a.docType]} · <span className="tnum">{formatSize(a.size)}</span>
                </p>
                <p className="text-xs text-fg-muted">
                  من الطلب{' '}
                  <Link
                    href={`/requests/${a.request.id}`}
                    className="tnum text-fg-link hover:underline"
                  >
                    {a.request.requestNo}
                  </Link>{' '}
                  · {a.uploadedBy.name} · <span className="tnum">{formatDate(a.uploadedAt)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {viewing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewing.originalName}
          className="fixed inset-0 z-50 flex items-center justify-center p-2"
        >
          <button
            type="button"
            aria-label="إغلاق العارض"
            onClick={() => setViewing(null)}
            className="absolute inset-0 bg-[var(--bgColor-inverse)] opacity-75"
          />

          <div className="relative max-h-full max-w-full overflow-auto rounded border border-border bg-canvas">
            <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
              <span className="truncate text-sm font-semibold text-fg">
                {viewing.originalName}
              </span>
              <button
                ref={closeRef}
                type="button"
                aria-label="إغلاق"
                onClick={() => setViewing(null)}
                className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded text-fg-muted hover:bg-[var(--bgColor-neutral-muted)] hover:text-fg"
              >
                <XIcon size={16} />
              </button>
            </div>

            <Image
              src={`/api/attachments/${viewing.id}`}
              alt={viewing.originalName}
              width={1200}
              height={1200}
              unoptimized
              className="block h-auto max-h-[80vh] w-auto max-w-[90vw] object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
