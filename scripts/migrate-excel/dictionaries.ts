import { RequestStatus } from '@prisma/client';
import { normalizeArabic } from '../../src/lib/arabic.js';

/**
 * قواميس الترحيل.
 *
 * كل ما في هذا الملف مشتقّ من قراءة القيم الفعلية في ملف Excel، لا من تخمين:
 * 29 صياغة مختلفة في عمود «الإنجاز» وحده، و22 في «الضمان»، و484 صياغة مدينة.
 * الهدف طيّ هذا كله إلى القوائم المرجعية المعتمدة.
 */

/** يوحّد النص للمطابقة: تطبيع عربي ثم حذف كل المسافات. */
export function matchKey(input: string): string {
  return normalizeArabic(input).replace(/\s+/g, '');
}

// ───────────────────────────── مصادر الدخل ─────────────────────────────

const INCOME_RULES: [test: (k: string) => boolean, target: string][] = [
  [(k) => k.includes('ضمان'), 'الضمان الاجتماعي'],
  [(k) => k.includes('تامينات'), 'التأمينات الاجتماعية'],
  [(k) => k.includes('تاهيل'), 'تأهيل شامل'],
  [(k) => k.includes('تقاعد'), 'متقاعد'],
  [(k) => k.includes('عاطل'), 'عاطل عن العمل'],
  [(k) => k.includes('ربهمنزل') || k.includes('ربتمنزل'), 'ربة منزل'],
  [(k) => k.includes('راتب'), 'راتب'],
  [(k) => k.includes('موظف'), 'موظف'],
  [(k) => k.includes('طالب'), 'طالب'],
  [(k) => k.includes('عجز') || k.includes('اعانه') || k.includes('اعانة'), 'الضمان الاجتماعي'],
  [(k) => k.includes('لاشي') || k.includes('لايوجد'), 'لا يوجد دخل'],
];

export function mapIncomeSource(raw: string | null): string | null {
  if (!raw) return null;
  const key = matchKey(raw);
  if (!key) return null;
  for (const [test, target] of INCOME_RULES) {
    if (test(key)) return target;
  }
  return null;
}

// ───────────────────────────── الحالات ─────────────────────────────

/**
 * ترتيب القواعد مقصود: الأكثر تقدّمًا في سير العمل أولًا، لأن الصف الواحد قد
 * يحمل قيمًا في أكثر من عمود سير عمل، والحالة النهائية هي الأبعد في المسار.
 */
const STATUS_RULES: [test: (k: string) => boolean, target: RequestStatus][] = [
  [(k) => k.includes('منجز') && !k.includes('غيرمنجز'), RequestStatus.delivered],
  [(k) => k === 'ممجز', RequestStatus.delivered],
  [
    // كل صياغات «تم إصدار أمر صرف ومهمة» السبع تنهار إلى حالة واحدة.
    (k) =>
      k.includes('امرصرف') ||
      k.includes('مسيرصرف') ||
      k.includes('امرالصرف') ||
      k.includes('تمالصرف'),
    RequestStatus.order_issued,
  ],
  [(k) => k.includes('جاهزللصرف'), RequestStatus.ready_to_issue],
  [(k) => k.includes('مشتر'), RequestStatus.purchasing],
  [(k) => k.includes('مستودع'), RequestStatus.warehouse],
  [(k) => k.includes('ملغي') || k.includes('ملغى'), RequestStatus.cancelled],
  [(k) => k.includes('مرفوض'), RequestStatus.rejected],
  [(k) => k.includes('يوجل') || k.includes('مؤجل') || k.includes('موجل'), RequestStatus.on_hold],
  [(k) => k.includes('غيرمنجز') || k.includes('يراجع') || k.includes('بحث'), RequestStatus.screening],
];

/** رتبة الحالة في المسار — تُستعمل لاختيار الأبعد حين تتعارض الأعمدة. */
const STATUS_RANK: Record<RequestStatus, number> = {
  draft: 0,
  submitted: 1,
  screening: 2,
  on_hold: 2,
  approved: 3,
  warehouse: 4,
  purchasing: 4,
  ready_to_issue: 5,
  order_issued: 6,
  delivered: 7,
  rejected: 7,
  cancelled: 7,
};

export function mapStatus(raw: string | null): RequestStatus | null {
  if (!raw) return null;
  const key = matchKey(raw);
  if (!key) return null;
  for (const [test, target] of STATUS_RULES) {
    if (test(key)) return target;
  }
  return null;
}

/**
 * يختار الحالة النهائية من كل أعمدة سير العمل في الصف.
 * أعمدة الإكسل كانت تُملأ بشكل غير منتظم، فيُؤخذ أبعد ما وصله الطلب فعلًا.
 */
