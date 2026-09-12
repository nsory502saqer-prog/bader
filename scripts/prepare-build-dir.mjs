import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * تهيئة مجلدات البناء قبل تشغيل Next.
 *
 * المشروع يعيش داخل مجلد Dropbox، ومزامنة Dropbox تفتح ملفات `.next` أثناء
 * الكتابة فيفشل البناء بـ`EBUSY` و`EPERM` عند حذف مجلد مؤقت أو إعادة تسميته.
 *
 * العلاج استثناء المجلد من المزامنة بسمة `com.dropbox.ignored`، لكن السمة
 * تضيع كلما حُذف المجلد وأُعيد إنشاؤه — وهذا ما يفعله كل بناء نظيف. لذلك
 * يُنشأ المجلد هنا ويُوسَم **قبل** أن يلمسه Next، فيجده Dropbox متجاهَلًا منذ
 * اللحظة الأولى.
 *
 * السمة خاصة بويندوز (Alternate Data Stream)، ويتخطّى السكربت بصمت على غيره.
 */

const TARGETS = ['.next', 'node_modules', 'test-results', 'playwright-report', 'storage'];

function ignoreInDropbox(path) {
  if (process.platform !== 'win32') return 'skipped';
  try {
    // مجرى بيانات بديل على المجلد نفسه — الطريقة التي تقرأها Dropbox.
    writeFileSync(`${path}:com.dropbox.ignored`, '1');
    return 'ignored';
  } catch (error) {
    return `failed (${error.code ?? 'unknown'})`;
  }
}

for (const name of TARGETS) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  const result = ignoreInDropbox(path);
  if (result.startsWith('failed')) {
    console.warn(`تحذير: تعذّر استثناء ${name} من مزامنة Dropbox — ${result}`);
  }
}
