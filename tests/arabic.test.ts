import { describe, expect, it } from 'vitest';
import {
  cleanDisplayText,
  maskNationalId,
  normalizeArabic,
  normalizePhone,
  toLatinDigits,
} from '@/lib/arabic';

describe('normalizeArabic', () => {
  it('يوحّد الهمزات والتاء المربوطة فيلتقي «عائشة» بـ«عايشه»', () => {
    expect(normalizeArabic('عائشة')).toBe(normalizeArabic('عايشه'));
  });

  it('يوحّد ألف الهمزة بأشكالها', () => {
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('إبراهيم')).toBe('ابراهيم');
    expect(normalizeArabic('آمنة')).toBe('امنه');
  });

  it('يحذف التشكيل والتطويل', () => {
    expect(normalizeArabic('مُحَمَّـــد')).toBe('محمد');
  });

  it('يضغط المسافات الزائدة', () => {
    expect(normalizeArabic('  علي   حسن  ')).toBe('علي حسن');
  });

  it('يحوّل الأرقام العربية‑الهندية', () => {
    expect(normalizeArabic('١٢٣٤')).toBe('1234');
  });

  it('يعيد نصًا فارغًا للمدخل الفارغ', () => {
    expect(normalizeArabic('')).toBe('');
  });
});

describe('cleanDisplayText', () => {
  it('يبقي الهمزة والتاء المربوطة كما كتبها المستخدم', () => {
    expect(cleanDisplayText('  عائشة   عبدالله ')).toBe('عائشة عبدالله');
  });
});

describe('toLatinDigits', () => {
  it('يحوّل الأرقام الفارسية والعربية‑الهندية', () => {
    expect(toLatinDigits('١٠٥٠٠٠٠٠٠٠')).toBe('1050000000');
    expect(toLatinDigits('۱۲۳')).toBe('123');
  });
});

describe('normalizePhone', () => {
  it('يقبل الصيغة المحلية', () => {
    expect(normalizePhone('0501234567')).toBe('0501234567');
  });

  it('يحوّل الصيغة الدولية إلى المحلية', () => {
    expect(normalizePhone('+966501234567')).toBe('0501234567');
    expect(normalizePhone('00966501234567')).toBe('0501234567');
    expect(normalizePhone('966501234567')).toBe('0501234567');
  });

  it('يتجاهل المسافات والشرطات', () => {
    expect(normalizePhone('050 123 4567')).toBe('0501234567');
    expect(normalizePhone('050-123-4567')).toBe('0501234567');
  });

  it('يرفض ما ليس جوالًا سعوديًا', () => {
    expect(normalizePhone('0121234567')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('maskNationalId', () => {
  it('يخفي الأرقام الوسطى', () => {
    expect(maskNationalId('1234567816')).toBe('1XXXXXX816');
  });

  it('يترك ما ليس عشرة أرقام كما هو', () => {
    expect(maskNationalId('123')).toBe('123');
  });
});
