import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * تشفير الحقول الحساسة في قاعدة البيانات.
 *
 * ما الذي يُشفَّر ولماذا هو بالضبط هذا؟
 *
 * الحقول النصية الحرة التي تحمل تفاصيل صحية (`beneficiaries.notes`
 * و`requests.notes`) تُشفَّر لأنها أخطر ما في القاعدة وأقلّها حاجة للبحث:
 * من يقرأ نسخة قرص مسروقة لا يجد فيها وصف حالة أحد.
 *
 * **رقم الهوية لا يُشفَّر عمدًا.** تشفيره يُسقط قيد التفرّد الذي يمنع ازدواج
 * المستفيد — وهو أصلًا أحد أهداف النظام — ويُسقط البحث بالهوية الذي تقوم
 * عليه شاشة الاستقبال. حمايته مبنية على أربع طبقات أخرى: إخفاء جزئي في
 * القوائم، وصلاحية `beneficiary:read_full_id`، وتسجيل كل اطّلاع في
 * `beneficiary_access_log`، وتشفير القرص على مستوى الخادم.
 *
 * الخوارزمية AES-256-GCM: تشفير **مع توثيق**، فأي عبث بالنص المشفَّر في
 * قاعدة البيانات يُكتشف عند فكّه بدل أن يمرّ كقيمة مغلوطة.
 *
 * ⚠ فقدان `ENCRYPTION_KEY` يعني فقدان هذه الحقول نهائيًا. يُخزَّن المفتاح في
 * مدير أسرار، ويُنسخ احتياطيًا منفصلًا عن نسخة قاعدة البيانات — نسخة تحوي
 * الاثنين معًا تُلغي فائدة التشفير.
 */

/** بادئة تميّز النص المشفَّر، وتحمل رقم الإصدار لتدوير المفتاح مستقبلًا. */
const PREFIX = 'enc:v1:';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // المقاس القياسي لـGCM
const KEY_BYTES = 32;

let cachedKey: Buffer | null | undefined;

/**
 * المفتاح من البيئة، أو null إن لم يُضبط.
 *
 * غيابه لا يُسقط النظام: الحقول تبقى نصًا صريحًا ويُطبع تحذير مرة واحدة.
 * هذا مقصود للتطوير المحلي، ومرفوض في الإنتاج — راجع تحذير شاشة الإعدادات.
 */
function key(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env['ENCRYPTION_KEY'];
  if (!raw) {
    cachedKey = null;
    return null;
  }

  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY يجب أن يكون 32 بايتًا بترميز base64 (الحالي ${buffer.length} بايت). ` +
        'ولّده بـ: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  cachedKey = buffer;
  return cachedKey;
}

export function encryptionEnabled(): boolean {
  return key() !== null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * يشفّر نصًا. يعيده كما هو إن كان التشفير معطّلًا أو كان مشفَّرًا أصلًا،
 * فاستدعاؤه مرتين لا يضاعف التشفير.
 */
export function encrypt(plain: string): string {
  const secret = key();
  if (!secret || plain === '' || isEncrypted(plain)) return plain;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secret, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv.tag.ciphertext — كلها لازمة للفكّ، والوسم يثبت عدم العبث.
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * يفكّ نصًا مشفَّرًا. يعيد غير المشفَّر كما هو، فالحقول القديمة قبل التفعيل
 * تُقرأ بلا كسر.
 */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value;

  const secret = key();
  if (!secret) {
    // قيمة مشفَّرة بلا مفتاح: لا تُعرض قمامة للمستخدم ولا يُسقط الطلب.
    return '••• محتوى مشفَّر — مفتاح التشفير غير مضبوط على هذا الخادم •••';
  }

  try {
    const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + 16);
    const ciphertext = payload.subarray(IV_BYTES + 16);

    const decipher = createDecipheriv(ALGORITHM, secret, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // فشل التوثيق = عبث أو مفتاح خاطئ. لا يُخفى بصمت.
    return '••• تعذّر فكّ التشفير — راجع مدير النظام •••';
  }
}

/** للاختبار فقط: يُسقط المفتاح المخزَّن مؤقتًا بعد تغيير البيئة. */
export function resetKeyCache(): void {
  cachedKey = undefined;
}