export function resolveStatus(values: (string | null)[]): {
  status: RequestStatus;
  matched: boolean;
} {
  let best: RequestStatus | null = null;

  for (const value of values) {
    const mapped = mapStatus(value);
    if (!mapped) continue;
    if (!best || STATUS_RANK[mapped] > STATUS_RANK[best]) best = mapped;
  }

  // صف بلا أي قيمة مفهومة في سير العمل = طلب مقدَّم لم يُفرز بعد.
  return best ? { status: best, matched: true } : { status: RequestStatus.submitted, matched: false };
}

// ───────────────────────────── المدن والأحياء ─────────────────────────────

/** المدن المعتمدة ومفاتيح مطابقتها (تشمل الأخطاء الإملائية الشائعة). */
const CITY_KEYS: [keys: string[], city: string][] = [
  [['جده', 'جدة'], 'جدة'],
  [['مكه', 'مكةالمكرمه', 'مكهالمكرمه'], 'مكة المكرمة'],
  [['الطايف', 'الطائف'], 'الطائف'],
  [['القنفذه'], 'القنفذة'],
  [['خليص'], 'خليص'],
  [['رابغ'], 'رابغ'],
  [['الليث'], 'الليث'],
  [['الكامل'], 'الكامل'],
];

/**
 * يفكّ «جده الحمدانية» إلى مدينة وحي.
 * العمود الأصلي خلط الاثنين في خلية واحدة بـ484 صياغة مختلفة.
 */
export function splitCity(raw: string | null): { city: string | null; district: string | null } {
  if (!raw) return { city: null, district: null };

  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { city: null, district: null };

  const key = matchKey(cleaned);

  for (const [keys, city] of CITY_KEYS) {
    for (const prefix of keys) {
      if (!key.startsWith(prefix)) continue;

      // يُحذف اسم المدينة من بداية النص الأصلي فيبقى الحي بصياغته المكتوبة.
      const words = cleaned.split(' ');
      let consumed = 0;
      let acc = '';
      for (const word of words) {
        acc += matchKey(word);
        consumed += 1;
        if (acc === prefix || acc.startsWith(prefix)) break;
      }

      const district = words.slice(consumed).join(' ').trim();
      return { city, district: district || null };
    }
  }

  // لا مدينة معروفة في البداية: النص كله يُعامل كحي بلا مدينة.
  return { city: null, district: cleaned };
}

// ───────────────────────────── المقاسات ─────────────────────────────

const SIZE_RULES: [pattern: RegExp, size: string][] = [
  [/اكساكسلارج|xxl|اكسكسلارج/i, 'XXL'],
  [/اكسلارج|xl(?!\w)/i, 'XL'],
  [/لارج|كبير|large|l(?!\w)/i, 'L'],
  [/ميديم|مديم|متوسط|وسط|medium|m(?!\w)/i, 'M'],
  [/سمول|صغير|small|s(?!\w)/i, 'S'],
];

