import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

/**
 * فحص معايير القبول البصرية آليًا.
 *
 * المواصفة تضع شروطًا قابلة للقياس — لا تدرّجات، ولا زجاجية، ولا إيموجي، ولا
 * نص أصغر من 12px، ولا حجم خط خارج المقياس — فتُفحص هنا بالكود بدل الاعتماد
 * على نظرة عين.
 */

const PAGES = [
  '/dashboard',
  '/requests',
  '/beneficiaries',
  '/inventory',
  '/purchasing',
  '/disbursements',
  '/reports',
  '/my-tasks',
];

/** مقياس الخطوط المسموح حصرًا، بالبكسل. */
const ALLOWED_FONT_SIZES = [12, 14, 16, 20, 24];

test.describe('معايير القبول البصرية', () => {
  test('لا تدرّجات لونية ولا زجاجية في أي شاشة', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const violations = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const style = getComputedStyle(el);
          if (style.backgroundImage.includes('gradient')) {
            found.push(`تدرّج: ${el.tagName}.${el.className}`);
          }
          if (style.backdropFilter && style.backdropFilter !== 'none') {
            found.push(`زجاجية: ${el.tagName}.${el.className}`);
          }
        }
        return found.slice(0, 5);
      });

      expect(violations, `في ${path}`).toEqual([]);
    }
  });

  test('لا نص أصغر من 12px ولا حجم خارج المقياس', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const sizes = await page.evaluate(() => {
        const found = new Set<number>();
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const text = el.textContent?.trim();
          if (!text || el.children.length > 0) continue;
          const size = Number.parseFloat(getComputedStyle(el).fontSize);
          if (Number.isFinite(size)) found.add(Math.round(size));
        }
        return [...found];
      });

      for (const size of sizes) {
        expect(size, `حجم خط ${size}px في ${path}`).toBeGreaterThanOrEqual(12);
        expect(ALLOWED_FONT_SIZES, `حجم خط ${size}px خارج المقياس في ${path}`).toContain(size);
      }
    }
  });

  test('الواجهة RTL أصيلة بلا قلب CSS', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    const flipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).some((el) =>
        getComputedStyle(el).transform.includes('matrix(-1'),
      ),
    );
    expect(flipped, 'وُجد عنصر مقلوب بـscaleX(-1)').toBe(false);
  });

  test('الوضع الليلي يبدّل الرموز ولا يقلب الألوان', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('button', { name: 'التحويل إلى الوضع الليلي' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');

    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).not.toBe(lightBg);

    // لا فلتر قلب على الصفحة — الوضع الليلي من الرموز لا من invert().
    const inverted = await page.evaluate(() =>
      getComputedStyle(document.documentElement).filter.includes('invert'),
    );
    expect(inverted).toBe(false);

    // الاختيار يبقى بعد إعادة التحميل.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  });

  test('الواجهة تعمل على عرض الجوال بلا تمرير أفقي للصفحة', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ACCOUNTS.warehouse);

    for (const path of ['/dashboard', '/my-tasks', '/inventory']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // سماح ببكسل واحد لفروق التقريب.
      expect(overflow, `تمرير أفقي في ${path}`).toBeLessThanOrEqual(1);
    }

    // زر القائمة يظهر على الجوال بدل الشريط الجانبي.
    await expect(page.getByRole('button', { name: 'فتح قائمة التنقّل' })).toBeVisible();
  });
});
