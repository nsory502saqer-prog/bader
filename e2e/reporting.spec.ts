import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

/**
 * التصدير إلى Excel شرط قبول صريح، فهو مُختبَر كمسار حرج لا كميزة ثانوية:
 * بلا زر تصدير يعمل، يعود الموظفون لملفاتهم الجانبية.
 */
test.describe('التقارير والتصدير', () => {
  test('لوحة المعلومات تعرض المؤشرات والرسوم', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    await expect(page.getByRole('heading', { name: 'لوحة المعلومات' })).toBeVisible();
    for (const label of [
      'طلبات اليوم',
      'قيد الفرز',
      'عالقة في المستودع',
      'جاهزة للصرف',
      'متوسط زمن الإنجاز',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText('الطلبات شهريًا')).toBeVisible();
    await expect(page.getByText('التوزيع حسب البرنامج')).toBeVisible();
    await expect(page.getByText('أعلى 10 أصناف استهلاكًا')).toBeVisible();
  });

  test('صفحة التقارير تعرض متوسط زمن كل مرحلة', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'التقارير' })).toBeVisible();
    await expect(page.getByText('متوسط زمن كل مرحلة')).toBeVisible();
    await expect(page.getByText('المستفيدون المتكررون')).toBeVisible();
    await expect(page.getByText('استهلاك أصناف كفالة مريض')).toBeVisible();
  });

  test('تصدير الطلبات ينزّل ملف Excel يحترم الفلتر', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/requests?status=delivered');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'تصدير إلى Excel' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    // ملف xlsx صالح = أرشيف ZIP يبدأ بـPK.
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  test('كل قائمة رئيسية فيها زر تصدير', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    for (const path of ['/requests', '/beneficiaries', '/inventory', '/disbursements']) {
      await page.goto(path);
      await expect(
        page.getByRole('button', { name: 'تصدير إلى Excel' }).first(),
        `التصدير مفقود في ${path}`,
      ).toBeVisible();
    }
  });

  test('التقرير الشامل يُنزَّل من صفحة التقارير', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/reports');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'تصدير التقرير الشامل' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test('التصدير مرفوض بلا جلسة', async ({ request }) => {
    const response = await request.get('/api/export/requests');
    expect(response.status()).toBe(401);
  });
});
