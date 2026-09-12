import { defineConfig, devices } from '@playwright/test';

/**
 * اختبارات المسارات الحرجة.
 *
 * تعمل على بناء الإنتاج لا على خادم التطوير، فما يُختبر هو ما سيُسلَّم فعلًا.
 * الواجهة عربية RTL، لذا اللغة والمنطقة مضبوطتان هنا.
 */
/**
 * مخرجات الاختبار خارج مجلد المشروع على ويندوز.
 *
 * Playwright يحذف مجلد المخرجات ويعيد إنشاءه في بداية كل تشغيل، فيضيع معه
 * استثناء Dropbox الذي يضعه `scripts/prepare-build-dir.mjs`. النتيجة أخطاء
 * `EBUSY` عشوائية حين يقفل Dropbox ملف أثر أو لقطة أثناء المزامنة.
 */
function outputDir(): string {
  if (process.env['PLAYWRIGHT_OUTPUT_DIR']) return process.env['PLAYWRIGHT_OUTPUT_DIR'];
  return process.platform === 'win32' ? 'C:\\bader-test-results' : './test-results';
}

export default defineConfig({
  testDir: './e2e',
  outputDir: outputDir(),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3100',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build && npm run start -- --port 3100 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3100/login',
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    env: {
      AUTH_URL: 'http://127.0.0.1:3100',
      AUTH_TRUST_HOST: 'true',
    },
  },
});
