import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * النسخ الاحتياطي واختبار الاسترجاع.
 *
 * **نسخة لم تُختبر ليست نسخة.** معظم كوارث فقدان البيانات تقع في منظمات كانت
 * تأخذ نسخًا يوميًا بانتظام، ثم اكتشفت لحظة الحاجة أنها فارغة أو تالفة. لذلك
 * هذا السكربت لا يكتفي بأخذ النسخة:
 *
 *   1. يأخذ نسخة مضغوطة بـ`pg_dump`.
 *   2. يحسب بصمتها ويسجّل حجمها.
 *   3. **يستعيدها فعليًا** في قاعدة بيانات مؤقتة، ويعدّ صفوف الجداول الحرجة،
 *      ثم يحذف القاعدة المؤقتة.
 *   4. يفشل بصوت عالٍ إن نقص أي شيء.
 *
 * النظام يحمل هويات وطنية وبيانات صحية، فملف النسخة نفسه بيانات حساسة:
 * يجب أن يُخزَّن مشفَّرًا وداخل المملكة، لا في مجلد مزامنة سحابي عام.
 *
 *   npm run backup            نسخة + اختبار استرجاع
 *   npm run backup -- --skip-verify   نسخة فقط (غير موصى به)
 */

type Config = {
  databaseUrl: URL;
  outDir: string;
  binDir: string;
  keepDays: number;
  verify: boolean;
};

/** الجداول التي يعني فراغها أن النسخة بلا قيمة. */
const CRITICAL_TABLES = [
  'beneficiaries',
  'requests',
  'request_items',
  'status_history',
  'users',
  'items',
];

/**
 * مجلد النسخ الافتراضي **خارج** مجلد المشروع.
 *
 * سببان: مجلد المشروع داخل Dropbox فلا يصحّ أن تتزامن نسخة تحمل هويات وطنية
 * إلى سحابة عامة؛ و`pg_dump` على ويندوز لا يكتب إلى مسار فيه محارف عربية
 * (يحوّلها إلى `?` فيفشل بـ"No such file or directory").
 */
function defaultOutDir(): string {
  return process.platform === 'win32' ? 'C:\\bader-backups' : './backups';
}

/** `pg_dump` يفشل صامتًا على المسارات غير اللاتينية — يُكتشف قبل المحاولة. */
function assertAsciiPath(dir: string): void {
  const resolved = path.resolve(dir);
  if (/[^\u0000-\u007F]/.test(resolved)) {
    throw new Error(
      `مسار النسخ يحوي محارف غير لاتينية ولا يقبلها pg_dump على ويندوز:\n  ${resolved}\n` +
        'اضبط BACKUP_DIR على مسار لاتيني، مثل C:\\bader-backups',
    );
  }
}

function loadConfig(): Config {
  const argv = process.argv.slice(2);
  const get = (name: string): string | null => {
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };

  const raw = process.env['DATABASE_URL'];
  if (!raw) {
    console.error('DATABASE_URL غير معرَّف.');
    process.exit(1);
  }

  return {
    databaseUrl: new URL(raw),
    outDir: get('out') ?? process.env['BACKUP_DIR'] ?? defaultOutDir(),
    // مسار أدوات PostgreSQL — التثبيت المحمول ليس على PATH.
    binDir: get('bin') ?? process.env['PG_BIN'] ?? 'C:\\pgsql17\\pgsql\\bin',
    keepDays: Number.parseInt(get('keep') ?? process.env['BACKUP_KEEP_DAYS'] ?? '14', 10),
    verify: !argv.includes('--skip-verify'),
  };
}

function tool(config: Config, name: string): string {
  return process.platform === 'win32'
    ? path.join(config.binDir, `${name}.exe`)
    : path.join(config.binDir, name);
}

function pgEnv(config: Config): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGPASSWORD: decodeURIComponent(config.databaseUrl.password),
  };
}

function connectionArgs(config: Config): string[] {
  return [
    '-h',
    config.databaseUrl.hostname,
    '-p',
    config.databaseUrl.port || '5432',
    '-U',
    decodeURIComponent(config.databaseUrl.username),
  ];
}

