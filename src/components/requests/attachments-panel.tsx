'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { DocType } from '@prisma/client';
import { FileIcon, TrashIcon, XIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState, Flash } from '@/components/ui/surface';
import { formatDate } from '@/lib/format';
import { DOC_TYPE_LABELS } from '@/lib/doc-types';
import { deleteAttachment, uploadAttachment } from '@/server/actions/attachment-actions';

export type AttachmentRow = {
  id: string;
  originalName: string;
  docType: DocType;
  size: number;
  mimeType: string;
  thumbPath: string | null;
  uploadedAt: Date;
  uploadedBy: { name: string };
};

/** مقاس المصغّرة كما تحدّده مواصفة الواجهة. */
const THUMB = 64;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

/**
 * عارض الصورة بالحجم الكامل.
 *
 * نافذة منبثقة بسيطة لا مكتبة: تُغلق بالمفتاح Escape وبالنقر خارج الصورة،
 * وتُعيد التركيز لما كان عليه قبل الفتح — وهذا كل ما يحتاجه عرض صورة.
 */
function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center p-2"
    >
      <button
        type="button"
        aria-label="إغلاق العارض"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--bgColor-inverse)] opacity-75"
      />

      <div className="relative max-h-full max-w-full overflow-auto rounded border border-border bg-canvas">
        <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
          <span className="truncate text-sm font-semibold text-fg">{alt}</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded text-fg-muted hover:bg-[var(--bgColor-neutral-muted)] hover:text-fg"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* الأبعاد صريحة لمنع إزاحة التخطيط، والقياس الفعلي بالـCSS. */}
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={1200}
          unoptimized
          className="block h-auto max-h-[80vh] w-auto max-w-[90vw] object-contain"
        />
      </div>
    </div>
  );
}

export function AttachmentsPanel({
  requestId,
  attachments,
  canUpload,
  canDelete,
}: {
  requestId: string;
  attachments: AttachmentRow[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>('medical_report');
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('docType', docType);
      formData.set('file', file);

      const result = await uploadAttachment(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteAttachment(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {error ? <Flash tone="danger">{error}</Flash> : null}

      {canUpload ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
          <Select
            aria-label="نوع المستند"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-[160px]"
          >
            {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="text-sm text-fg file:me-1 file:rounded file:border file:border-border file:bg-canvas-subtle file:px-1 file:py-0.5 file:text-sm file:font-semibold file:text-fg"
          />

          <span className="text-xs text-fg-muted">
            JPG · PNG · WebP · PDF — حتى 10MB، والصور تُضغط تلقائيًا
          </span>
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <EmptyState title="لا توجد مرفقات" />
      ) : (
        <ul className="divide-y divide-[var(--borderColor-default)]">
          {attachments.map((a) => {
            const isImage = a.thumbPath !== null;
            const href = `/api/attachments/${a.id}`;

            return (
              <li key={a.id} className="flex items-center gap-2 px-2 py-1">
                {/*
                  المقاس على الصورة نفسها لا على الغلاف: الحدّ بـbox-sizing
                  يقتطع بكسلين من كل بُعد، فتصير المصغّرة 62 بدل 64.
                */}
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => setViewing(a)}
                    aria-label={`عرض ${a.originalName} بالحجم الكامل`}
                    className="inline-flex shrink-0 overflow-hidden rounded border border-border"
                  >
                    {/* أبعاد صريحة تمنع إزاحة التخطيط أثناء التحميل. */}
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
                    {a.uploadedBy.name} · <span className="tnum">{formatDate(a.uploadedAt)}</span>
                  </p>
                </div>

                {canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    aria-label={`حذف ${a.originalName}`}
                    disabled={pending}
                    onClick={() => remove(a.id)}
                  >
                    <TrashIcon size={16} />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {viewing ? (
        <Lightbox
          src={`/api/attachments/${viewing.id}`}
          alt={viewing.originalName}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
