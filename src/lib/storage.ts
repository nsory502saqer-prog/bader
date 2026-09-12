import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * تخزين المرفقات.
 *
 * مزوّدان خلف واجهة واحدة: القرص المحلي للتطوير، وتخزين متوافق مع S3
 * للإنتاج. التبديل بمتغيّر بيئة واحد بلا تعديل كود.
 *
 * قاعدتان ملزمتان:
 *   1. **لا ملف يُخدَم من مسار عام إطلاقًا.** المرفقات تقارير طبية وصور
 *      هوية؛ القراءة تمرّ دائمًا بـ`/api/attachments/[id]` الذي يتحقق من
 *      الجلسة والصلاحية قبل أن يقرأ بايتًا واحدًا. لذلك لا يستعمل هذا الملف
 *      روابط موقّعة مؤقتة: الرابط الموقّع يتسرّب فيُفتح بلا جلسة.
 *   2. **الإنتاج داخل المملكة.** الحاوية يجب أن تكون في منطقة سعودية أو على
 *      تخزين مستضاف محليًا — النظام يخضع لنظام حماية البيانات الشخصية.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/** توقيعات الملفات — الامتداد ونوع MIME المعلن كلاهما يُزوَّر بسهولة. */
const MAGIC_BYTES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
];

export type StoredFile = {
  filePath: string;
  size: number;
  mimeType: string;
  originalName: string;
  /** مسار المصغّرة — للصور فقط */
  thumbPath: string | null;
};

/** أبعاد المصغّرة كما تحدّدها مواصفة الواجهة: مربّع 64×64 بقصّ مركزي. */
export const THUMB_SIZE = 64;

/** أقصى بُعد للصورة المخزَّنة بعد الضغط. */
const MAX_IMAGE_DIMENSION = 2000;

const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Driver = 'local' | 's3';

function driver(): Driver {
  return process.env['STORAGE_DRIVER'] === 's3' ? 's3' : 'local';
}

// ───────────────────────────── التحقق ─────────────────────────────

export function validateUpload(file: File): string | null {
  if (file.size === 0) return 'الملف فارغ.';
  if (file.size > MAX_UPLOAD_BYTES) return 'حجم الملف يتجاوز 10 ميجابايت.';
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return 'نوع الملف غير مسموح. المسموح: JPG وPNG وWebP وPDF.';
  }
  return null;
}

/**
 * يتحقق أن محتوى الملف يطابق نوعه المعلن.
 *
 * `file.type` يأتي من المتصفح ويُزوَّر بتغيير الامتداد، فملف تنفيذي باسم
 * `.pdf` يمرّ من الفحص السطحي. قراءة التوقيع تمنع ذلك.
 */
export function verifyMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const signature = MAGIC_BYTES.find((m) => m.mime === declaredMime);
  if (!signature) return false;

  const offset = signature.offset ?? 0;
  if (buffer.length < offset + signature.bytes.length) return false;

  return signature.bytes.every((byte, index) => buffer[offset + index] === byte);
}

// ───────────────────────────── القرص المحلي ─────────────────────────────

function localRoot(): string {
  return path.resolve(process.env['STORAGE_LOCAL_PATH'] ?? './storage');
}

/** يمنع أي محاولة لتجاوز جذر التخزين عبر مسار نسبي. */
function resolveWithinRoot(relative: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('مسار الملف غير صالح.');
  }
  return resolved;
}

// ───────────────────────────── S3 ─────────────────────────────

let cachedClient: S3Client | null = null;

function s3(): { client: S3Client; bucket: string } {
  const bucket = process.env['S3_BUCKET'];
  const region = process.env['S3_REGION'] ?? 'me-south-1';
  const accessKeyId = process.env['S3_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY'];

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('إعدادات تخزين S3 ناقصة: تحقق من S3_BUCKET والمفاتيح.');
  }

  cachedClient ??= new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    // نقطة نهاية مخصّصة للتخزين المستضاف محليًا (MinIO أو مزوّد سعودي).
    ...(process.env['S3_ENDPOINT']
      ? { endpoint: process.env['S3_ENDPOINT'], forcePathStyle: true }
      : {}),
  });

  return { client: cachedClient, bucket };
}

