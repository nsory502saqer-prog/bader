import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * نقل قاعدة البيانات من خادم إلى آخر — محلي ← Supabase مثلًا.
 *
 * لماذا نسخة كاملة لا `--data-only`؟ التفريغ بالبيانات وحدها لا يضمن ترتيب
 * الإدراج حسب المفاتيح الأجنبية، فيفشل عند أول صف يشير إلى صف لم يُدرج بعد.
 * تعطيل المشغّلات يحتاج صلاحية superuser لا يمنحها Supabase. النسخة الكاملة
 * بصيغة `custom` تحلّ هذا بنفسها: `pg_restore` ينشئ الجداول، ثم يحمّل
 * البيانات، ثم يضيف قيود المفاتيح الأجنبية في النهاية.
 *
 * جدول `_prisma_migrations` ينتقل ضمنها، فتبقى حالة الترحيلات متسقة ولا
 * يحاول Prisma إعادة تطبيق ما طُبّق.
 *
 *   npm run db:transfer -- --to "postgresql://..."
 *   npm run db:transfer -- --to "postgresql://..." --dry-run
 */

type Args = { from: string; to: string; binDir: string; dryRun: boolean; force: boolean };

/** الجداول التي تُقارَن أعدادها بعد النقل. */
const VERIFY_TABLES = [
  'beneficiaries',
  'requests',
  'request_items',
  'status_history',
  'users',
  'items',
  'notifications',
];

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | null => {
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };

  const from = get('from') ?? process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '';
  const to = get('to') ?? process.env['TARGET_DATABASE_URL'] ?? '';

  if (!from) {
    console.error('المصدر غير معروف: اضبط DATABASE_URL أو مرّر --from');
    process.exit(1);
  }
  if (!to) {
    console.error(
      'الوجهة غير معروفة. مرّر --to "postgresql://..." أو اضبط TARGET_DATABASE_URL.\n' +
        'في Supabase: Project Settings ← Database ← Connection string ← Session pooler',
    );
    process.exit(1);
  }

  return {
    from,
    to,
    binDir: get('bin') ?? process.env['PG_BIN'] ?? 'C:\\pgsql17\\pgsql\\bin',
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

function tool(binDir: string, name: string): string {
  return process.platform === 'win32' ? path.join(binDir, `${name}.exe`) : path.join(binDir, name);
}

/** يخفي كلمة المرور قبل الطباعة أو التسجيل. */
function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@');
}

type Target = { args: string[]; env: NodeJS.ProcessEnv; database: string };

function target(url: string): Target {
  const parsed = new URL(url);

  return {
    args: [
      '-h',
      parsed.hostname,
      '-p',
      parsed.port || '5432',
      '-U',
      decodeURIComponent(parsed.username),
    ],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
  };
}

