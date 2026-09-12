import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, encryptionEnabled, isEncrypted, resetKeyCache } from '@/lib/encryption';

/** مفتاح ثابت للاختبار — لا علاقة له بمفتاح أي بيئة حقيقية. */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

describe('التشفير مفعَّلًا', () => {
  beforeEach(() => {
    process.env['ENCRYPTION_KEY'] = TEST_KEY;
    resetKeyCache();
  });

  afterEach(() => {
    delete process.env['ENCRYPTION_KEY'];
    resetKeyCache();
  });

  it('يشفّر ويفكّ نصًا عربيًا كما هو حرفًا بحرف', () => {
    const plain = 'المريضة تحتاج مرافقة دائمة، وتعاني ضعفًا في البصر.';
    const cipher = encrypt(plain);

    expect(cipher).not.toBe(plain);
    expect(isEncrypted(cipher)).toBe(true);
    expect(decrypt(cipher)).toBe(plain);
  });

  it('ينتج نصًا مشفَّرًا مختلفًا في كل مرة رغم تطابق المدخل', () => {
    // متجه تهيئة عشوائي: تكرار النص لا يكشف تكراره في القاعدة.
    const a = encrypt('نفس النص');
    const b = encrypt('نفس النص');

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('نفس النص');
    expect(decrypt(b)).toBe('نفس النص');
  });

  it('لا يضاعف التشفير عند الاستدعاء مرتين', () => {
    const once = encrypt('نص');
    expect(encrypt(once)).toBe(once);
  });

  it('يترك النص الفارغ كما هو', () => {
    expect(encrypt('')).toBe('');
  });

  it('يمرّر النص غير المشفَّر عند الفكّ بلا تغيير', () => {
    // السجلات المكتوبة قبل تفعيل التشفير تُقرأ بلا كسر.
    expect(decrypt('ملاحظة قديمة غير مشفَّرة')).toBe('ملاحظة قديمة غير مشفَّرة');
  });

  it('يكتشف العبث بالنص المشفَّر بدل أن يمرّره', () => {
    const cipher = encrypt('الرصيد المستحق 5000');

    // قلب محرف واحد في النص المشفَّر.
    const tampered =
      cipher.slice(0, -6) + (cipher.at(-6) === 'A' ? 'B' : 'A') + cipher.slice(-5);

    const result = decrypt(tampered);
    expect(result).not.toBe('الرصيد المستحق 5000');
    expect(result).toContain('تعذّر فكّ التشفير');
  });

  it('يرفض مفتاحًا بطول خاطئ بدل أن يشفّر بضعف', () => {
    process.env['ENCRYPTION_KEY'] = Buffer.alloc(16, 1).toString('base64');
    resetKeyCache();

    expect(() => encrypt('نص')).toThrow(/32 بايت/);
  });
});

describe('التشفير معطَّلًا', () => {
  beforeEach(() => {
    delete process.env['ENCRYPTION_KEY'];
    resetKeyCache();
  });

  it('يمرّر النص كما هو فلا يتعطّل التطوير المحلي', () => {
    expect(encryptionEnabled()).toBe(false);
    expect(encrypt('نص')).toBe('نص');
  });

  it('لا يعرض قمامة لقيمة مشفَّرة بلا مفتاح', () => {
    // حالة واقعية: قاعدة إنتاج نُسخت لخادم بلا المفتاح.
    const result = decrypt('enc:v1:YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=');
    expect(result).toContain('مفتاح التشفير غير مضبوط');
  });
});
