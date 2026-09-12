import { Queue, Worker } from 'bullmq';
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

/** عنوان Redis المفكوك — BullMQ يقبله بنيويًا، والنوع الصريح يمنع تسرّب `any`. */
type RedisTarget = { host: string; port: number; password?: string };

function parseRedisUrl(): RedisTarget | null {
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

/**
 * يتحقق أن Redis يستجيب فعلًا، لا أن العنوان مكتوب فقط.
 *
 * الحالة الأرجح في الواقع ليست غياب `REDIS_URL` بل وجوده مع خادم متوقف:
 * إعداد منسوخ من بيئة أخرى، أو خدمة لم تُشغَّل بعد إعادة تمهيد. بلا هذا
 * الفحص ينهار العامل ولا تُرسل رسالة واحدة، مع أن البديل — حلقة زمنية على
 * نفس الجدول — يعمل تمامًا.
 */
async function redisReachable(connection: RedisTarget): Promise<boolean> {
  const { default: Redis } = await import('ioredis');

  const client = new Redis({
    ...connection,
    // فشل سريع: لا معنى لانتظار طويل في فحص توفّر.
    connectTimeout: 2000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  // ioredis يطبع «Unhandled error event» ما لم يُلتقط الخطأ بمستمع.
  // الفشل هنا نتيجة متوقعة للفحص لا عطل، فتُبتلع ويُكتفى برسالة مفهومة.
  client.on('error', () => {});

  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

/** حلقة زمنية على صندوق الإشعارات — البديل حين لا يتوفر Redis. */
async function runPollingLoop(): Promise<never> {
  for (;;) {
    await runJobs().catch((error) => console.error('فشل تنفيذ المهام:', error));
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
  const connection = parseRedisUrl();

  if (!connection) {
    console.info(
      'لا يوجد REDIS_URL — يعمل العامل بحلقة زمنية كل 30 ثانية.\n' +
        'الرسائل لا تضيع: مصدر الحقيقة جدول notifications لا الطابور.',
    );
    return runPollingLoop();
  }

  if (!(await redisReachable(connection))) {
    console.warn(
      `REDIS_URL مضبوط لكن لا استجابة من ${connection.host}:${connection.port}.\n` +
        'يعمل العامل بحلقة زمنية كل 30 ثانية بدل الطابور. الرسائل لا تضيع،\n' +
        'والفرق تأخير قد يبلغ نصف دقيقة. شغّل Redis أو احذف REDIS_URL للتخلّص من هذا التحذير.',
    );
    return runPollingLoop();
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