async function psql(binDir: string, t: Target, sql: string): Promise<string> {
  const { stdout } = await run(
    tool(binDir, 'psql'),
    [...t.args, '-d', t.database, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { env: t.env, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout.trim();
}

async function countRows(binDir: string, t: Target, table: string): Promise<number> {
  try {
    const value = await psql(binDir, t, `SELECT count(*) FROM public."${table}"`);
    return Number.parseInt(value, 10) || 0;
  } catch {
    // الجدول غير موجود بعد في الوجهة — صفر لا خطأ.
    return 0;
  }
}

async function main() {
  const args = parseArgs();
  const source = target(args.from);
  const destination = target(args.to);

  console.info(`▸ المصدر:  ${redact(args.from)}`);
  console.info(`▸ الوجهة:  ${redact(args.to)}`);
  if (args.dryRun) console.info('▸ وضع التجربة: لن يُكتب شيء في الوجهة.\n');

  // ── 1. التحقق من الوصول ──
  console.info('\n▸ فحص الاتصال…');
  const sourceVersion = await psql(args.binDir, source, 'SELECT version()');
  console.info(`  المصدر: ${sourceVersion.split(',')[0]}`);

  const destinationVersion = await psql(args.binDir, destination, 'SELECT version()');
  console.info(`  الوجهة: ${destinationVersion.split(',')[0]}`);

  // ── 2. الوجهة يجب أن تكون فارغة ──
  const existing = await psql(
    args.binDir,
    destination,
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const tableCount = Number.parseInt(existing, 10) || 0;

  if (tableCount > 0 && !args.force) {
    console.error(
      `\n✗ الوجهة تحوي ${tableCount} جدولًا في مخطط public.\n` +
        '  النقل فوق بيانات قائمة يُنتج تضاربًا في المفاتيح الفريدة.\n' +
        '  أفرغ المخطط أولًا، أو مرّر --force إن كنت تقصد الكتابة فوقه:\n' +
        '    DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    );
    process.exit(1);
  }

  // ── 3. الامتدادات ──
  // البحث العربي التقريبي يعتمد pg_trgm، فبدونه تُنشأ الجداول ويفشل البحث.
  console.info('\n▸ تفعيل الامتدادات في الوجهة…');
  if (!args.dryRun) {
    for (const extension of ['pg_trgm', 'unaccent']) {
      await psql(args.binDir, destination, `CREATE EXTENSION IF NOT EXISTS ${extension}`).catch(
        () => {
          console.warn(`  تحذير: تعذّر إنشاء ${extension} — قد يكون مفعّلًا في مخطط آخر.`);
        },
      );
    }
    console.info('  ✓ pg_trgm · unaccent');
  }

  // ── 4. التفريغ ──
  const workDir = mkdtempSync(path.join(tmpdir(), 'bader-transfer-'));
  const dumpFile = path.join(workDir, 'source.dump');

  try {
    console.info('\n▸ تفريغ المصدر…');
    await run(
      tool(args.binDir, 'pg_dump'),
      [
        ...source.args,
        '-d',
        source.database,
        '--format=custom',
        '--schema=public',
        // الوجهة المستضافة لها ملّاكها وأدوارها، فلا تُنقل ملكية المصدر.
        '--no-owner',
        '--no-privileges',
        '--file',
        dumpFile,
      ],
      { env: source.env, maxBuffer: 128 * 1024 * 1024 },
    );

    const bytes = statSync(dumpFile).size;
    console.info(`  ✓ ${(bytes / 1024 / 1024).toFixed(2)} ميجابايت`);

    const before: Record<string, number> = {};
    for (const table of VERIFY_TABLES) {
      before[table] = await countRows(args.binDir, source, table);
    }

    if (args.dryRun) {
      console.info('\nأعداد الصفوف في المصدر:');
      for (const [table, count] of Object.entries(before)) {
        console.info(`  ${table.padEnd(18)} ${count}`);
      }
      console.info('\n(وضع تجربة — لم يُكتب شيء في الوجهة)');
      return;
    }

    // ── 5. الاستعادة ──
    console.info('\n▸ الاستعادة في الوجهة…');
    try {
      await run(
        tool(args.binDir, 'pg_restore'),
        [
          ...destination.args,
          '-d',
          destination.database,
          '--no-owner',
          '--no-privileges',
          // لا توقّف عند أول خطأ: أوامر إنشاء الامتدادات تفشل على المستضافات
          // لأنها مفعّلة أصلًا في مخطط آخر، وذلك غير مؤثّر.
          dumpFile,
        ],
        { env: destination.env, maxBuffer: 128 * 1024 * 1024 },
      );
    } catch (error) {
      // pg_restore يخرج بحالة غير صفرية لأي تحذير، فالحكم على النتيجة
      // يكون بمقارنة الصفوف لا بحالة الخروج.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  تحذيرات أثناء الاستعادة (تُقيَّم بمقارنة الصفوف أدناه):`);
      console.warn(`  ${message.split('\n').slice(0, 4).join('\n  ')}`);
    }

    // ── 6. التحقق ──
    console.info('\n▸ مقارنة أعداد الصفوف:');
    let mismatched = 0;

    for (const table of VERIFY_TABLES) {
      const sourceCount = before[table] ?? 0;
      const destinationCount = await countRows(args.binDir, destination, table);
      const ok = sourceCount === destinationCount;
      if (!ok) mismatched += 1;

      console.info(
        `  ${ok ? '✓' : '✗'} ${table.padEnd(18)} ${String(sourceCount).padStart(6)} → ${String(destinationCount).padStart(6)}`,
      );
    }

    if (mismatched > 0) {
      console.error(`\n✗ ${mismatched} جدولًا لم تتطابق أعداده. راجع التحذيرات أعلاه.`);
      process.exit(1);
    }

    console.info('\n✓ اكتمل النقل وتطابقت كل الأعداد.');
    console.info('\nالخطوات التالية:');
    console.info('  1. حدّث DATABASE_URL و DIRECT_URL في .env إلى الوجهة.');
    console.info('  2. npx prisma migrate status   للتأكد من اتساق الترحيلات.');
    console.info('  3. npm run dev                 وجرّب الدخول والبحث العربي.');
    console.info('\n⚠ ENCRYPTION_KEY نفسه لازم مع القاعدة الجديدة، وإلا لم تُقرأ الملاحظات.');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ فشل النقل: ${message}`);
  process.exit(1);
});
