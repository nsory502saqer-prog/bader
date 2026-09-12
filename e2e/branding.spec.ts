import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ACCOUNTS, login, logout } from './helpers';

/**
 * شعار الجمعية.
 *
 * يظهر في وثيقة تخرج للناس (أمر الصرف المطبوع)، فهو مُختبَر كجزء من الواجهة
 * لا كزينة: رفعه يجب أن يعمل، ونوعه يجب أن يُفحص، وغيابه يجب ألّا يكسر شيئًا.
 *
 * كل اختبار يهيّئ حالته بنفسه ولا يعتمد على ترتيب التشغيل.
 */

/** شعار PNG صالح 64×64. */
async function smallLogo(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 105, b: 218 } },
  })
    .png()
    .toBuffer();
}

async function setLogo(page: Page): Promise<void> {
  await page.goto('/admin/settings');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: await smallLogo(),
  });
  await expect(page.getByRole('img', { name: 'شعار الجمعية الحالي' })).toBeVisible();
}

test.describe('شعار الجمعية', () => {
  test('رفعه يُظهره في شاشة الدخول وأمر الصرف المطبوع', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await setLogo(page);

    // المسار العام يخدمه بلا جلسة — الشعار علامة معلنة لا بيانات.
    const response = await page.request.get('/api/logo');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/image\/(png|webp)/);

    // ترويسة أمر الصرف المطبوع تعرضه.
    await page.goto('/disbursements');
    const orderLink = page.locator('a[href^="/disbursements/"]').first();
    const href = await orderLink.getAttribute('href');
    expect(href, 'لا يوجد أمر صرف لاختبار الترويسة').not.toBeNull();

    await page.goto(`${href}/print`);
    await expect(page.getByRole('img', { name: 'شعار الجمعية' })).toBeVisible();

    // وشاشة الدخول بعد الخروج.
    await page.goto('/dashboard');
    await logout(page);
    await expect(page.getByRole('img', { name: 'شعار الجمعية' })).toBeVisible();
  });

  test('يرفض صيغة SVG لأنها تحتمل سكربتات', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/admin/settings');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });

    await expect(page.getByText('نوع الملف غير مسموح')).toBeVisible();
  });

  test('إزالته تعيد الترويسة النصية بلا كسر', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    // يُرفع أولًا ليكون هناك ما يُزال — الاختبار لا يعتمد على سابقه.
    await setLogo(page);

    await page.getByRole('button', { name: 'إزالة الشعار' }).click();
    await expect(page.getByText('بلا شعار')).toBeVisible();

    expect((await page.request.get('/api/logo')).status()).toBe(404);

    // شاشة الدخول تعمل بلا شعار ولا تعرض صورة مكسورة.
    await logout(page);
    await expect(page.getByRole('heading', { name: 'نظام إدارة طلبات الإعانات' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'شعار الجمعية' })).toHaveCount(0);
  });
});