function databaseName(config: Config): string {
  return config.databaseUrl.pathname.replace(/^\//, '');
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function takeBackup(config: Config): Promise<{ file: string; bytes: number; sha256: string }> {
  assertAsciiPath(config.outDir);
  mkdirSync(config.outDir, { recursive: true });
  const file = path.resolve(config.outDir, `bader-${timestamp()}.dump`);

  console.info('▸ أخذ النسخة…');
  await run(
    tool(config, 'pg_dump'),
    [
      ...connectionArgs(config),
      '-d',
      databaseName(config),
      // الصيغة المخصّصة: مضغوطة وتسمح باسترجاع انتقائي.
      '--format=custom',
      '--compress=9',
      '--no-owner',
      '--no-privileges',
      '--file',
      file,
    ],
    { env: pgEnv(config), maxBuffer: 64 * 1024 * 1024 },
  );

  const bytes = statSync(file).size;
  if (bytes < 1024) {
    throw new Error(`النسخة صغيرة بشكل مريب (${bytes} بايت) — يُرجَّح أنها فاشلة.`);
  }

  const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  console.info(`  ✓ ${path.basename(file)} — ${(bytes / 1024 / 1024).toFixed(2)} ميجابايت`);

  return { file, bytes, sha256 };
}

/**
 * يستعيد النسخة في قاعدة مؤقتة ويعدّ صفوفها.
 * هذه الخطوة هي الفرق بين «نأخذ نسخًا» و«نملك نسخًا تعمل».
 */
async function verifyRestore(
  config: Config,
  file: string,
): Promise<Record<string, number>> {
  const scratch = `bader_restore_check_${Date.now()}`;
  const args = connectionArgs(config);
  const env = pgEnv(config);

  console.info(`▸ اختبار الاسترجاع في قاعدة مؤقتة (${scratch})…`);

  const psql = async (database: string, sql: string): Promise<string> => {
    const { stdout } = await run(
      tool(config, 'psql'),
      [...args, '-d', database, '-t', '-A', '-c', sql],
      { env, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout.trim();
  };

  await psql('postgres', `CREATE DATABASE "${scratch}" TEMPLATE template0 ENCODING 'UTF8'`);

  try {
    await run(
      tool(config, 'pg_restore'),
      [...args, '-d', scratch, '--no-owner', '--no-privileges', file],
      { env, maxBuffer: 64 * 1024 * 1024 },
    );

    const counts: Record<string, number> = {};
    for (const table of CRITICAL_TABLES) {
      const value = await psql(scratch, `SELECT count(*) FROM "${table}"`);
      counts[table] = Number.parseInt(value, 10) || 0;
    }

    const empty = CRITICAL_TABLES.filter((t) => (counts[t] ?? 0) === 0);
    if (empty.length > 0) {
      throw new Error(
        `الاسترجاع نجح لكن جداول حرجة فارغة: ${empty.join(' · ')}. النسخة غير صالحة.`,
      );
    }

    return counts;
  } finally {
    // القاعدة المؤقتة تُحذف دائمًا، حتى لو فشل الاسترجاع.
    await psql('postgres', `DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`).catch(() => {
      console.warn(`  تحذير: تعذّر حذف القاعدة المؤقتة ${scratch} — احذفها يدويًا.`);
    });
  }
}

/** يحذف النسخ الأقدم من المدة المحددة. */
function pruneOld(config: Config): number {
  const cutoff = Date.now() - config.keepDays * 86_400_000;
  let removed = 0;

  for (const name of readdirSync(config.outDir)) {
    if (!name.startsWith('bader-') || !name.endsWith('.dump')) continue;
    const full = path.join(config.outDir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      removed += 1;
    }
  }

  return removed;
}

async function main() {
  const config = loadConfig();
  const startedAt = new Date();

  try {
    const backup = await takeBackup(config);

    let counts: Record<string, number> | null = null;
    if (config.verify) {
      counts = await verifyRestore(config, backup.file);
      console.info('  ✓ الاسترجاع سليم:');
      for (const [table, count] of Object.entries(counts)) {
        console.info(`      ${table.padEnd(18)} ${count}`);
      }
    } else {
      console.warn('  ⚠ تخطّيت اختبار الاسترجاع — نسخة لم تُختبر ليست نسخة.');
    }

    const removed = pruneOld(config);
    if (removed > 0) console.info(`▸ حُذفت ${removed} نسخة أقدم من ${config.keepDays} يومًا.`);

    // سجل يُقرأ آليًا للمراقبة، بجانب المخرجات البشرية.
    const logPath = path.join(config.outDir, 'backup-log.jsonl');
    writeFileSync(
      logPath,
      JSON.stringify({
        at: startedAt.toISOString(),
        file: path.basename(backup.file),
        bytes: backup.bytes,
        sha256: backup.sha256,
        verified: config.verify,
        counts,
        durationMs: Date.now() - startedAt.getTime(),
        ok: true,
      }) + '\n',
      { flag: 'a' },
    );

    console.info(`\n✓ اكتملت النسخة الاحتياطية في ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)} ثانية.`);
    console.info(`  المجلد: ${path.resolve(config.outDir)}`);
    console.info('  تذكير: هذه النسخة تحوي هويات وطنية وبيانات صحية.');
    console.info('  خزّنها مشفَّرة وداخل المملكة، لا في مجلد مزامنة سحابي عام.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ فشلت النسخة الاحتياطية: ${message}`);

    try {
      mkdirSync(config.outDir, { recursive: true });
      writeFileSync(
        path.join(config.outDir, 'backup-log.jsonl'),
        JSON.stringify({ at: startedAt.toISOString(), ok: false, error: message }) + '\n',
        { flag: 'a' },
      );
    } catch {
      // فشل تسجيل الفشل لا يغيّر النتيجة.
    }

    process.exit(1);
  }
}

void main();
