import { defineConfig, devices } from '@playwright/test';

/**
 * اختبارات المسارات الحرجة.
 *
 * تعمل على بناء الإنتاج لا على خادم التطوير، فما يُختبر هو ما سيُسلَّم فعلًا.
 * الواجهة عربية RTL، لذا اللغة والمنطقة مضبوطتان هنا.
 */
export default defineConfig({
  testDir: './e2e',
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
