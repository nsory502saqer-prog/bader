import type { Page } from '@playwright/test';

export const PASSWORD = process.env['SEED_PASSWORD'] ?? 'Bader@2026';

export const ACCOUNTS = {
  admin: 'admin@bader.org.sa',
  reception: 'reception@bader.org.sa',
  screener: 'screener@bader.org.sa',
  warehouse: 'warehouse@bader.org.sa',
  finance: 'finance@bader.org.sa',
  viewer: 'viewer@bader.org.sa',
} as const;

export async function login(page: Page, email: string, password: string = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'خروج' }).click();
  await page.waitForURL('**/login', { timeout: 30_000 });
}

/**
 * هوية صالحة فريدة لكل تشغيل: 10 أرقام تبدأ بـ1.
 * الاختبارات تكتب في نفس قاعدة بيانات التطوير، فلا بد أن تكون الهوية جديدة
 * في كل مرة وإلّا اصطدمت بقيد التفرّد.
 */
export function uniqueNationalId(): string {
  const tail = String(Date.now()).slice(-9);
  return `1${tail}`;
}
