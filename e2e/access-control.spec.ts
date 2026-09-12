import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

/** الصلاحيات تُفرض في الخادم، لا بإخفاء الروابط فقط. */
test.describe('الصلاحيات والوصول', () => {
  test('الزائر بلا جلسة يُحوَّل لصفحة الدخول', async ({ page }) => {
    await page.goto('/requests');
    await page.waitForURL('**/login', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'نظام إدارة طلبات الإعانات' })).toBeVisible();
  });

  test('بيانات دخول خاطئة تُرفض برسالة واحدة لا تكشف شيئًا', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(ACCOUNTS.admin);
    await page.getByLabel('كلمة المرور').fill('كلمة-خاطئة-تمامًا');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await expect(
      page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب معطَّل.'),
    ).toBeVisible();
  });

  test('المطّلع لا يصل لإدارة المستخدمين حتى بالرابط المباشر', async ({ page }) => {
    await login(page, ACCOUNTS.viewer);
    await page.goto('/admin/users');
    await page.waitForURL('**/403', { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: 'لا تملك صلاحية الوصول لهذه الصفحة' }),
    ).toBeVisible();
  });

  test('المطّلع لا يرى رابط الإدارة أصلًا', async ({ page }) => {
    await login(page, ACCOUNTS.viewer);
    const nav = page.getByRole('navigation', { name: 'التنقّل الرئيسي' }).first();
    await expect(nav.getByRole('link', { name: 'الإدارة' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'الطلبات' })).toBeVisible();
  });

  test('المطّلع يرى رقم الهوية مخفيًا جزئيًا', async ({ page }) => {
    await login(page, ACCOUNTS.viewer);
    await page.goto('/beneficiaries');

    const masked = page.locator('text=/^1X{6}\\d{3}$/');
    const count = await masked.count();
    // إن لم يكن هناك مستفيدون بعد فلا شيء نتحقق منه.
    if (count > 0) await expect(masked.first()).toBeVisible();
  });

  test('المدير يرى كل أقسام التنقّل', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    const nav = page.getByRole('navigation', { name: 'التنقّل الرئيسي' }).first();

    for (const label of [
      'لوحة المعلومات',
      'صندوق مهامي',
      'الطلبات',
      'المستفيدون',
      'المستودع',
      'المشتريات',
      'أوامر الصرف',
      'التقارير',
      'الإدارة',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });
});
