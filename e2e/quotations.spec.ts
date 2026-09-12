import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

/**
 * عروض الأسعار ومرفقات ملف المستفيد.
 * كلاهما شاشة تُقرأ أكثر مما تُكتب، فالاختبار يركّز على أن ما يُدخَل يظهر
 * صحيحًا وأن المقارنة بين العروض تعمل.
 */
test.describe('عروض الأسعار', () => {
  test('إضافة عرضين لنفس الصنف توسم الأرخص', async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const supplierA = `مورّد أ ${stamp}`;
    const supplierB = `مورّد ب ${stamp}`;

    await login(page, ACCOUNTS.purchasing);
    await page.goto('/purchasing');

    // مورّدان جديدان للمقارنة بينهما.
    for (const name of [supplierA, supplierB]) {
      await page.getByRole('button', { name: 'مورّد جديد' }).click();
      await page.getByLabel('اسم المورّد').fill(name);
      await page.getByRole('button', { name: 'حفظ المورّد' }).click();
      await expect(page.getByText('أُضيف المورّد.')).toBeVisible();
    }

    // عرضان لنفس الصنف بسعرين مختلفين.
    for (const [supplier, price] of [
      [supplierA, '250'],
      [supplierB, '190'],
    ] as const) {
      await page.getByRole('button', { name: 'عرض سعر جديد' }).click();
      await page.getByLabel('المورّد').selectOption({ label: supplier });
      await page.getByLabel('الصنف').selectOption({ label: 'مكثف أكسجين — أوكسجين' });
      await page.getByLabel('سعر الوحدة').fill(price);
      await page.getByRole('button', { name: 'حفظ عرض السعر' }).click();
      await expect(page.getByText('أُضيف عرض السعر.')).toBeVisible();
    }

    // الأرخص (190) موسوم، والأغلى (250) ساري بلا وسم.
    const cheapRow = page.getByRole('row').filter({ hasText: supplierB });
    await expect(cheapRow.getByText('الأرخص')).toBeVisible();

    const dearRow = page.getByRole('row').filter({ hasText: supplierA });
    await expect(dearRow.getByText('ساري')).toBeVisible();
    await expect(dearRow.getByText('الأرخص')).toHaveCount(0);
  });

  test('المقاس مطلوب للأصناف ذات المقاسات', async ({ page }) => {
    await login(page, ACCOUNTS.purchasing);
    await page.goto('/purchasing');

    await page.getByRole('button', { name: 'عرض سعر جديد' }).click();
    await page.getByLabel('الصنف').selectOption({ label: 'حفاضات كلوت — كفالة مريض' });

    // حقل المقاس يظهر، وزر الحفظ يبقى معطّلًا حتى يُختار.
    await expect(page.getByLabel('المقاس')).toBeVisible();
    await page.getByLabel('سعر الوحدة').fill('45');
    await expect(page.getByRole('button', { name: 'حفظ عرض السعر' })).toBeDisabled();

    await page.getByLabel('المقاس').selectOption('XL');
    // المورّد ما زال ناقصًا.
    await expect(page.getByRole('button', { name: 'حفظ عرض السعر' })).toBeDisabled();
  });

  test('المطّلع لا يصل لشاشة المشتريات أصلًا', async ({ page }) => {
    await login(page, ACCOUNTS.viewer);
    await page.goto('/purchasing');

    // دور الاطّلاع لا يملك purchasing:read، فالشاشة كلها محجوبة عنه.
    await page.waitForURL('**/403', { timeout: 30_000 });
  });
});

test.describe('مرفقات ملف المستفيد', () => {
  test('تظهر مجمَّعة من كل الطلبات مع رقم الطلب', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    // مستفيد له مرفق مرفوع في اختبار سابق — يُبحث عن أول ملف فيه مرفقات.
    await page.goto('/beneficiaries');
    await page.getByRole('link', { name: /^بدر ماجد/ }).first().click();
    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await expect(page.getByText('من كل طلبات المستفيد')).toBeVisible();

    // كل مرفق يربط للطلب الذي جاء منه.
    const section = page.getByRole('listitem').filter({ hasText: 'من الطلب' }).first();
    await expect(section).toBeVisible();
    await expect(section.getByRole('link', { name: /AID-\d{4}-\d{5}/ })).toBeVisible();
  });
});