/** يستخرج المقاس من نص البند ويعيد النص بعد حذفه. */
export function extractSize(text: string): { size: string | null; rest: string } {
  const key = matchKey(text);

  for (const [pattern, size] of SIZE_RULES) {
    if (pattern.test(key)) {
      const rest = text
        .replace(/مقاس\s*/g, ' ')
        .replace(
          /اكس\s*اكس\s*لارج|اكس\s*لارج|لارج|ميديم|مديم|متوسط|سمول|صغير|كبير|xxl|xl|large|medium|small/gi,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim();
      return { size, rest };
    }
  }

  return { size: null, rest: text };
}

// ───────────────────────────── الأصناف ─────────────────────────────

/**
 * مرادفات الأصناف.
 *
 * المفتاح مطبّع بلا مسافات، والقيمة اسم الصنف كما هو في الكتالوج المعتمد.
 * الترتيب مهم: الأطول والأكثر تحديدًا أولًا، فـ«حفاضات كلوت» قبل «حفاضات».
 */
const ITEM_ALIASES: [keys: string[], item: string][] = [
  // لارتاح
  [['سريرطبيكهربايي', 'سريركهربايي', 'سريرطبيكهرباي'], 'سرير طبي كهربائي'],
  [['سريرطبييدوي', 'سرييدوي', 'سريريدوي'], 'سرير طبي يدوي'],
  [['مرتبهطبيههواييه', 'مرتبههواييه', 'مرتبهطبيههواييه'], 'مرتبة طبية هوائية'],
  [['مرتبهطبيهعاديه', 'مرتبهعاديه', 'مرتبهطبيه', 'مرتبه'], 'مرتبة طبية عادية'],
  [['سريرطبي', 'سرير'], 'سرير طبي كهربائي'],

  // سندي
  [['كرسيمتحرككهرباييي', 'كرسيمتحرككهربايي', 'كرسيكهربايي'], 'كرسي متحرك كهربائي'],
  [['كرسيمتحركطويلالظهر', 'كرسيطويلالظهر'], 'كرسي متحرك طويل الظهر'],
  [['كرسيمتحركاطفال', 'كرسياطفال'], 'كرسي متحرك أطفال'],
  [['كرسيحماممتحرك', 'كرسيحمامعادي', 'كرسيحمام'], 'كرسي حمام متحرك'],
  [['كرسياستحمامشبكي', 'كرسياستحمام'], 'كرسي استحمام شبكي'],
  [['كرسيمتحركعادي', 'كرسيمتحرك', 'كرسي'], 'كرسي متحرك عادي'],
  [['عكازتحتالكتف', 'عكازتحتالابط'], 'عكاز تحت الكتف'],
  [['ووكر', 'مشايهطبيه', 'مشايه'], 'ووكر (مشاية طبية)'],
  [['عكازطبي', 'عكاز', 'عكاكيز'], 'عكاز طبي'],

  // لأسمعك
  [['سماعهاذنطبيه', 'سماعهاذن', 'سماعه'], 'سماعة أذن طبية'],

  // أتوكأ عليها
  [['طرفصناعيتحتالركبه'], 'طرف صناعي تحت الركبة'],
  [['طرفصناعيفوقالركبه'], 'طرف صناعي فوق الركبة'],
  [['استبدالطرفصناعي', 'تبديلطرفصناعي'], 'استبدال طرف صناعي'],
  [['طرفصناعي', 'طرف'], 'طرف صناعي تحت الركبة'],

  // أوكسجين
  [['جهازتنفسبايباب', 'بايباب', 'bipap'], 'جهاز تنفس بايباب (BiPAP)'],
  [
    ['جهازتنفساوتوسيباب', 'جهازتنفسسيباب', 'اوتوسيباب', 'سيباب', 'سياب', 'cpap'],
    'جهاز تنفس سيباب (CPAP)',
  ],
  [['جهازتنفسبخار', 'جهازبخار', 'نبيولايزر'], 'جهاز تنفس بخار (Nebulizer)'],
  [['اسطوانهاوكسجين', 'اسطوانهاكسجين', 'اسطوانه'], 'أسطوانة أكسجين 15 لتر'],
  [
    // «متنقل» و«مولد» يصفان المكثّف نفسه في كتابة الموظفين.
    ['مكثفاوكسجين', 'مكثفاكسجين', 'مولداوكسجين', 'مولداكسجين', 'جهازاوكسجينمتنقل', 'جهازاكسجينمتنقل'],
    'مكثف أكسجين',
  ],

  // كفالة مريض
  [['حفاضاتكلوت', 'حفايظكلوت', 'حفايضكلوت', 'حفاظاتكلوت', 'كلوت'], 'حفاضات كلوت'],
  [
    ['حفاضاتلاصق', 'حفايظلاصق', 'حفايضلاصق', 'حفاضات', 'حفايظ', 'حفايض', 'حفاظات', 'حفاضه'],
    'حفاضات لاصق',
  ],
  [['مفارشطبيه', 'مفارش'], 'مفارش طبية'],
  [['مناديلمبلله', 'مناديلمبله'], 'مناديل مبللة'],
  // «مناديل عادية» و«مناديل» وحدها تعني الجافة في مقابل «المبللة».
  [['مناديلجافه', 'مناديلعاديه', 'مناديا', 'مناديل'], 'مناديل جافة'],
  [['قفازاتفينيل', 'قفازاتطبيه', 'قفازات', 'جوانتي'], 'قفازات فينيل'],
  [['قطنطبي', 'قطن'], 'قطن طبي'],
  [['لاصقجروح', 'لاصقجرح'], 'لاصق جروح'],
  [['شرايحفحصالسكر', 'شرايحقياسالسكر', 'شرايحسكر', 'شرايحالسكر'], 'شرائح فحص السكر'],
  [['جهازقياسالسكر', 'جهازسكر'], 'جهاز قياس السكر'],
  [
    ['جهازقياسالضغطالالكتروني', 'جهازقياسالضغط', 'جهازالضغط', 'جهازضغط', 'جهازظغط'],
    'جهاز قياس الضغط الإلكتروني',
  ],
  [
    ['جهازقياسنسبهالاوكسجينفيالدم', 'جهازقياسالاوكسجين', 'اوكسيمتر', 'جهازقياسالاكسجين'],
    'جهاز قياس نسبة الأكسجين في الدم',
  ],
  [['ابرقلمالانسولين', 'ابرانسولين', 'ابرالانسولين', 'اقلامالانسولين'], 'إبر قلم الأنسولين'],
  [['مسحاتطبيه', 'مسحات'], 'مسحات طبية'],
];

/**
 * مرادفات تُقرأ في سياق عمودها فقط.
 *
 * الموظف يكتب «هوائية» في عمود «لارتاح» ويقصد المرتبة، ولا يكتب اسم الصنف
 * كاملًا لأن العمود يقوله عنه. المطابقة العامة لا تستطيع حسم هذه الكلمات،
 * والعمود يحسمها.
 */
const PROGRAM_SCOPED_ALIASES: Record<string, [keys: string[], item: string][]> = {
  LARTAH: [
    [['هوايي', 'هواييه'], 'مرتبة طبية هوائية'],
    [['عادي', 'عاديه'], 'مرتبة طبية عادية'],
  ],
  SANDI: [
    [['كهرباي', 'كهربايي'], 'كرسي متحرك كهربائي'],
    [['عادي', 'عاديه'], 'كرسي متحرك عادي'],
    [['حمام'], 'كرسي حمام متحرك'],
  ],
  LASMAAK: [[['سماعه', 'سماعات', 'اذن'], 'سماعة أذن طبية']],
  OXYGEN: [
    [['متنقل'], 'مكثف أكسجين'],
    [['اسطوانه'], 'أسطوانة أكسجين 15 لتر'],
  ],
};

/** كلمات لا تدلّ على صنف: تُحذف قبل المطابقة. */
const NOISE = /^(لا\s*شي.?|لاشيء|لا\s*يوجد|بدون|تم|منجز|صفر|0|-|_|—)$/i;

/** بادئات تصف إجراءً لا صنفًا، وتُحفظ في ملاحظة البند. */
const ACTION_PREFIXES: [pattern: RegExp, note: string][] = [
  [/^\s*(تبديل|استبدال)\s+/, 'استبدال'],
  [/^\s*(اضافه|إضافة)\s+/, 'إضافة'],
  [/^\s*(صيانه|صيانة)\s+/, 'صيانة'],
];

export type ParsedItem = {
  /** اسم الصنف في الكتالوج، أو null إن لم يُطابَق */
  itemName: string | null;
  size: string | null;
  quantity: number;
  note: string | null;
  /** النص الأصلي لهذا الجزء — يُحفظ دائمًا */
  legacyText: string;
};

/**
 * يفكّ خلية نصية إلى بنود مستقلة.
 *
 * هذه هي العملية التي تحوّل «حفائظ مقاس اكس لارج ، مفارش طبية» من نص في خلية
 * إلى صفّين في `request_items` قابلين للربط بالمخزون والتحليل — وهي جوهر
 * الفرق بين الملف القديم والنظام الجديد.
 */
export function parseItemsCell(raw: string | null, programCode?: string): ParsedItem[] {
  if (!raw) return [];

  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned || NOISE.test(cleaned)) return [];

  const parts = cleaned
    .split(/[،,؛;·]+|\s+\.\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !NOISE.test(p));

  return parts.map((part) => {
    let text = part;
    let note: string | null = null;

    for (const [pattern, label] of ACTION_PREFIXES) {
      if (pattern.test(text)) {
        note = label;
        text = text.replace(pattern, '').trim();
        break;
      }
    }

    // كمية صريحة مثل «حفاضات × 2» أو «عدد 3»
    let quantity = 1;
    const qtyMatch = text.match(/(?:×|x|\*|عدد)\s*(\d{1,3})/i);
    if (qtyMatch?.[1]) {
      quantity = Math.max(1, Number.parseInt(qtyMatch[1], 10));
      text = text.replace(qtyMatch[0], ' ').trim();
    }

    const { size, rest } = extractSize(text);
    const key = matchKey(rest);

    let itemName: string | null = null;
    for (const [keys, name] of ITEM_ALIASES) {
      if (keys.some((k) => key.includes(k))) {
        itemName = name;
        break;
      }
    }

    // لم تحسمه المرادفات العامة: يُسأل عمود البرنامج قبل الاستسلام.
    if (!itemName && programCode) {
      for (const [keys, name] of PROGRAM_SCOPED_ALIASES[programCode] ?? []) {
        if (keys.some((k) => key.includes(k))) {
          itemName = name;
          break;
        }
      }
    }

    return { itemName, size, quantity, note, legacyText: part };
  });
}

/** أسماء الشهور العربية → رقم الشهر، لقراءة اسم الشيت. */
export const MONTHS: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  أبريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  اغسطس: 8,
  أغسطس: 8,
  سبتمبر: 9,
  اكتوبر: 10,
  أكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

export function monthFromSheetName(name: string): number | null {
  const key = name.trim();
  return MONTHS[key] ?? null;
}
