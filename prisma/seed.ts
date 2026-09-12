import { PrismaClient, Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import { normalizeArabic } from '../src/lib/arabic.js';

/**
 * البيانات الأولية.
 *
 * كل ما يمكن تصنيفه يعيش هنا كقائمة مرجعية، لأن الإدخال النصي الحر هو بالضبط
 * ما أفسد ملف الإكسل القديم. لا حقل حر لمدينة ولا لمصدر دخل ولا لصنف.
 *
 * السكربت idempotent: يمكن تشغيله مرارًا بلا تكرار (upsert على المفاتيح الفريدة).
 */

const db = new PrismaClient();

const PROGRAMS = [
  { code: 'LARTAH', name: 'لارتاح', description: 'الأسرّة والمراتب الطبية', sortOrder: 1 },
  { code: 'SANDI', name: 'سندي', description: 'الكراسي المتحركة والعكاكيز', sortOrder: 2 },
  { code: 'LASMAAK', name: 'لأسمعك', description: 'سماعات الأذن الطبية', sortOrder: 3 },
  { code: 'ATTAKKA', name: 'أتوكأ عليها', description: 'الأطراف الصناعية', sortOrder: 4 },
  { code: 'OXYGEN', name: 'أوكسجين', description: 'أجهزة التنفس والأكسجين', sortOrder: 5 },
  {
    code: 'PATIENT_CARE',
    name: 'كفالة مريض',
    description: 'المستلزمات الطبية الاستهلاكية والرعاية المستمرة',
    sortOrder: 6,
  },
] as const;

const INCOME_SOURCES = [
  'عاطل عن العمل',
  'راتب',
  'ربة منزل',
  'متقاعد',
  'الضمان الاجتماعي',
  'التأمينات الاجتماعية',
  'تأهيل شامل',
  'طالب',
  'موظف',
  'لا يوجد دخل',
];

const CITIES = [
  'جدة',
  'مكة المكرمة',
  'الطائف',
  'القنفذة',
  'خليص',
  'رابغ',
  'الليث',
  'الكامل',
];

type SeedItem = {
  name: string;
  unit?: string;
  hasSizes?: boolean;
  reorderLevel?: number;
};

const ITEMS: Record<string, SeedItem[]> = {
  LARTAH: [
    { name: 'سرير طبي كهربائي', unit: 'جهاز', reorderLevel: 3 },
    { name: 'سرير طبي يدوي', unit: 'جهاز', reorderLevel: 3 },
    { name: 'مرتبة طبية هوائية', unit: 'قطعة', reorderLevel: 5 },
    { name: 'مرتبة طبية عادية', unit: 'قطعة', reorderLevel: 5 },
  ],
  SANDI: [
    { name: 'كرسي متحرك عادي', unit: 'كرسي', reorderLevel: 5 },
    { name: 'كرسي متحرك كهربائي', unit: 'كرسي', reorderLevel: 2 },
    { name: 'كرسي متحرك طويل الظهر', unit: 'كرسي', reorderLevel: 2 },
    { name: 'كرسي متحرك أطفال', unit: 'كرسي', reorderLevel: 2 },
    { name: 'كرسي استحمام شبكي', unit: 'كرسي', reorderLevel: 3 },
    { name: 'كرسي حمام متحرك', unit: 'كرسي', reorderLevel: 3 },
    { name: 'عكاز تحت الكتف', unit: 'زوج', reorderLevel: 5 },
    { name: 'عكاز طبي', unit: 'قطعة', reorderLevel: 5 },
    { name: 'ووكر (مشاية طبية)', unit: 'قطعة', reorderLevel: 5 },
  ],
  LASMAAK: [{ name: 'سماعة أذن طبية', unit: 'سماعة', reorderLevel: 2 }],
  ATTAKKA: [
    { name: 'طرف صناعي تحت الركبة', unit: 'طرف' },
    { name: 'طرف صناعي فوق الركبة', unit: 'طرف' },
    { name: 'استبدال طرف صناعي', unit: 'عملية' },
  ],
  OXYGEN: [
    { name: 'جهاز تنفس بايباب (BiPAP)', unit: 'جهاز', reorderLevel: 2 },
    { name: 'جهاز تنفس سيباب (CPAP)', unit: 'جهاز', reorderLevel: 2 },
    { name: 'جهاز تنفس بخار (Nebulizer)', unit: 'جهاز', reorderLevel: 5 },
    { name: 'أسطوانة أكسجين 15 لتر', unit: 'أسطوانة', reorderLevel: 5 },
    { name: 'مكثف أكسجين', unit: 'جهاز', reorderLevel: 3 },
  ],
  PATIENT_CARE: [
    { name: 'حفاضات لاصق', unit: 'كيس', hasSizes: true, reorderLevel: 40 },
    { name: 'حفاضات كلوت', unit: 'كيس', hasSizes: true, reorderLevel: 40 },
    { name: 'مفارش طبية', unit: 'كيس', reorderLevel: 30 },
    { name: 'مناديل مبللة', unit: 'عبوة', reorderLevel: 30 },
    { name: 'مناديل جافة', unit: 'عبوة', reorderLevel: 30 },
    { name: 'قفازات فينيل', unit: 'علبة', reorderLevel: 20 },
    { name: 'قطن طبي', unit: 'عبوة', reorderLevel: 20 },
    { name: 'لاصق جروح', unit: 'علبة', reorderLevel: 20 },
    { name: 'شرائح فحص السكر', unit: 'علبة', reorderLevel: 25 },
    { name: 'جهاز قياس السكر', unit: 'جهاز', reorderLevel: 10 },
    { name: 'جهاز قياس الضغط الإلكتروني', unit: 'جهاز', reorderLevel: 10 },
    { name: 'جهاز قياس نسبة الأكسجين في الدم', unit: 'جهاز', reorderLevel: 10 },
    { name: 'إبر قلم الأنسولين', unit: 'علبة', reorderLevel: 25 },
    { name: 'مسحات طبية', unit: 'علبة', reorderLevel: 20 },
  ],
};

/** المقاسات المتاحة للأصناف ذات has_sizes */
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

/** حسابات التشغيل الأولية — تُغيَّر كلمات مرورها فور التسليم */
const USERS: { name: string; email: string; role: Role }[] = [
  { name: 'مدير النظام', email: 'admin@bader.org.sa', role: Role.admin },
  { name: 'موظف الاستقبال', email: 'reception@bader.org.sa', role: Role.reception },
  { name: 'الباحث الاجتماعي', email: 'screener@bader.org.sa', role: Role.screener },
  { name: 'أمين المستودع', email: 'warehouse@bader.org.sa', role: Role.warehouse },
  { name: 'موظف المشتريات', email: 'purchasing@bader.org.sa', role: Role.purchasing },
  { name: 'المحاسب', email: 'finance@bader.org.sa', role: Role.finance },
  { name: 'مطّلع', email: 'viewer@bader.org.sa', role: Role.viewer },
];

const DEFAULT_PASSWORD = process.env['SEED_PASSWORD'] ?? 'Bader@2026';

async function main() {
  console.log('▸ البرامج');
  for (const p of PROGRAMS) {
    await db.program.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description, sortOrder: p.sortOrder },
      create: { ...p },
    });
  }

  console.log('▸ مصادر الدخل');
  for (const name of INCOME_SOURCES) {
    await db.incomeSource.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('▸ المدن');
  for (const name of CITIES) {
    await db.city.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('▸ الأصناف');
  let itemCount = 0;
  for (const [code, list] of Object.entries(ITEMS)) {
    const program = await db.program.findUniqueOrThrow({ where: { code } });
    const isConsumable = code === 'PATIENT_CARE';

    for (const item of list) {
      await db.item.upsert({
        where: { programId_name: { programId: program.id, name: item.name } },
        update: {
          unit: item.unit ?? 'حبة',
          hasSizes: item.hasSizes ?? false,
          isConsumable,
          reorderLevel: item.reorderLevel ?? 0,
        },
        create: {
          programId: program.id,
          name: item.name,
          unit: item.unit ?? 'حبة',
          hasSizes: item.hasSizes ?? false,
          isConsumable,
          reorderLevel: item.reorderLevel ?? 0,
        },
      });
      itemCount += 1;
    }
  }
  console.log(`  ${itemCount} صنفًا`);

  console.log('▸ أرصدة المخزون (صفر ابتدائي لكل صنف/مقاس)');
  const items = await db.item.findMany({ where: { deletedAt: null } });
  for (const item of items) {
    const sizes: (string | null)[] = item.hasSizes ? [...SIZES] : [null];
    for (const size of sizes) {
      const existing = await db.inventory.findFirst({ where: { itemId: item.id, size } });
      if (!existing) {
        await db.inventory.create({ data: { itemId: item.id, size } });
      }
    }
  }

  console.log('▸ المستخدمون');
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);
  for (const u of USERS) {
    await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true },
      create: { ...u, password: passwordHash },
    });
  }

  console.log('▸ الإعدادات العامة');
  const settings: { key: string; value: unknown }[] = [
    { key: 'org.name', value: 'جمعية بادر للأجهزة الطبية' },
    { key: 'org.region', value: 'منطقة مكة المكرمة' },
    { key: 'org.logoPath', value: '/logo.svg' },
    {
      key: 'sla.days',
      value: {
        submitted: 2,
        screening: 3,
        approved: 2,
        warehouse: 5,
        purchasing: 10,
        ready_to_issue: 3,
        order_issued: 5,
      },
    },
    { key: 'request.numberPrefix', value: 'AID' },
  ];
  for (const s of settings) {
    await db.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never },
      create: { key: s.key, value: s.value as never },
    });
  }

  // تطبيع أسماء أي مستفيدين موجودين (يفيد بعد ترحيل Excel)
  const stale = await db.beneficiary.findMany({
    where: { nameNormalized: '' },
    select: { id: true, fullName: true },
  });
  for (const b of stale) {
    await db.beneficiary.update({
      where: { id: b.id },
      data: { nameNormalized: normalizeArabic(b.fullName) },
    });
  }

  console.log('\n✓ اكتملت التعبئة الأولية.');
  console.log(`  كلمة المرور الافتراضية لكل الحسابات: ${DEFAULT_PASSWORD}`);
  console.log('  غيّرها فورًا قبل التشغيل الحقيقي.');
}

main()
  .catch((e) => {
    console.error('✗ فشلت التعبئة الأولية:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
