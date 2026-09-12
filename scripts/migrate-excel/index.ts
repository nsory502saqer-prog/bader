import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Gender, PrismaClient, RequestStatus, type Prisma } from '@prisma/client';
import { cleanDisplayText, normalizeArabic, normalizePhone, toLatinDigits } from '../../src/lib/arabic.js';
import {
  mapIncomeSource,
  monthFromSheetName,
  parseItemsCell,
  resolveStatus,
  splitCity,
  type ParsedItem,
} from './dictionaries.js';

/**
 * ترحيل ملف Excel القديم إلى قاعدة البيانات.
 *
 * مبادئ ملزمة:
 *   1. **لا يُهمَل شيء صامتًا.** كل صف مرفوض وكل بند غير مطابَق يُسجَّل باسمه
 *      وموضعه في تقرير يُراجَع بشريًا.
 *   2. **النص الأصلي يبقى.** `legacy_text` يحفظ ما كان مكتوبًا في الخلية حتى
 *      لو نجحت المطابقة، فيمكن دائمًا الرجوع للمصدر.
 *   3. **الهوية تدمج.** المستفيد الواحد سجل واحد مهما تكرّر عبر الشهور، وله
 *      عدة طلبات.
 *   4. **التشغيل قابل للإعادة.** الطلب المرحَّل يحمل `legacy_row_ref` فريدًا،
 *      فإعادة التشغيل لا تُنتج نسخًا مكرّرة.
 *
 * الاستعمال:
 *   npm run migrate:excel -- --file "<path>" --sheet يناير     تجربة شهر واحد
 *   npm run migrate:excel -- --file "<path>" --dry-run          بلا كتابة
 *   npm run migrate:excel -- --file "<path>"                    كل الشهور
 */

const db = new PrismaClient();

type Args = {
  file: string;
  sheet: string | null;
  dryRun: boolean;
  year: number;
  outDir: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | null => {
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };

  const file = get('file');
  if (!file) {
    console.error('مطلوب: --file "مسار ملف Excel"');
    process.exit(1);
  }

  return {
    file,
    sheet: get('sheet'),
    dryRun: argv.includes('--dry-run'),
    year: Number.parseInt(get('year') ?? '2026', 10),
    outDir: get('out') ?? 'reports',
  };
}

// ───────────────────────────── قراءة الخلايا ─────────────────────────────

