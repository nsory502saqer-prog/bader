'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { DocType } from '@prisma/client';
import { FileIcon, TrashIcon } from '@primer/octicons-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState, Flash } from '@/components/ui/surface';
import { formatDate } from '@/lib/format';
import { deleteAttachment, uploadAttachment } from '@/server/actions/attachment-actions';
import { DOC_TYPE_LABELS } from '@/lib/doc-types';

export type AttachmentRow = {
  id: string;
  originalName: string;
  docType: DocType;
  size: number;
  mimeType: string;
  uploadedAt: Date;
  uploadedBy: { name: string };
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
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

          <span className="text-xs text-fg-muted">JPG · PNG · WebP · PDF — حتى 10MB</span>
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <EmptyState title="لا توجد مرفقات" />
      ) : (
        <ul className="divide-y divide-[var(--borderColor-default)]">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-1 px-2 py-1">
              <a
                href={`/api/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1 text-sm text-fg-link hover:underline"
              >
                <FileIcon size={16} className="shrink-0" />
                <span className="truncate">{a.originalName}</span>
              </a>

              <span className="flex items-center gap-1 text-xs text-fg-muted">
                <span>{DOC_TYPE_LABELS[a.docType]}</span>
                <span>·</span>
                <span className="tnum">{formatSize(a.size)}</span>
                <span>·</span>
                <span>{a.uploadedBy.name}</span>
                <span>·</span>
                <span className="tnum">{formatDate(a.uploadedAt)}</span>
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
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
