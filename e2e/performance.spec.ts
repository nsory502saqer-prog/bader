import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { ACCOUNTS, login } from './helpers';

/**
 * متطلب الأداء: أي قائمة تُحمَّل في أقل من ثانيتين.
 *
 * يُقاس على البيانات المرحَّلة الفعلية (آلاف الطلبات وبنودها)، لا على قاعدة
 * فارغة — القياس على الفراغ لا يقول شيئًا.
 *
 * العتبة هنا 2000ms على خادم إنتاج محلي. إن سقط هذا الاختبار فالأرجح أن
 * استعلامًا فقد فهرسه، لا أن الجهاز بطيء: الصفحات كلها بترقيم وحدود صريحة.
 */

const BUDGET_MS = 2000;
const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

const PAGES: { path: string; label: string }[] = [
  { path: '/requests', label: 'قائمة الطلبات' },
  { path: '/requests?status=delivered', label: 'الطلبات مفلترة بالحالة' },
  { path: '/beneficiaries', label: 'قائمة المستفيدين' },
  { path: '/beneficiaries?q=محمد', label: 'بحث المستفيدين بالاسم' },
  { path: '/inventory', label: 'أرصدة المستودع' },
  { path: '/inventory/movements', label: 'سجل حركة المخزون' },
  { path: '/disbursements', label: 'أوامر الصرف' },
  { path: '/my-tasks', label: 'صندوق مهامي' },
  { path: '/dashboard', label: 'لوحة المعلومات' },
  { path: '/reports', label: 'التقارير' },
];

test.describe('الأداء', () => {
  test('حجم البيانات كافٍ ليكون القياس ذا معنى', async () => {
    const requests = await db.request.count();
    const items = await db.requestItem.count();

    expect(requests, 'القياس على قاعدة شبه فارغة لا يقول شيئًا').toBeGreaterThan(1000);
    expect(items).toBeGreaterThan(3000);
  });

  test('كل قائمة تُحمَّل في أقل من ثانيتين', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    /**
     * يُقاس الوسيط لا عيّنة واحدة.
     *
     * أول إصابة لمسار في خادم الإنتاج تدفع ثمن تهيئته، وجهاز التطوير عليه
     * Dropbox ومضاد فيروسات يقتنصان القرص في لحظات غير متوقعة. العيّنة
     * الواحدة تقيس هذه الضوضاء، والوسيط يقيس ما يعيشه الموظف فعلًا.
     */
    const SAMPLES = 3;
    const timings: { label: string; median: number; samples: number[] }[] = [];

    for (const entry of PAGES) {
      // إحماء يُستبعد من القياس.
      await page.goto(entry.path);
      await page.waitForLoadState('networkidle');

      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i += 1) {
        const started = Date.now();
        await page.goto(entry.path);
        await page.waitForLoadState('domcontentloaded');
        samples.push(Date.now() - started);
      }

      const sorted = [...samples].sort((a, b) => a - b);
      timings.push({ label: entry.label, median: sorted[1] ?? sorted[0] ?? 0, samples });
    }

    // تقرير كامل قبل أي فشل، فيُعرف أين المشكلة لا أنها موجودة فقط.
    console.info(
      '\nأزمنة التحميل (الوسيط · العيّنات):\n' +
        timings
          .map((t) => `  ${t.label.padEnd(28)} ${String(t.median).padStart(5)}ms   [${t.samples.join(', ')}]`)
          .join('\n'),
    );

    const slow = timings.filter((t) => t.median > BUDGET_MS);
    expect(
      slow.map((t) => `${t.label}: ${t.median}ms`),
      `تجاوزت ميزانية ${BUDGET_MS}ms`,
    ).toEqual([]);
  });

  test('البحث التقريبي بالاسم يبقى سريعًا رغم حجم الجدول', async ({ page }) => {
    await login(page, ACCOUNTS.admin);

    // «عائشة» تُطابق «عايشه» عبر فهرس gin_trgm — أثقل بحث في النظام.
    const started = Date.now();
    await page.goto('/beneficiaries?q=' + encodeURIComponent('عائشة'));
    await page.waitForLoadState('domcontentloaded');
    const ms = Date.now() - started;

    console.info(`\nالبحث التقريبي: ${ms}ms`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test('الفهارس الحرجة موجودة فعلًا في قاعدة البيانات', async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const names = rows.map((r) => r.indexname);

    // الفهارس التي تحمل عبء القوائم الأكثر استعمالًا.
    const required = [
      'beneficiaries_national_id_key',
      'beneficiaries_name_trgm_idx',
      'requests_request_no_key',
      'requests_status_idx',
      'requests_submitted_at_idx',
    ];

    for (const index of required) {
      expect(names, `الفهرس ${index} مفقود`).toContain(index);
    }
  });
});