/** يحوّل أي خلية إلى نص، بما فيها الخلايا الغنية والصيغ والروابط. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'نعم' : null;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(rich.richText)) {
      const joined = rich.richText.map((r) => r.text).join('').trim();
      return joined || null;
    }
    if (typeof rich.text === 'string') return rich.text.trim() || null;
    if (rich.result !== undefined && rich.result !== null) return String(rich.result).trim() || null;
  }

  return null;
}

// ───────────────────────────── التقرير ─────────────────────────────

type Rejection = { ref: string; name: string; reason: string; raw: string };
type Unmatched = { ref: string; program: string; legacyText: string; requestNo: string };

const report = {
  sheets: [] as string[],
  rowsSeen: 0,
  rowsSkippedEmpty: 0,
  rowsSkippedSummary: 0,
  beneficiariesCreated: 0,
  beneficiariesMerged: 0,
  requestsCreated: 0,
  requestsSkippedExisting: 0,
  itemsCreated: 0,
  itemsMatched: 0,
  itemsUnmatched: 0,
  statusUnrecognised: 0,
  rejections: [] as Rejection[],
  unmatched: [] as Unmatched[],
  cityUnmapped: new Map<string, number>(),
  incomeUnmapped: new Map<string, number>(),
};

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// ───────────────────────────── الترحيل ─────────────────────────────

const PROGRAM_COLUMNS: { header: string[]; programCode: string }[] = [
  { header: ['لارتاح'], programCode: 'LARTAH' },
  { header: ['سندي'], programCode: 'SANDI' },
  { header: ['لاسمعك', 'لأسمعك'], programCode: 'LASMAAK' },
  { header: ['اتوكأعليها', 'أتوكأ عليها', 'اتوكاعليها'], programCode: 'ATTAKKA' },
  { header: ['اوكسجين', 'أوكسجين'], programCode: 'OXYGEN' },
  // العمود القديم اسمه «مستلزمات»، وفي شهري يونيو ويوليو صار «كفالة مريض».
  // الاسم المعتمد في النظام الجديد هو «كفالة مريض» وحده.
  { header: ['مستلزمات', 'كفالة مريض'], programCode: 'PATIENT_CARE' },
];

const WORKFLOW_COLUMNS = ['الفرز', 'الإنجاز', 'إنجاز المستودع', 'إنجاز المشتريات', 'التاكيد'];

async function main() {
  const args = parseArgs();
  console.log(`▸ الملف: ${args.file}`);
  if (args.dryRun) console.log('▸ وضع التجربة: لن تُكتب أي بيانات.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(args.file);

  // مرجع الكتالوج والقوائم
  const [items, cities, districts, incomeSources, migrationUser] = await Promise.all([
    db.item.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, hasSizes: true, program: { select: { code: true } } },
    }),
    db.city.findMany({ select: { id: true, name: true } }),
    db.district.findMany({ select: { id: true, cityId: true, name: true } }),
    db.incomeSource.findMany({ select: { id: true, name: true } }),
    ensureMigrationUser(args.dryRun),
  ]);

  const itemByName = new Map(items.map((i) => [i.name, i]));
  const cityByName = new Map(cities.map((c) => [c.name, c]));
  const districtByKey = new Map(districts.map((d) => [`${d.cityId}|${normalizeArabic(d.name)}`, d]));
  const incomeByName = new Map(incomeSources.map((s) => [s.name, s]));

  const sheets = workbook.worksheets.filter(
    (ws) => !args.sheet || ws.name.trim() === args.sheet.trim(),
  );

  if (sheets.length === 0) {
    console.error(`لا يوجد شيت باسم «${args.sheet}». الشيتات المتاحة: ` +
      workbook.worksheets.map((w) => w.name.trim()).join(' · '));
    process.exit(1);
  }

  for (const ws of sheets) {
    const sheetName = ws.name.trim();
    report.sheets.push(sheetName);

    const month = monthFromSheetName(sheetName);
    if (!month) {
      console.warn(`  تحذير: لم يُفهم اسم الشيت «${sheetName}» كشهر — يُستعمل يناير.`);
    }
    // لا عمود تاريخ في المصدر إطلاقًا، واسم الشيت هو الدليل الوحيد على الزمن.
    const requestDate = new Date(Date.UTC(args.year, (month ?? 1) - 1, 1, 9, 0, 0));

    const headers = ws.getRow(1).values as ExcelJS.CellValue[];
    const headerNames = headers.slice(1).map((h) => (cellText(h) ?? '').trim());
    const colIndex = (names: string[]): number => {
      for (const name of names) {
        const index = headerNames.indexOf(name);
        if (index >= 0) return index;
      }
      return -1;
    };

    const iName = colIndex(['الاسم', 'الإسم']);
    const iGender = colIndex(['ج']);
    const iId = colIndex(['الهويه', 'الهوية']);
    const iFile = colIndex(['الملف']);
    const iIncome = colIndex(['الضمان']);
    const iCity = colIndex(['المدينة', 'المدينه']);
    const iCare = colIndex(['عناية', 'عنايه']);
    const iPhone = colIndex(['الجوال', 'الهاتف', 'رقم الجوال']);

    console.log(`\n▸ ${sheetName} (${ws.rowCount - 1} صفًا)`);
    let created = 0;

    for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
      const row = ws.getRow(rowNumber);
      const values = (row.values as ExcelJS.CellValue[]).slice(1);
      const ref = `${sheetName}!${rowNumber}`;

      const cell = (index: number): string | null =>
        index >= 0 ? cellText(values[index] ?? null) : null;

      const rawName = cell(iName);
      const rawId = cell(iId);

      if (!rawName && !rawId) {
        report.rowsSkippedEmpty += 1;
        continue;
      }
      report.rowsSeen += 1;

      // أسفل كل شيت كتل إحصائية («عدد المستفيدين»، «مجموع...») ليست طلبات.
      if (!rawId || !rawName) {
        report.rowsSkippedSummary += 1;
        continue;
      }

      const nationalId = toLatinDigits(rawId).replace(/\D/g, '');
      if (nationalId.length !== 10) {
        // لا نخترع رقمًا: يُرفض الصف ويُسجَّل ليصحّحه موظف.
        report.rejections.push({
          ref,
          name: rawName,
          reason: `رقم هوية غير صالح (${nationalId.length} رقمًا)`,
          raw: rawId,
        });
        continue;
      }
      if (!nationalId.startsWith('1') && !nationalId.startsWith('2')) {
        report.rejections.push({
          ref,
          name: rawName,
          reason: 'رقم الهوية لا يبدأ بـ1 أو 2',
          raw: rawId,
        });
        continue;
      }

      const fullName = cleanDisplayText(rawName);
      if (fullName.length < 3) {
        report.rejections.push({ ref, name: rawName, reason: 'الاسم قصير جدًا', raw: rawName });
        continue;
      }

      const genderRaw = (cell(iGender) ?? '').trim();
      const gender: Gender = genderRaw.startsWith('ث') ? Gender.female : Gender.male;

      const incomeRaw = cell(iIncome);
      const incomeName = mapIncomeSource(incomeRaw);
      if (incomeRaw && !incomeName) bump(report.incomeUnmapped, incomeRaw);

      const cityRaw = cell(iCity);
      const { city: cityName, district: districtName } = splitCity(cityRaw);
      if (cityRaw && !cityName) bump(report.cityUnmapped, cityRaw);

      const status = resolveStatus(WORKFLOW_COLUMNS.map((h) => cell(colIndex([h]))));
      if (!status.matched) report.statusUnrecognised += 1;

      // البنود: كل عمود برنامج نص حر يُفكّ إلى بنود مستقلة.
      const parsed: { programCode: string; parsed: ParsedItem }[] = [];
      for (const column of PROGRAM_COLUMNS) {
        const raw = cell(colIndex(column.header));
        for (const entry of parseItemsCell(raw, column.programCode)) {
          parsed.push({ programCode: column.programCode, parsed: entry });
        }
      }

      if (parsed.length === 0) {
        report.rejections.push({
          ref,
          name: fullName,
          reason: 'لا يوجد أي بند في أعمدة البرامج',
          raw: '',
        });
        continue;
      }

      const fileNo = cell(iFile);
      const careBy = cell(iCare);
      const phone = normalizePhone(cell(iPhone) ?? '');

      const notes = [
        fileNo ? `رقم الملف في النظام القديم: ${fileNo}` : null,
        careBy ? `عناية: ${careBy}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      if (args.dryRun) {
        report.requestsCreated += 1;
        report.itemsCreated += parsed.length;
        for (const entry of parsed) {
          if (entry.parsed.itemName && itemByName.has(entry.parsed.itemName)) {
            report.itemsMatched += 1;
          } else {
            report.itemsUnmatched += 1;
            report.unmatched.push({
              ref,
              program: entry.programCode,
              legacyText: entry.parsed.legacyText,
              requestNo: '(تجربة)',
            });
          }
        }
        created += 1;
        continue;
      }

      await db.$transaction(async (tx) => {
        // الهوية تدمج: مستفيد واحد له كل طلبات الشهور.
        const existing = await tx.beneficiary.findUnique({ where: { nationalId } });

        const cityId = cityName ? (cityByName.get(cityName)?.id ?? null) : null;
        let districtId: number | null = null;
        if (cityId && districtName) {
          const key = `${cityId}|${normalizeArabic(districtName)}`;
          const found = districtByKey.get(key);
          if (found) {
            districtId = found.id;
          } else {
            const createdDistrict = await tx.district.create({
              data: { cityId, name: districtName },
            });
            districtByKey.set(key, createdDistrict);
            districtId = createdDistrict.id;
          }
        }

        const beneficiaryData = {
          fullName,
          nameNormalized: normalizeArabic(fullName),
          gender,
          phone,
          incomeSourceId: incomeName ? (incomeByName.get(incomeName)?.id ?? null) : null,
          cityId,
          districtId,
          addressNote: cityRaw,
        };

        let beneficiaryId: string;
        if (existing) {
          beneficiaryId = existing.id;
          report.beneficiariesMerged += 1;
          // أحدث شهر يحمل أحدث بيانات، فتُحدَّث الحقول الفارغة فقط.
          await tx.beneficiary.update({
            where: { id: existing.id },
            data: {
              phone: existing.phone ?? beneficiaryData.phone,
              incomeSourceId: existing.incomeSourceId ?? beneficiaryData.incomeSourceId,
              cityId: existing.cityId ?? beneficiaryData.cityId,
              districtId: existing.districtId ?? beneficiaryData.districtId,
            },
          });
        } else {
          const createdBeneficiary = await tx.beneficiary.create({
            data: { nationalId, ...beneficiaryData },
            select: { id: true },
          });
          beneficiaryId = createdBeneficiary.id;
          report.beneficiariesCreated += 1;
        }

        // إعادة التشغيل لا تُنتج نسخًا: المرجع الأصلي يميّز كل صف.
        const already = await tx.request.findFirst({
          where: { legacyRowRef: ref },
          select: { id: true },
        });
        if (already) {
          report.requestsSkippedExisting += 1;
          return;
        }

        const requestNo = await nextLegacyRequestNumber(tx, args.year);
        const closed =
          status.status === RequestStatus.delivered ||
          status.status === RequestStatus.rejected ||
          status.status === RequestStatus.cancelled;

        const itemsData: Prisma.RequestItemCreateWithoutRequestInput[] = parsed.map((entry) => {
          const catalogItem = entry.parsed.itemName ? itemByName.get(entry.parsed.itemName) : undefined;

          if (catalogItem) report.itemsMatched += 1;
          else {
            report.itemsUnmatched += 1;
            report.unmatched.push({
              ref,
              program: entry.programCode,
              legacyText: entry.parsed.legacyText,
              requestNo,
            });
          }

          return {
            ...(catalogItem ? { item: { connect: { id: catalogItem.id } } } : {}),
            // المقاس يُحفظ فقط لصنف يقبل المقاسات.
            size: catalogItem?.hasSizes ? entry.parsed.size : null,
            quantity: entry.parsed.quantity,
            itemStatus: closed ? 'issued' : 'pending',
            fulfilledQty: closed ? entry.parsed.quantity : 0,
            legacyText: entry.parsed.legacyText,
            note: entry.parsed.note,
          };
        });

        const request = await tx.request.create({
          data: {
            requestNo,
            beneficiaryId,
            status: status.status,
            submittedAt: requestDate,
            closedAt: closed ? requestDate : null,
            createdById: migrationUser,
            source: 'walk_in',
            notes: notes || null,
            legacyRowRef: ref,
            createdAt: requestDate,
            items: { create: itemsData },
          },
          select: { id: true },
        });

        // قيد واحد في السجل يوثّق أن الحالة مرحَّلة لا مُنفَّذة في النظام.
        await tx.statusHistory.create({
          data: {
            requestId: request.id,
            fromStatus: null,
            toStatus: status.status,
            userId: migrationUser,
            changedAt: requestDate,
            note: status.matched
              ? `مرحَّل من ${ref}`
              : `مرحَّل من ${ref} — لم تُفهم قيمة سير العمل، فاعتُمدت «مقدَّم»`,
          },
        });

        report.requestsCreated += 1;
        report.itemsCreated += itemsData.length;
      });

      created += 1;
    }

    console.log(`  ✓ ${created} صفًا`);
  }

  writeReports(args);
  printSummary(args);
  await db.$disconnect();
}

/** حساب النظام الذي تُنسب إليه السجلات المرحّلة، فلا تُنسب لموظف حقيقي. */
async function ensureMigrationUser(dryRun: boolean): Promise<string> {
  const email = 'migration@bader.org.sa';
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return existing.id;
  if (dryRun) return '00000000-0000-0000-0000-000000000000';

  const created = await db.user.create({
    data: {
      name: 'ترحيل البيانات',
      email,
      role: 'admin',
      isActive: false, // حساب نظامي لا يُسجَّل به دخول
    },
    select: { id: true },
  });
  return created.id;
}

