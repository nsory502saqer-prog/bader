import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { drainOutbox } from '../src/server/notifications/outbox.js';

/**
 * عامل المهام المجدولة.
 *
 * مهمّتان: تفريغ صندوق الإشعارات، وتنظيف الجلسات ورموز التحقق المنتهية.
 *
 * BullMQ يحتاج Redis. حين لا يتوفر، يعمل العامل بحلقة زمنية بسيطة على نفس
 * الدوال — لأن مصدر الحقيقة هو جدول `notifications` لا الطابور. الطابور يسرّع
 * الالتقاط ويعطي إعادة محاولة منظّمة، وغيابه يؤخّر الرسالة دقيقة ولا يفقدها.
 *
 *   npm run worker
 */

const QUEUE_NAME = 'bader-jobs';
const POLL_INTERVAL_MS = 30_000;

function redisConnection(): ConnectionOptions | null {
  const url = process.env['REDIS_URL'];
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || '6379', 10),
      ...(parsed.password ? { password: parsed.password } : {}),
    };
  } catch {
    return null;
  }
}

async function runJobs(): Promise<void> {
  const result = await drainOutbox(100);
  if (result.sent > 0 || result.failed > 0) {
    console.info(`إشعارات: أُرسلت ${result.sent} · أخفقت ${result.failed}`);
  }

  await cleanupExpired();
}

/** حذف الجلسات ورموز التحقق المنتهية — لا تتراكم بلا فائدة. */
async function cleanupExpired(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    const now = new Date();
    await db.session.deleteMany({ where: { expires: { lt: now } } });
    await db.portalSession.deleteMany({ where: { expires: { lt: now } } });
    await db.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const connection = redisConnection();

  if (!connection) {
    console.info(
      'لا يوجد REDIS_URL صالح — يعمل العامل بحلقة زمنية كل 30 ثانية.\n' +
        'الرسائل لا تضيع: مصدر الحقيقة جدول notifications لا الطابور.',
    );

    while (true) {
      await runJobs().catch((error) => console.error('فشل تنفيذ المهام:', error));
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.info('العامل متصل بـRedis. الطابور:', QUEUE_NAME);

  const queue = new Queue(QUEUE_NAME, { connection });

  // مهمة متكرّرة تُسجَّل مرة واحدة ويعيد Redis جدولتها.
  await queue.upsertJobScheduler(
    'drain-outbox',
    { every: POLL_INTERVAL_MS },
    { name: 'drain-outbox' },
  );

  const worker = new Worker(QUEUE_NAME, async () => runJobs(), {
    connection,
    concurrency: 1,
  });

  worker.on('failed', (job, error) => {
    console.error(`فشلت المهمة ${job?.name}:`, error.message);
  });

  const shutdown = async () => {
    console.info('إيقاف العامل…');
    await worker.close();
    await queue.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('تعذّر تشغيل العامل:', error);
  process.exit(1);
});
