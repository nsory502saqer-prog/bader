import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  validateUpload,
  verifyMagicBytes,
} from '@/lib/storage';

/** ملف وهمي بالحجم والنوع المطلوبين، بلا قراءة قرص. */
function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

describe('التحقق من المرفوعات', () => {
  it('يرفض الملف الفارغ', () => {
    expect(validateUpload(fakeFile('a.pdf', 'application/pdf', 0))).toContain('فارغ');
  });

  it('يرفض ما يتجاوز 10 ميجابايت', () => {
    const error = validateUpload(fakeFile('a.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1));
    expect(error).toContain('10 ميجابايت');
  });

  it('يقبل الأنواع المسموحة عند الحجم الصحيح', () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(validateUpload(fakeFile('f', mime, 1024)), mime).toBeNull();
    }
  });

  it('يرفض الأنواع الخطرة', () => {
    for (const mime of [
      'application/x-msdownload',
      'text/html',
      'application/javascript',
      'application/zip',
      '',
    ]) {
      expect(validateUpload(fakeFile('f', mime, 1024)), mime).toContain('غير مسموح');
    }
  });
});

describe('توقيع الملف (Magic bytes)', () => {
  // النوع المعلن يأتي من المتصفح ويُزوَّر بتغيير الامتداد، فالتوقيع هو الفاصل.
  const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
  // MZ = بداية ملف تنفيذي على ويندوز.
  const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

  it('يقبل الملف الذي يطابق توقيعه نوعه', () => {
    expect(verifyMagicBytes(PDF, 'application/pdf')).toBe(true);
    expect(verifyMagicBytes(PNG, 'image/png')).toBe(true);
    expect(verifyMagicBytes(JPEG, 'image/jpeg')).toBe(true);
    expect(verifyMagicBytes(WEBP, 'image/webp')).toBe(true);
  });

  it('يرفض ملفًا تنفيذيًا متنكّرًا في هيئة PDF أو صورة', () => {
    expect(verifyMagicBytes(EXE, 'application/pdf')).toBe(false);
    expect(verifyMagicBytes(EXE, 'image/png')).toBe(false);
    expect(verifyMagicBytes(EXE, 'image/jpeg')).toBe(false);
  });

  it('يرفض تبديل النوع بين صيغتين مسموحتين', () => {
    expect(verifyMagicBytes(PNG, 'application/pdf')).toBe(false);
    expect(verifyMagicBytes(PDF, 'image/png')).toBe(false);
  });

  it('يرفض الملف الأقصر من توقيعه', () => {
    expect(verifyMagicBytes(Buffer.from([0x89]), 'image/png')).toBe(false);
    expect(verifyMagicBytes(Buffer.alloc(0), 'application/pdf')).toBe(false);
  });

  it('يرفض نوعًا غير معروف أصلًا', () => {
    expect(verifyMagicBytes(PDF, 'application/x-msdownload')).toBe(false);
  });
});