/** أرقام الطلبات المرحّلة تتبع نفس الصيغة `AID-YYYY-NNNNN`. */
async function nextLegacyRequestNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const pattern = `AID-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`request_no:${year}`}))`;

  const last = await tx.request.findFirst({
    where: { requestNo: { startsWith: pattern } },
    orderBy: { requestNo: 'desc' },
    select: { requestNo: true },
  });

  const lastSeq = last ? Number.parseInt(last.requestNo.slice(pattern.length), 10) : 0;
  return `${pattern}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(5, '0')}`;
}

// ───────────────────────────── المخرجات ─────────────────────────────

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function writeReports(args: Args) {
  mkdirSync(args.outDir, { recursive: true });

  const unmatchedCsv = [
    ['المرجع', 'البرنامج', 'النص الأصلي', 'رقم الطلب'].map(csvCell).join(','),
    ...report.unmatched.map((u) =>
      [u.ref, u.program, u.legacyText, u.requestNo].map(csvCell).join(','),
    ),
  ].join('\n');
  // BOM حتى يفتح Excel الملف بترميز UTF-8 بلا تشويه للعربية.
  writeFileSync(path.join(args.outDir, 'unmatched_items.csv'), '﻿' + unmatchedCsv, 'utf8');

  const rejectedCsv = [
    ['المرجع', 'الاسم', 'السبب', 'القيمة الأصلية'].map(csvCell).join(','),
    ...report.rejections.map((r) => [r.ref, r.name, r.reason, r.raw].map(csvCell).join(',')),
  ].join('\n');
  writeFileSync(path.join(args.outDir, 'rejected_rows.csv'), '﻿' + rejectedCsv, 'utf8');

  writeFileSync(
    path.join(args.outDir, 'migration_report.json'),
    JSON.stringify(
      {
        ...report,
        cityUnmapped: Object.fromEntries(report.cityUnmapped),
        incomeUnmapped: Object.fromEntries(report.incomeUnmapped),
        rejections: report.rejections.length,
        unmatched: report.unmatched.length,
        generatedAt: new Date().toISOString(),
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function printSummary(args: Args) {
  const line = '─'.repeat(52);
  console.log(`\n${line}\nتقرير الترحيل\n${line}`);
  console.log(`الشيتات:                ${report.sheets.join(' · ')}`);
  console.log(`صفوف قُرئت:              ${report.rowsSeen}`);
  console.log(`صفوف فارغة:             ${report.rowsSkippedEmpty}`);
  console.log(`صفوف إحصائية متجاهَلة:   ${report.rowsSkippedSummary}`);
  console.log(`مستفيدون جدد:           ${report.beneficiariesCreated}`);
  console.log(`مستفيدون مدمجون:        ${report.beneficiariesMerged}`);
  console.log(`طلبات أُنشئت:            ${report.requestsCreated}`);
  console.log(`طلبات موجودة مسبقًا:     ${report.requestsSkippedExisting}`);
  console.log(`بنود أُنشئت:             ${report.itemsCreated}`);
  console.log(`  منها مطابَقة:          ${report.itemsMatched}`);
  console.log(`  غير مطابَقة:           ${report.itemsUnmatched}`);
  console.log(`حالات لم تُفهم:          ${report.statusUnrecognised}`);
  console.log(`صفوف مرفوضة:            ${report.rejections.length}`);

  if (report.cityUnmapped.size > 0) {
    console.log(`\nمدن لم تُطابَق (${report.cityUnmapped.size}):`);
    for (const [value, count] of [...report.cityUnmapped].slice(0, 10)) {
      console.log(`  ${count}× ${value}`);
    }
  }
  if (report.incomeUnmapped.size > 0) {
    console.log(`\nمصادر دخل لم تُطابَق (${report.incomeUnmapped.size}):`);
    for (const [value, count] of [...report.incomeUnmapped].slice(0, 10)) {
      console.log(`  ${count}× ${value}`);
    }
  }

  console.log(`\nالتقارير في: ${path.resolve(args.outDir)}`);
  console.log('  unmatched_items.csv   البنود التي تحتاج مراجعة بشرية');
  console.log('  rejected_rows.csv     الصفوف المرفوضة وأسبابها');
  console.log('  migration_report.json الملخص الكامل');
  if (args.dryRun) console.log('\n(وضع تجربة — لم تُكتب أي بيانات)');
}

main().catch(async (error) => {
  console.error('✗ فشل الترحيل:', error);
  await db.$disconnect();
  process.exit(1);
});
