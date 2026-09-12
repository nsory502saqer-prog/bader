import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * تخزين المرفقات.
 *
 * الواجهة مجرَّدة عن المزوّد: التطوير يكتب على القرص المحلي، والإنتاج يضبط
 * `STORAGE_DRIVER=s3` فيكتب على تخزين متوافق مع S3 مستضاف داخل المملكة.
 * لا يُعرض ملف مباشرة من مسار عام إطلاقًا — القراءة تمر عبر مسار محمي يتحقق
 * من الصلاحية أولًا.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export type StoredFile = {
  filePath: string;
  size: number;
  mimeType: string;
  originalName: string;
};

function localRoot(): string {
  return path.resolve(process.env['STORAGE_LOCAL_PATH'] ?? './storage');
}

/** يمنع أي محاولة لتجاوز جذر التخزين عبر مسار نسبي في اسم الملف. */
function resolveWithinRoot(relative: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('مسار الملف غير صالح.');
  }
  return resolved;
}

export function validateUpload(file: File): string | null {
  if (file.size === 0) return 'الملف فارغ.';
  if (file.size > MAX_UPLOAD_BYTES) return 'حجم الملف يتجاوز 10 ميجابايت.';
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return 'نوع الملف غير مسموح. المسموح: JPG وPNG وWebP وPDF.';
  }
  return null;
}

export async function storeFile(file: File, prefix: string): Promise<StoredFile> {
  const extension = path.extname(file.name).slice(0, 10) || '';
  const key = `${prefix}/${randomUUID()}${extension}`;

  const driver = process.env['STORAGE_DRIVER'] ?? 'local';
  if (driver !== 'local') {
    throw new Error('مزوّد التخزين السحابي غير مهيّأ بعد. اضبط STORAGE_DRIVER=local للتطوير.');
  }

  const destination = resolveWithinRoot(key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return {
    filePath: key,
    size: file.size,
    mimeType: file.type,
    originalName: file.name.slice(0, 255),
  };
}

export async function readStoredFile(filePath: string): Promise<Buffer> {
  const driver = process.env['STORAGE_DRIVER'] ?? 'local';
  if (driver !== 'local') throw new Error('مزوّد التخزين السحابي غير مهيّأ بعد.');
  return readFile(resolveWithinRoot(filePath));
}
