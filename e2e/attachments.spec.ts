import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, uniqueNationalId } from './helpers';

/**
 * رفع المرفقات.
 *
 * المرفقات هنا تقارير طبية وصور هوية، فلها ضابطان يُختبران:
 *   - محتوى الملف يجب أن يطابق نوعه المعلن (ملف تنفيذي باسم `.pdf` يُرفض).
 *   - التنزيل يمرّ بمسار محمي يتحقق من الجلسة، لا من مجلد عام.
 */

/** أصغر PNG صالح: توقيع سليم ورأس IHDR. */
const REAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

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
  test('رفع صورة صالحة ثم تنزيلها من المسار المحمي', async ({ page }) => {
    await createRequest(page);

    await page.getByLabel('نوع المستند').selectOption('medical_report');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'تقرير-طبي.png',
      mimeType: 'image/png',
      buffer: REAL_PNG,
    });

    const link = page.getByRole('link', { name: /تقرير-طبي\.png/ });
    await expect(link).toBeVisible();

    // نوع المستند يُعرض في صف المرفق — يُبحث داخل الصف لا في الصفحة كلها،
    // وإلا التقط المحدِّد الخيار المخفي داخل القائمة المنسدلة.
    const row = page.getByRole('listitem').filter({ hasText: 'تقرير-طبي.png' });
    await expect(row.getByText('تقرير طبي')).toBeVisible();

    // التنزيل يعمل لصاحب الصلاحية.
    const href = await link.getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
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
      buffer: REAL_PNG,
    });

    const href = await page.getByRole('link', { name: /صورة\.png/ }).getAttribute('href');

    // سياق طلب نظيف بلا كوكيز الجلسة.
    const anonymous = await request.get(href!);
    expect(anonymous.status()).toBe(401);
  });
});
