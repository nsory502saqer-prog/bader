import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, uniqueNationalId } from './helpers';

/**
 * رفع المرفقات.
 *
 * المرفقات هنا تقارير طبية وصور هوية، فلها ضابطان يُختبران:
 *   - محتوى الملف يجب أن يطابق نوعه المعلن (ملف تنفيذي باسم `.pdf` يُرفض).
 *   - التنزيل يمرّ بمسار محمي يتحقق من الجلسة، لا من مجلد عام.
 */

/**
 * صورة PNG تشبه ما يصوّره الموظف بجواله: كبيرة، وذات بنية فوتوغرافية.
 *
 * ضجيج مموَّه لا نمط هندسي. النمط الهندسي يضغطه PNG ضغطًا مثاليًا بينما
 * يضخّمه WebP الفاقد — فيتركه النظام كما هو (سلوك صحيح لكنه لا يثبت أن
 * الضغط يعمل). الضجيج المموَّه ينتج ~4.8MB بـPNG و~58KB بـWebP، وهو ما
 * يقيسه هذا الاختبار.
 */
async function photoLikePng(): Promise<Buffer> {
  const { randomBytes } = await import('node:crypto');
  const sharp = (await import('sharp')).default;
  const side = 2400;

  return sharp(randomBytes(side * side * 3), {
    raw: { width: side, height: side, channels: 3 },
  })
    // التمويه 8 يُبقي الملف عند ~4.8MB: أكبر بكثير من الناتج المضغوط
    // وأصغر بأمان من حد الرفع 10MB.
    .blur(8)
    .png()
    .toBuffer();
}

/** ملف تنفيذي على ويندوز (يبدأ بـMZ) متنكّر باسم وامتداد PDF. */
const DISGUISED_EXE = Buffer.from('4d5a90000300000004000000ffff0000', 'hex');

async function createRequest(page: import('@playwright/test').Page): Promise<string> {
  await login(page, ACCOUNTS.reception);

  await page.goto('/beneficiaries/new');
  await page.getByLabel('رقم الهوية').fill(uniqueNationalId());
  await page.getByLabel('الاسم الرباعي').fill('بدر ماجد سالم الحارثي');
  await page.getByLabel('الجنس').selectOption('male');
  await page.getByLabel('مصدر الدخل').selectOption({ label: 'راتب' });
  await page.getByLabel('المدينة').selectOption({ label: 'جدة' });
  await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
  await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  await page.getByRole('link', { name: 'طلب جديد' }).click();
  await page.getByLabel('بحث في الأصناف').fill('قطن طبي');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'قطن طبي' })
    .getByRole('button', { name: 'إضافة' })
    .first()
    .click();
  await page.getByRole('button', { name: 'التالي — المرفقات والمراجعة' }).click();
  await page.getByRole('button', { name: 'حفظ وتقديم الطلب' }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  return page.url();
}

test.describe('المرفقات', () => {
  test('رفع صورة صالحة: تُضغط وتُولَّد لها مصغّرة وتُفتح بالحجم الكامل', async ({ page }) => {
    await createRequest(page);

    const original = await photoLikePng();

    await page.getByLabel('نوع المستند').selectOption('medical_report');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'تقرير-طبي.png',
      mimeType: 'image/png',
      buffer: original,
    });

    const link = page.getByRole('link', { name: /تقرير-طبي\.png/ });
    await expect(link).toBeVisible();

    // نوع المستند يُعرض في صف المرفق — يُبحث داخل الصف لا في الصفحة كلها،
    // وإلا التقط المحدِّد الخيار المخفي داخل القائمة المنسدلة.
    const row = page.getByRole('listitem').filter({ hasText: 'تقرير-طبي.png' });
    await expect(row.getByText('تقرير طبي')).toBeVisible();

    // المصغّرة مربّعة 64×64 كما تحدّده المواصفة.
    const thumb = row.locator('img').first();
    await expect(thumb).toBeVisible();
    const box = await thumb.boundingBox();
    expect(Math.round(box!.width)).toBe(64);
    expect(Math.round(box!.height)).toBe(64);

    // الصورة ضُغطت إلى WebP وصغُر حجمها كثيرًا عن الأصل.
    const href = await link.getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');

    const storedSize = (await response.body()).length;
    expect(storedSize).toBeLessThan(original.length);

    // المصغّرة تُخدَم من نفس المسار المحمي بمعامل thumb، وهي أصغر بكثير.
    const thumbResponse = await page.request.get(`${href}?thumb=1`);
    expect(thumbResponse.status()).toBe(200);
    expect((await thumbResponse.body()).length).toBeLessThan(storedSize);

    // النقر على المصغّرة يفتح العارض، وEscape يغلقه.
    await row.getByRole('button', { name: /عرض .* بالحجم الكامل/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('يرفض ملفًا تنفيذيًا متنكّرًا في هيئة PDF', async ({ page }) => {
    await createRequest(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'تقرير.pdf',
      // النوع المعلن سليم، والمحتوى ليس كذلك — وهذا بالضبط ما يُختبر.
      mimeType: 'application/pdf',
      buffer: DISGUISED_EXE,
    });

    await expect(page.getByText(/لا يطابق نوعه المعلن/)).toBeVisible();
    await expect(page.getByRole('link', { name: /تقرير\.pdf/ })).toHaveCount(0);
  });

  test('تنزيل المرفق مرفوض بلا جلسة', async ({ page, request }) => {
    await createRequest(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'صورة.png',
      mimeType: 'image/png',
      buffer: await photoLikePng(),
    });

    const href = await page.getByRole('link', { name: /صورة\.png/ }).getAttribute('href');

    // سياق طلب نظيف بلا كوكيز الجلسة.
    const anonymous = await request.get(href!);
    expect(anonymous.status()).toBe(401);
  });
});
