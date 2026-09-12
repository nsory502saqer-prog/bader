/**
 * تطبيع النص العربي.
 *
 * القاعدة الحاكمة: `full_name` يُحفظ كما أدخله المستخدم حرفيًا، ولا يُمَس أبدًا.
 * التطبيع يُطبَّق على `name_normalized` فقط، وهو حقل داخلي للبحث لا يُعرض في الواجهة.
 */

/** التشكيل والحركات وعلامات الإطالة */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;

/** التطويل (الكشيدة) */
const TATWEEL = /ـ/g;

/** المحارف غير الطابعة التي تتسلل من النسخ واللصق */
const ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;

/** كل ما ليس حرفًا عربيًا أو لاتينيًا أو رقمًا أو مسافة */
const NON_WORD = /[^ء-يa-zA-Z0-9\s]/g;

/** الأرقام العربية‑الهندية والفارسية → أرقام لاتينية */
const EASTERN_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * يحوّل الأرقام العربية‑الهندية إلى لاتينية.
 * يُستعمل قبل التحقق من رقم الهوية والجوال، لأن الموظف قد يكتب بلوحة مفاتيح عربية.
 */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d);
}

/**
 * التطبيع الكامل للبحث:
 * إزالة التشكيل والتطويل، وتوحيد (أ إ آ ٱ ← ا) و(ة ← ه) و(ى ← ي) و(ؤ ئ ← و ي)،
 * ثم حذف علامات الترقيم وضغط المسافات.
 *
 * الهدف: أن يجد البحث عن «عائشة» السجلَّ المخزَّن باسم «عايشه».
 */
export function normalizeArabic(input: string): string {
  if (!input) return '';

  return toLatinDigits(input)
    .replace(ZERO_WIDTH, '')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/گ/g, 'ك')
    .replace(/پ/g, 'ب')
    .replace(/چ/g, 'ج')
    .replace(/ژ/g, 'ز')
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * تنظيف خفيف لما يُحفظ في `full_name`: حذف المحارف غير الطابعة وضغط المسافات فقط.
 * لا يمسّ الهمزات ولا التاء المربوطة — الاسم يبقى كما كتبه صاحبه.
 */
export function cleanDisplayText(input: string): string {
  return input.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

/** إخفاء جزئي لرقم الهوية في القوائم: 1234567890 ← 1XXXXXX890 */
export function maskNationalId(nationalId: string): string {
  if (nationalId.length !== 10) return nationalId;
  return `${nationalId.slice(0, 1)}XXXXXX${nationalId.slice(7)}`;
}

/** توحيد صيغة الجوال إلى 05XXXXXXXX للتخزين */
export function normalizePhone(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[\s\-()]/g, '');
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^\+9665\d{8}$/.test(digits)) return `0${digits.slice(4)}`;
  if (/^009665\d{8}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}