/** يحوّل تدفق الاستجابة إلى Buffer. */
async function streamToBuffer(body: unknown): Promise<Buffer> {
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ───────────────────────────── معالجة الصور ─────────────────────────────

/**
 * ضغط الصورة قبل التخزين.
 *
 * موظف الاستقبال يصوّر التقرير بجوال حديث، فيصل ملف بـ12 ميجابكسل لصورة
 * ورقة A4. تخزينه كما هو يضاعف تكلفة التخزين ويبطّئ فتح الملف على اتصال
 * ضعيف بلا أي مكسب: القراءة لا تحتاج أكثر من 2000 بكسل.
 *
 * WebP لأنها أصغر من JPEG بجودة مكافئة، و`rotate()` بلا وسيط يطبّق دوران
 * EXIF — بدونه تظهر صور الجوال مقلوبة.
 */
async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!COMPRESSIBLE.has(mimeType)) return null;

  try {
    const sharp = (await import('sharp')).default;
    const output = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        // لا تكبير: صورة صغيرة أصلًا تبقى كما هي.
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    // لا فائدة من استبدال الأصل بنسخة أكبر.
    return output.length < buffer.length ? { buffer: output, mimeType: 'image/webp' } : null;
  } catch {
    // فشل المعالجة لا يمنع الرفع: الأصل يُخزَّن كما هو.
    return null;
  }
}

/** مصغّرة مربّعة بقصّ مركزي — تُعرض في قائمة المرفقات. */
async function makeThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (!COMPRESSIBLE.has(mimeType)) return null;

  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer)
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

// ───────────────────────────── الواجهة ─────────────────────────────

/** يكتب بايتات إلى المزوّد الحالي تحت المفتاح المعطى. */
async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (driver() === 's3') {
    const { client, bucket } = s3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // تشفير في حالة السكون على مستوى الكائن.
        ServerSideEncryption: 'AES256',
        // الحاوية خاصة: لا قراءة عامة مهما كانت سياسة الحاوية.
        ACL: 'private',
      }),
    );
    return;
  }

  const destination = resolveWithinRoot(key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body);
}

export async function storeFile(file: File, prefix: string): Promise<StoredFile> {
  const original = Buffer.from(await file.arrayBuffer());

  if (!verifyMagicBytes(original, file.type)) {
    throw new Error('محتوى الملف لا يطابق نوعه المعلن. قد يكون تالفًا أو مزوَّرًا.');
  }

  const compressed = await compressImage(original, file.type);
  const body = compressed?.buffer ?? original;
  const mimeType = compressed?.mimeType ?? file.type;

  // اسم عشوائي: اسم الملف الأصلي قد يحمل اسم مريض أو رقم هوية، فلا يصير
  // جزءًا من مسار قد يظهر في سجل أو رابط.
  const extension = compressed
    ? '.webp'
    : path.extname(file.name).slice(0, 10).replace(/[^.\w]/g, '');
  const id = randomUUID();
  const key = `${prefix}/${id}${extension}`;

  await putObject(key, body, mimeType);

  let thumbPath: string | null = null;
  const thumb = await makeThumbnail(original, file.type);
  if (thumb) {
    thumbPath = `${prefix}/${id}-thumb.webp`;
    await putObject(thumbPath, thumb, 'image/webp');
  }

  return {
    filePath: key,
    size: body.length,
    mimeType,
    originalName: file.name.slice(0, 255),
    thumbPath,
  };
}

export async function readStoredFile(filePath: string): Promise<Buffer> {
  if (driver() === 's3') {
    const { client, bucket } = s3();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: filePath }),
    );
    if (!response.Body) throw new Error('الملف غير موجود في التخزين.');
    return streamToBuffer(response.Body);
  }

  return readFile(resolveWithinRoot(filePath));
}

/**
 * حذف فعلي من التخزين.
 *
 * لا يُستدعى من حذف المرفق في الواجهة — ذاك حذف ناعم يبقي السجل والملف معًا.
 * هذا للتنظيف الإداري بعد انقضاء مدة الاحتفاظ النظامية.
 */
export async function deleteStoredFile(filePath: string): Promise<void> {
  if (driver() === 's3') {
    const { client, bucket } = s3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: filePath }));
    return;
  }

  await unlink(resolveWithinRoot(filePath)).catch(() => {
    // الملف المفقود أصلًا ليس خطأً في سياق التنظيف.
  });
}

/** وصف المزوّد الحالي — يُعرض في شاشة الإعدادات. */
export function storageDescription(): string {
  if (driver() === 's3') {
    const endpoint = process.env['S3_ENDPOINT'];
    const region = process.env['S3_REGION'] ?? 'me-south-1';
    return endpoint ? `S3 متوافق · ${endpoint}` : `S3 · ${region}`;
  }
  return `قرص محلي · ${localRoot()}`;
}
