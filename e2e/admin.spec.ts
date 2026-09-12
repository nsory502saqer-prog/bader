import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, uniqueNationalId } from './helpers';

/**
 * شاشات الإدارة والعروض المخصصة.
 *
 * شاشة الكتالوج هي السدّ الذي يمنع عودة الإدخال الحر، فهي مُختبَرة: إن تعطّلت،
 * اضطر الموظفون لكتابة الأصناف نصًا وعاد بالضبط ما بُني النظام ليحلّه.
 */
test.describe('الإدارة والعروض المخصصة', () => {
  test('إضافة صنف للكتالوج تجعله متاحًا في معالج الطلب', async ({ page }) => {
    const itemName = `صنف اختبار ${Date.now().toString().slice(-6)}`;

    await login(page, ACCOUNTS.admin);
    await page.goto('/admin/catalog');

    await page.getByRole('button', { name: 'صنف جديد' }).click();
    await page.getByLabel('البرنامج', { exact: true }).selectOption({ label: 'كفالة مريض' });
    await page.getByLabel('اسم الصنف').fill(itemName);
    await page.getByLabel('الوحدة').fill('علبة');
    await page.getByLabel('حد إعادة الطلب').fill('5');
    await page.getByRole('button', { name: 'إضافة الصنف' }).click();

    await expect(page.getByText('حُفظ الصنف.')).toBeVisible();
    await expect(page.getByRole('cell', { name: itemName, exact: true })).toBeVisible();

    // الصنف الجديد يظهر فورًا في كتالوج معالج الطلب.
    // المعالج يبدأ بالخطوة الأولى، فيُفتح من ملف مستفيد ليقفز إلى البنود.
    await page.goto('/beneficiaries/new');
    await page.getByLabel('رقم الهوية').fill(uniqueNationalId());
    await page.getByLabel('الاسم الرباعي').fill('نورة صالح أحمد الشمري');
    await page.getByLabel('الجنس').selectOption('female');
    await page.getByLabel('مصدر الدخل').selectOption({ label: 'راتب' });
    await page.getByLabel('المدينة').selectOption({ label: 'جدة' });
    await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.getByLabel('بحث في الأصناف').fill(itemName);
    await expect(page.getByRole('listitem').filter({ hasText: itemName }).first()).toBeVisible();
  });

  test('إضافة مدينة للقائمة المرجعية', async ({ page }) => {
    const cityName = `مدينة اختبار ${Date.now().toString().slice(-6)}`;

    await login(page, ACCOUNTS.admin);
    await page.goto('/admin/catalog');

    await page.getByLabel('النوع').selectOption('city');
    await page.getByLabel('الاسم', { exact: true }).fill(cityName);
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();

    await expect(page.getByText('حُفظت القيمة في القائمة المرجعية.')).toBeVisible();

    // تصير خيارًا في نموذج المستفيد بلا أي خطوة أخرى.
    await page.goto('/beneficiaries/new');
    await expect(page.getByLabel('المدينة').locator(`option:has-text("${cityName}")`)).toHaveCount(1);
  });

  test('تغيير مدة الإنجاز المستهدفة يُحفظ ويُقرأ', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto('/admin/settings');

    const field = page.getByLabel('قيد الفرز والدراسة');
    await field.fill('7');
    await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();

    await expect(page.getByText('حُفظت الإعدادات.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('قيد الفرز والدراسة')).toHaveValue('7');

    // إعادة القيمة الافتراضية حتى لا يؤثر الاختبار على ما بعده.
    await page.getByLabel('قيد الفرز والدراسة').fill('3');
    await page.getByRole('button', { name: 'حفظ الإعدادات' }).click();
    await expect(page.getByText('حُفظت الإعدادات.')).toBeVisible();
  });

  test('حفظ الفلاتر كعرض مخصص واستدعاؤه', async ({ page }) => {
    const viewName = `عرض اختبار ${Date.now().toString().slice(-6)}`;

    await login(page, ACCOUNTS.admin);
    await page.goto('/requests?status=delivered');

    await page.getByRole('button', { name: 'احفظ الفلاتر الحالية كعرض' }).click();
    await page.getByLabel('اسم العرض').fill(viewName);
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();

    const viewLink = page.getByRole('link', { name: viewName });
    await expect(viewLink).toBeVisible();

    // العرض يعيد تطبيق نفس الفلاتر من صفحة نظيفة.
    await page.goto('/requests');
    await page.getByRole('link', { name: viewName }).click();
    await expect(page).toHaveURL(/status=delivered/);
    await expect(page.getByRole('link', { name: viewName })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('button', { name: `حذف العرض ${viewName}` }).click();
    await expect(page.getByRole('link', { name: viewName })).toHaveCount(0);
  });

  test('سجل التدقيق يسجّل التصدير', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    await page.goto('/requests');
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'تصدير إلى Excel' }).click(),
    ]);

    await page.goto('/admin/audit');
    await expect(page.getByRole('cell', { name: 'تصدير' }).first()).toBeVisible();
  });
});
