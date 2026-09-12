import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, logout, uniqueNationalId } from './helpers';

/**
 * المسار الحرج: تسجيل مستفيد، ثم إنشاء طلب له، ثم فرزه واعتماده.
 * هذا هو ما يجب ألّا ينكسر أبدًا — كل شيء آخر يبني عليه.
 */
test.describe('دورة حياة الطلب', () => {
  test('من تسجيل المستفيد حتى اعتماد الطلب', async ({ page }) => {
    const nationalId = uniqueNationalId();
    const fullName = 'عائشة عبدالله محمد الزهراني';

    // ── 1. الاستقبال يسجّل المستفيد ──
    await login(page, ACCOUNTS.reception);

    await page.goto('/beneficiaries/new');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByLabel('الاسم الرباعي').fill(fullName);
    await page.getByLabel('الجنس').selectOption('female');
    await page.getByLabel('رقم الجوال').fill('0501234567');
    await page.getByLabel('مصدر الدخل').selectOption({ label: 'الضمان الاجتماعي' });
    await page.getByLabel('المدينة').selectOption({ label: 'جدة' });
    await page.getByRole('button', { name: 'حفظ المستفيد' }).click();

    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: fullName })).toBeVisible();

    // ── 2. إنشاء طلب من ملف المستفيد ──
    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.waitForURL(/\/requests\/new/);

    // المعالج يتخطّى الخطوة الأولى لأن المستفيد محدَّد مسبقًا.
    await expect(page.getByText('الخطوة 2 — إضافة البنود من الكتالوج')).toBeVisible();

    await page.getByLabel('بحث في الأصناف').fill('كرسي متحرك عادي');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'كرسي متحرك عادي' })
      .getByRole('button', { name: 'إضافة' })
      .first()
      .click();

    await expect(page.getByRole('cell', { name: 'كرسي متحرك عادي', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'التالي — المرفقات والمراجعة' }).click();
    await expect(page.getByText('المراجعة النهائية')).toBeVisible();

    await page.getByRole('button', { name: 'حفظ وتقديم الطلب' }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    const requestUrl = page.url();

    // الطلب يبدأ بحالة «مقدَّم»، وأول قيد في الخط الزمني مكتوب.
    await expect(page.getByText('مقدَّم').first()).toBeVisible();
    await expect(page.getByText('إنشاء الطلب وتقديمه')).toBeVisible();

    await logout(page);

    // ── 3. الفرز يستلم الطلب من صندوق مهامه ──
    await login(page, ACCOUNTS.screener);

    await page.goto('/my-tasks');
    await expect(page.getByRole('link', { name: fullName }).first()).toBeVisible();

    await page.goto(requestUrl);
    await page.getByRole('button', { name: 'قيد الفرز والدراسة' }).click();
    await expect(page.getByText('من مقدَّم إلى قيد الفرز والدراسة')).toBeVisible();

    // ── 4. الاعتماد ──
    await page.getByRole('button', { name: 'معتمد', exact: true }).click();
    await expect(page.getByText('من قيد الفرز والدراسة إلى معتمد')).toBeVisible();

    // الخط الزمني سجّل الانتقالات الثلاثة بمن نفّذها.
    await expect(page.getByText('الباحث الاجتماعي').first()).toBeVisible();
  });

  test('الرفض يتطلب سببًا مكتوبًا', async ({ page }) => {
    const nationalId = uniqueNationalId();

    await login(page, ACCOUNTS.admin);

    await page.goto('/beneficiaries/new');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByLabel('الاسم الرباعي').fill('محمد أحمد علي القرشي');
    await page.getByLabel('الجنس').selectOption('male');
    await page.getByLabel('مصدر الدخل').selectOption({ label: 'راتب' });
    await page.getByLabel('المدينة').selectOption({ label: 'مكة المكرمة' });
    await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.getByLabel('بحث في الأصناف').fill('عكاز طبي');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'عكاز طبي' })
      .getByRole('button', { name: 'إضافة' })
      .first()
      .click();
    await page.getByRole('button', { name: 'التالي — المرفقات والمراجعة' }).click();
    await page.getByRole('button', { name: 'حفظ وتقديم الطلب' }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'قيد الفرز والدراسة' }).click();
    await expect(page.getByText('من مقدَّم إلى قيد الفرز والدراسة')).toBeVisible();

    // زر الرفض يفتح حقل السبب، ولا يُقبل التأكيد قبل كتابته.
    await page.getByRole('button', { name: 'مرفوض' }).click();
    const confirm = page.getByRole('button', { name: 'تأكيد' });
    await expect(confirm).toBeDisabled();

    await page.getByLabel(/سبب الانتقال إلى/).fill('لا ينطبق عليه شرط الاستحقاق.');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText('لا ينطبق عليه شرط الاستحقاق.')).toBeVisible();
    // الحالة نهائية، فلا يبقى أي إجراء متاح.
    await expect(
      page.getByText('لا يوجد إجراء متاح لك على هذا الطلب في حالته الحالية.'),
    ).toBeVisible();
  });

  test('الطلب لا يُحفظ بلا بند واحد على الأقل', async ({ page }) => {
    await login(page, ACCOUNTS.reception);
    await page.goto('/requests/new');

    await page.getByLabel('رقم الهوية').fill('1000000000');
    await page.getByRole('button', { name: 'بحث' }).click();

    // زر الانتقال للخطوة التالية يبقى معطّلًا بلا مستفيد.
    await expect(page.getByRole('button', { name: 'التالي — بنود الطلب' })).toBeDisabled();
  });
});
