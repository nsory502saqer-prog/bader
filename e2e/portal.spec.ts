import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { ACCOUNTS, login, logout, uniqueNationalId } from './helpers';

/**
 * بوابة المستفيد والإشعارات.
 *
 * الرمز يُقرأ من صندوق الإشعارات مباشرة، لأن مزوّد التطوير يسجّل ولا يرسل —
 * وهذا مقصود: لا رسالة حقيقية تذهب لرقم حقيقي أثناء الاختبار.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

/** يستخرج الرمز من نص آخر رسالة OTP في الصندوق. */
async function readOtp(phone: string): Promise<string> {
  const message = await db.notification.findFirst({
    where: { toPhone: phone, template: 'otp' },
    orderBy: { createdAt: 'desc' },
    select: { body: true },
  });

  const match = message?.body.match(/\b(\d{6})\b/);
  if (!match?.[1]) throw new Error('لم يُعثر على رمز في صندوق الإشعارات.');
  return match[1];
}

/** يسجّل مستفيدًا بجوال فريد ويعيد بياناته. */
async function seedBeneficiary(page: import('@playwright/test').Page) {
  const nationalId = uniqueNationalId();
  const phone = `05${String(Date.now()).slice(-8)}`;

  await login(page, ACCOUNTS.reception);
  await page.goto('/beneficiaries/new');
  await page.getByLabel('رقم الهوية').fill(nationalId);
  await page.getByLabel('الاسم الرباعي').fill('مريم عبدالرحمن سعيد الغامدي');
  await page.getByLabel('الجنس').selectOption('female');
  await page.getByLabel('رقم الجوال').fill(phone);
  await page.getByLabel('مصدر الدخل').selectOption({ label: 'الضمان الاجتماعي' });
  await page.getByLabel('المدينة').selectOption({ label: 'جدة' });
  await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
  await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await logout(page);

  return { nationalId, phone };
}

test.describe('بوابة المستفيد', () => {
  test('دخول برمز تحقق ثم تقديم طلب ذاتيًا وتتبّعه', async ({ page }) => {
    const { nationalId, phone } = await seedBeneficiary(page);

    // ── الدخول ──
    await page.goto('/portal');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
    await expect(page.getByLabel('رمز الدخول')).toBeVisible();

    const code = await readOtp(phone);
    await page.getByLabel('رمز الدخول').fill(code);
    await page.getByRole('button', { name: 'دخول', exact: true }).click();

    await page.waitForURL('**/portal/requests', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'طلباتي' })).toBeVisible();

    // ── التقديم الذاتي ──
    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.waitForURL('**/portal/new');

    await page.getByLabel('بحث').fill('ووكر');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'ووكر' })
      .getByRole('button', { name: 'إضافة' })
      .first()
      .click();

    await page.getByLabel('ملاحظة للجمعية').fill('المريضة كبيرة في السن وتحتاج مساندة للمشي.');
    await page.getByRole('button', { name: 'تقديم الطلب' }).click();

    await page.waitForURL('**/portal/requests', { timeout: 30_000 });
    await expect(page.getByText('مقدَّم').first()).toBeVisible();

    // ── التتبع ──
    await page.locator('a[href^="/portal/requests/"]').first().click();
    await page.waitForURL(/\/portal\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByText('مراحل الطلب')).toBeVisible();
    await expect(page.getByText('ووكر (مشاية طبية)')).toBeVisible();

    // ── الإشعار كُتب في الصندوق ──
    const notified = await db.notification.findFirst({
      where: { toPhone: phone, template: 'request_submitted' },
      select: { body: true, status: true },
    });
    expect(notified, 'لم يُنشأ إشعار استلام الطلب').not.toBeNull();
    expect(notified?.body).toContain('استلمنا طلبك');
  });

  test('البوابة لا تكشف ما إذا كان رقم الهوية مسجّلًا', async ({ page }) => {
    await page.goto('/portal');

    // رقم صالح الشكل لكنه غير مسجّل قطعًا.
    await page.getByLabel('رقم الهوية').fill('2999999999');
    await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();

    // نفس رد المسجّل: ينتقل لخطوة الرمز ويعرض العبارة المحايدة.
    await expect(
      page.getByText('إن كان رقم الهوية مسجّلًا لدينا، فقد أُرسل رمز الدخول'),
    ).toBeVisible();
    await expect(page.getByLabel('رمز الدخول')).toBeVisible();
  });

  test('رمز خاطئ يُرفض برسالة لا تميّز بين سبب وآخر', async ({ page }) => {
    const { nationalId } = await seedBeneficiary(page);

    await page.goto('/portal');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
    await page.getByLabel('رمز الدخول').fill('000000');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();

    await expect(page.getByText('رمز غير صحيح أو منتهي.')).toBeVisible();
    await expect(page).toHaveURL(/\/portal$/);
  });

  test('صفحات البوابة محمية بلا جلسة', async ({ page }) => {
    for (const path of ['/portal/requests', '/portal/new']) {
      await page.goto(path);
      await page.waitForURL('**/portal', { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'بوابة المستفيدين' })).toBeVisible();
    }
  });

  test('المستفيد لا يفتح طلب غيره حتى بمعرفة رقمه', async ({ page }) => {
    const { nationalId, phone } = await seedBeneficiary(page);

    // طلب يخصّ مستفيدًا آخر.
    const other = await db.request.findFirst({
      where: { beneficiary: { nationalId: { not: nationalId } } },
      select: { id: true },
    });
    expect(other, 'لا يوجد طلب آخر للمقارنة').not.toBeNull();

    await page.goto('/portal');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();

    // ظهور حقل الرمز دليل أن الحركة اكتملت وكُتبت الرسالة في الصندوق.
    await expect(page.getByLabel('رمز الدخول')).toBeVisible();
    await page.getByLabel('رمز الدخول').fill(await readOtp(phone));
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await page.waitForURL('**/portal/requests', { timeout: 30_000 });

    const response = await page.goto(`/portal/requests/${other?.id}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe('سجل الإشعارات', () => {
  test('المدير يرى الرسائل الصادرة وحالتها', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/admin/notifications');

    await expect(page.getByRole('heading', { name: 'سجل الإشعارات' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'استلام الطلب' }).first()).toBeVisible();
  });

  test('المطّلع لا يصل لسجل الإشعارات', async ({ page }) => {
    await login(page, ACCOUNTS.viewer);
    await page.goto('/admin/notifications');
    await page.waitForURL('**/403', { timeout: 30_000 });
  });
});
