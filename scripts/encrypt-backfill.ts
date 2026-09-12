import { PrismaClient } from '@prisma/client';
import { encrypt, encryptionEnabled, isEncrypted } from '../src/lib/encryption.js';

/**
 * تشفير الحقول الحساسة في السجلات القائمة.
 *
 * تفعيل التشفير يسري على ما يُكتب بعده فقط؛ آلاف السجلات المرحَّلة من Excel
 * تبقى نصًا صريحًا حتى تمرّ من هنا.
 *
 * يُستعمل عميل Prisma **خام** بلا امتداد التشفير عمدًا: الامتداد يفكّ عند
 * القراءة ويشفّر عند الكتابة، فالقراءة من خلاله تُظهر النص مفكوكًا فلا يُعرف
 * ما المشفَّر أصلًا وما ليس كذلك.
 *
 * قابل لإعادة التشغيل: المشفَّر مسبقًا يُتخطّى بالبادئة.
 *
 *   npm run encrypt:backfill -- --dry-run
 *   npm run encrypt:backfill
 */

const db = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const BATCH = 200;

async function backfillBeneficiaries(): Promise<{ scanned: number; encrypted: number }> {
  let scanned = 0;
  let encrypted = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await db.beneficiary.findMany({
      where: { notes: { not: null } },
      select: { id: true, notes: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      if (!row.notes || isEncrypted(row.notes)) continue;

      if (!dryRun) {
        await db.beneficiary.update({
          where: { id: row.id },
          data: { notes: encrypt(row.notes) },
        });
      }
      encrypted += 1;
    }

    cursor = rows[rows.length - 1]?.id;
  }

  return { scanned, encrypted };
}

async function backfillRequests(): Promise<{ scanned: number; encrypted: number }> {
  let scanned = 0;
  let encrypted = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await db.request.findMany({
      where: { notes: { not: null } },
      select: { id: true, notes: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      if (!row.notes || isEncrypted(row.notes)) continue;

      if (!dryRun) {
        await db.request.update({
          where: { id: row.id },
          data: { notes: encrypt(row.notes) },
        });
      }
      encrypted += 1;
    }

    cursor = rows[rows.length - 1]?.id;
  }

  return { scanned, encrypted };
}

async function main() {
  if (!encryptionEnabled()) {
    console.error(
      'ENCRYPTION_KEY غير مضبوط — لا شيء ليُشفَّر.\n' +
        'ولّد مفتاحًا بـ: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
    process.exit(1);
  }

  if (dryRun) console.info('▸ وضع التجربة: لن تُكتب أي بيانات.\n');

  const beneficiaries = await backfillBeneficiaries();
  console.info(
    `المستفيدون:  فُحص ${beneficiaries.scanned} · شُفِّر ${beneficiaries.encrypted}`,
  );

  const requests = await backfillRequests();
  console.info(`الطلبات:     فُحص ${requests.scanned} · شُفِّر ${requests.encrypted}`);

  const total = beneficiaries.encrypted + requests.encrypted;
  console.info(`\n${dryRun ? 'سيُشفَّر' : 'شُفِّر'} ${total} حقلًا.`);

  if (!dryRun && total > 0) {
    console.info('\n⚠ احفظ ENCRYPTION_KEY في مدير أسرار، ومنفصلًا عن نسخ قاعدة البيانات.');
    console.info('  نسخة تحوي المفتاح والبيانات معًا تُلغي فائدة التشفير.');
  }
}

main()
  .catch((error) => {
    console.error('✗ فشل التشفير:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
