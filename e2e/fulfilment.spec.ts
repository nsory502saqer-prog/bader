import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, logout, uniqueNationalId } from './helpers';

/**
 * المسار الحرج الثاني: من الاعتماد حتى تسليم الجهاز.
 * يغطّي أثر الحركة على المخزون: حجز، ثم خصم عند إصدار أمر الصرف.
 */
test.describe('التجهيز والصرف', () => {
  test('حجز من المخزون ثم إصدار أمر صرف وتسليمه', async ({ page }) => {
    const nationalId = uniqueNationalId();
    const fullName = 'سعاد ناصر سعد الحربي';
    const itemName = 'عكاز طبي';

    // ── تمهيد: المستودع يُدخل وارِدًا كافيًا ──
    await login(page, ACCOUNTS.warehouse);
    await page.goto('/inventory?q=' + encodeURIComponent(itemName));

    const stockRow = page.getByRole('row').filter({ hasText: itemName }).first();
    await stockRow.getByRole('button', { name: 'تحريك' }).click();
    await page.getByLabel('نوع الحركة').selectOption('in');
    await page.getByLabel('الكمية الواردة').fill('5');
    await page.getByLabel(/^ملاحظة/).fill('تبرّع عيني — اختبار');
    await page.getByRole('button', { name: 'حفظ الحركة' }).click();
    await expect(page.getByText('أُدخل الوارد.')).toBeVisible();

    await logout(page);

    // ── 1. الاستقبال يسجّل مستفيدًا وطلبًا ──
    await login(page, ACCOUNTS.reception);
    await page.goto('/beneficiaries/new');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByLabel('الاسم الرباعي').fill(fullName);
    await page.getByLabel('الجنس').selectOption('female');
    await page.getByLabel('مصدر الدخل').selectOption({ label: 'تأهيل شامل' });
    await page.getByLabel('المدينة').selectOption({ label: 'الطائف' });
    await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.getByLabel('بحث في الأصناف').fill(itemName);
    await page
      .getByRole('listitem')
      .filter({ hasText: itemName })
      .getByRole('button', { name: 'إضافة' })
      .first()
      .click();
    await page.getByRole('button', { name: 'التالي — المرفقات والمراجعة' }).click();
    await page.getByRole('button', { name: 'حفظ وتقديم الطلب' }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const requestUrl = page.url();

    await logout(page);

    // ── 2. الفرز يعتمد ──
    await login(page, ACCOUNTS.screener);
    await page.goto(requestUrl);
    await page.getByRole('button', { name: 'قيد الفرز والدراسة' }).click();
    await expect(page.getByText('من مقدَّم إلى قيد الفرز والدراسة')).toBeVisible();
    await page.getByRole('button', { name: 'معتمد', exact: true }).click();
    await expect(page.getByText('من قيد الفرز والدراسة إلى معتمد')).toBeVisible();
    await logout(page);

    // ── 3. المستودع يحجز ثم يعلن الجاهزية ──
    await login(page, ACCOUNTS.warehouse);
    await page.goto(requestUrl);

    await page.getByRole('button', { name: 'فحص التوفّر وحجز المتاح' }).click();
    await expect(page.getByText('حُجز 1 بندًا على المخزون.')).toBeVisible();

    // البند صار متوفرًا بالمستودع، فلم يعد «قيد الانتظار».
    await expect(page.getByRole('combobox', { name: `حالة ${itemName}` })).toHaveValue('in_stock');

    await page.getByRole('button', { name: 'جاهز للصرف' }).click();
    await expect(page.getByText('من معتمد إلى جاهز للصرف')).toBeVisible();
    await logout(page);

    // ── 4. المالية تصدر أمر الصرف — وهو ما يخصم من المخزون ──
    await login(page, ACCOUNTS.finance);
    await page.goto(requestUrl);
    await page.getByRole('button', { name: 'صدر أمر الصرف' }).click();
    await expect(page.getByText('من جاهز للصرف إلى صدر أمر الصرف')).toBeVisible();

    await page.goto('/disbursements');
    const orderLink = page.locator('a[href^="/disbursements/"]').first();
    await orderLink.click();
    await page.waitForURL(/\/disbursements\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // ── 5. التسليم بتوقيع المستلم يغلق الطلب ──
    await page.getByLabel('اسم المستلم').fill('سعاد ناصر سعد الحربي');

    // التوقيع يُرسم على القماش بأحداث المؤشّر، كما يفعل الإصبع على الجوال.
    const pad = page.getByLabel('مساحة التوقيع');
    const box = await pad.boundingBox();
    await page.mouse.move(box!.x + 30, box!.y + 70);
    await page.mouse.down();
    await page.mouse.move(box!.x + 90, box!.y + 40);
    await page.mouse.move(box!.x + 150, box!.y + 90);
    await page.mouse.up();
    await expect(page.getByText('التوقيع مُلتقَط.')).toBeVisible();

    await page.getByRole('button', { name: 'تأكيد التسليم وإغلاق الطلب' }).click();
    await expect(page.getByText('تم التسليم').first()).toBeVisible();

    // التوقيع محفوظ ويُعرض في تفاصيل الأمر.
    const signature = page.getByRole('img', { name: /توقيع/ });
    await expect(signature).toBeVisible();
    const src = await signature.getAttribute('src');
    const signatureResponse = await page.request.get(src!);
    expect(signatureResponse.status()).toBe(200);
    expect(signatureResponse.headers()['content-type']).toContain('image/png');

    await page.goto(requestUrl);
    await expect(page.getByText('من صدر أمر الصرف إلى تم التسليم')).toBeVisible();
  });

  test('البند غير المتوفر يتحوّل تلقائيًا لقائمة المشتريات', async ({ page }) => {
    const nationalId = uniqueNationalId();
    // صنف غالي الثمن لا يُحتفظ به في المستودع عادةً، فرصيده صفر.
    const itemName = 'كرسي متحرك كهربائي';

    await login(page, ACCOUNTS.admin);

    await page.goto('/beneficiaries/new');
    await page.getByLabel('رقم الهوية').fill(nationalId);
    await page.getByLabel('الاسم الرباعي').fill('خالد سالم عوض الغامدي');
    await page.getByLabel('الجنس').selectOption('male');
    await page.getByLabel('مصدر الدخل').selectOption({ label: 'لا يوجد دخل' });
    await page.getByLabel('المدينة').selectOption({ label: 'جدة' });
    await page.getByRole('button', { name: 'حفظ المستفيد' }).click();
    await page.waitForURL(/\/beneficiaries\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await page.getByRole('link', { name: 'طلب جديد' }).click();
    await page.getByLabel('بحث في الأصناف').fill(itemName);
    await page
      .getByRole('listitem')
      .filter({ hasText: itemName })
      .getByRole('button', { name: 'إضافة' })
      .first()
      .click();
    await page.getByRole('button', { name: 'التالي — المرفقات والمراجعة' }).click();
    await page.getByRole('button', { name: 'حفظ وتقديم الطلب' }).click();
    await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const requestUrl = page.url();

    await page.getByRole('button', { name: 'قيد الفرز والدراسة' }).click();
    await expect(page.getByText('من مقدَّم إلى قيد الفرز والدراسة')).toBeVisible();
    await page.getByRole('button', { name: 'معتمد', exact: true }).click();
    await expect(page.getByText('من قيد الفرز والدراسة إلى معتمد')).toBeVisible();

    await page.getByRole('button', { name: 'فحص التوفّر وحجز المتاح' }).click();
    await expect(page.getByText(/غير متوفر وحُوّل للشراء/)).toBeVisible();

    // يظهر الآن في لوحة المشتريات بلا أي خطوة يدوية.
    await page.goto('/purchasing');
    await expect(page.getByRole('cell', { name: itemName, exact: true }).first()).toBeVisible();

    await page.goto(requestUrl);
    await expect(page.getByRole('combobox', { name: `حالة ${itemName}` })).toHaveValue(
      'to_purchase',
    );
  });
});
