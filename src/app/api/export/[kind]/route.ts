import { NextResponse } from 'next/server';
import { db, notDeleted } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getCurrentUser } from '@/lib/session';
import { maskNationalId } from '@/lib/arabic';
import { recordAudit } from '@/lib/audit';
import { STATUS_LABELS, ROLE_LABELS } from '@/lib/workflow';
import { buildWorkbook, excelHeaders, type Column } from '@/server/excel';
import { requestFilterSchema } from '@/lib/validation/request';
import { buildRequestWhere } from '@/server/requests';
import { searchBeneficiaries } from '@/server/beneficiaries';
import { listStock, listStockMovements } from '@/server/inventory';
import { listDisbursementOrders } from '@/server/disbursements';
import {
  averageCompletionDays,
  byCityDistrict,
  byProgram,
  byStatus,
  demographics,
  belowReorder,
  repeatBeneficiaries,
  requestsByMonth,
  stageDurations,
  topItems,
  type Period,
} from '@/server/reports';

export const runtime = 'nodejs';

/**
 * التصدير إلى Excel — نقطة واحدة لكل القوائم والتقارير.
 *
 * الصلاحية تُفحص هنا لا في الواجهة، وكل تصدير يُسجَّل في سجل التدقيق: الملف
 * يخرج من النظام حاملًا بيانات هويات وحالات صحية، فيجب أن يُعرف من أخرجه ومتى.
 */

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_stock: 'متوفر بالمستودع',
  to_purchase: 'يحتاج شراء',
  issued: 'صُرف',
  cancelled: 'ملغي',
};

function readPeriod(url: URL): Period {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return {
    from: from ? new Date(from) : null,
    to: to ? new Date(to) : null,
  };
}

function periodNote(period: Period): string {
  if (!period.from && !period.to) return 'الفترة: كل السجلات';
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
  return `الفترة: من ${fmt(period.from)} إلى ${fmt(period.to)}`;
}

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('غير مصرّح', { status: 401 });
  if (!can(user.role, 'report:export')) return new NextResponse('ممنوع', { status: 403 });

  const { kind } = await context.params;
  const url = new URL(request.url);
  const period = readPeriod(url);
  const showFullId = can(user.role, 'beneficiary:read_full_id');
  const id = (value: string) => (showFullId ? value : maskNationalId(value));

  try {
    const result = await build(kind, { url, period, id, role: user.role });
    if (!result) return new NextResponse('نوع تصدير غير معروف', { status: 404 });

    await recordAudit({
      userId: user.id,
      action: 'export',
      modelType: 'Export',
      modelId: kind,
      newValues: { filters: Object.fromEntries(url.searchParams) },
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: excelHeaders(result.filename),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع';
    return new NextResponse(`تعذّر إنشاء الملف: ${message}`, { status: 500 });
  }
}

type BuildContext = {
  url: URL;
  period: Period;
  id: (value: string) => string;
  role: import('@prisma/client').Role;
};

async function build(
  kind: string,
  ctx: BuildContext,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const generatedBy = ROLE_LABELS[ctx.role];
  const note = periodNote(ctx.period);

  switch (kind) {
    // ── القوائم ──

    case 'requests': {
      const parsed = requestFilterSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
      const filters = parsed.success ? parsed.data : requestFilterSchema.parse({});
      const where = await buildRequestWhere(filters);

      const rows = await db.request.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        // سقف يحمي الذاكرة من تصدير غير محدود بلا أن يقطع الاستعمال الواقعي.
        take: 20_000,
        select: {
          requestNo: true,
          status: true,
          priority: true,
          createdAt: true,
          submittedAt: true,
          closedAt: true,
          beneficiary: {
            select: {
              fullName: true,
              nationalId: true,
              gender: true,
              phone: true,
              city: { select: { name: true } },
              district: { select: { name: true } },
              incomeSource: { select: { name: true } },
            },
          },
          assignedTo: { select: { name: true } },
          createdBy: { select: { name: true } },
          items: {
            where: notDeleted,
            select: {
              quantity: true,
              size: true,
              itemStatus: true,
              legacyText: true,
              item: { select: { name: true, program: { select: { name: true } } } },
            },
          },
        },
      });

      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'رقم الطلب', width: 16, asText: true, value: (r) => r.requestNo },
        { header: 'الحالة', width: 18, value: (r) => STATUS_LABELS[r.status] },
        { header: 'الأولوية', width: 10, value: (r) => (r.priority === 'urgent' ? 'عاجل' : 'عادي') },
        { header: 'اسم المستفيد', width: 32, value: (r) => r.beneficiary.fullName },
        { header: 'رقم الهوية', width: 14, asText: true, value: (r) => ctx.id(r.beneficiary.nationalId) },
        { header: 'الجنس', width: 8, value: (r) => (r.beneficiary.gender === 'male' ? 'ذكر' : 'أنثى') },
        { header: 'الجوال', width: 14, asText: true, value: (r) => r.beneficiary.phone },
        { header: 'المدينة', width: 14, value: (r) => r.beneficiary.city?.name ?? null },
        { header: 'الحي', width: 18, value: (r) => r.beneficiary.district?.name ?? null },
        { header: 'مصدر الدخل', width: 18, value: (r) => r.beneficiary.incomeSource?.name ?? null },
        {
          header: 'البرامج',
          width: 24,
          value: (r) =>
            [...new Set(r.items.map((i) => i.item?.program.name).filter(Boolean))].join(' · '),
        },
        {
          header: 'البنود',
          width: 48,
          value: (r) =>
            r.items
              .map((i) => {
                const name = i.item?.name ?? i.legacyText ?? 'صنف غير مطابَق';
                const size = i.size ? ` (${i.size})` : '';
                const qty = i.quantity > 1 ? ` ×${i.quantity}` : '';
                return `${name}${size}${qty}`;
              })
              .join(' ، '),
        },
        { header: 'عدد البنود', width: 10, value: (r) => r.items.length },
        { header: 'الموظف المسؤول', width: 18, value: (r) => r.assignedTo?.name ?? null },
        { header: 'أنشأه', width: 18, value: (r) => r.createdBy.name },
        { header: 'تاريخ الإنشاء', width: 14, value: (r) => r.createdAt },
        { header: 'تاريخ التقديم', width: 14, value: (r) => r.submittedAt },
        { header: 'تاريخ الإغلاق', width: 14, value: (r) => r.closedAt },
        {
          header: 'أيام الإنجاز',
          width: 12,
          value: (r) =>
            r.submittedAt && r.closedAt
              ? Number(((r.closedAt.getTime() - r.submittedAt.getTime()) / 86_400_000).toFixed(1))
              : null,
        },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'الطلبات', columns, rows, notes: [note, `العدد: ${rows.length}`] }],
        { title: 'قائمة الطلبات', generatedBy },
      );
      return { buffer, filename: 'الطلبات' };
    }

    case 'beneficiaries': {
      const { rows } = await searchBeneficiaries({
        q: ctx.url.searchParams.get('q') ?? '',
        cityId: ctx.url.searchParams.get('cityId')
          ? Number(ctx.url.searchParams.get('cityId'))
          : null,
        gender: (ctx.url.searchParams.get('gender') as 'male' | 'female' | null) ?? null,
        page: 1,
        pageSize: 100,
      });

      // التصدير يتجاوز ترقيم الصفحات: الموظف يريد القائمة كاملة لا صفحة منها.
      const all = await db.beneficiary.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: {
          nationalId: true,
          fullName: true,
          gender: true,
          birthDate: true,
          phone: true,
          createdAt: true,
          city: { select: { name: true } },
          district: { select: { name: true } },
          incomeSource: { select: { name: true } },
          _count: { select: { requests: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      type Row = (typeof all)[number];
      const columns: Column<Row>[] = [
        { header: 'رقم الهوية', width: 14, asText: true, value: (r) => ctx.id(r.nationalId) },
        { header: 'الاسم', width: 32, value: (r) => r.fullName },
        { header: 'الجنس', width: 8, value: (r) => (r.gender === 'male' ? 'ذكر' : 'أنثى') },
        { header: 'تاريخ الميلاد', width: 14, value: (r) => r.birthDate },
        { header: 'الجوال', width: 14, asText: true, value: (r) => r.phone },
        { header: 'المدينة', width: 14, value: (r) => r.city?.name ?? null },
        { header: 'الحي', width: 18, value: (r) => r.district?.name ?? null },
        { header: 'مصدر الدخل', width: 18, value: (r) => r.incomeSource?.name ?? null },
        { header: 'عدد الطلبات', width: 12, value: (r) => r._count.requests },
        { header: 'تاريخ التسجيل', width: 14, value: (r) => r.createdAt },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'المستفيدون', columns, rows: all, notes: [`العدد: ${all.length}`] }],
        { title: 'قائمة المستفيدين', generatedBy },
      );
      return { buffer, filename: 'المستفيدون' };
    }

    case 'inventory': {
      const rows = await listStock({});
      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'الصنف', width: 32, value: (r) => r.itemName },
        { header: 'البرنامج', width: 18, value: (r) => r.programName },
        { header: 'المقاس', width: 10, value: (r) => r.size },
        { header: 'الوحدة', width: 10, value: (r) => r.unit },
        { header: 'الرصيد', width: 10, value: (r) => r.onHand },
        { header: 'المحجوز', width: 10, value: (r) => r.reserved },
        { header: 'المتاح', width: 10, value: (r) => r.available },
        { header: 'حد إعادة الطلب', width: 14, value: (r) => r.reorderLevel },
        { header: 'تحت الحد؟', width: 12, value: (r) => (r.belowReorder ? 'نعم' : 'لا') },
      ];

      const movements = await listStockMovements(2000);
      type Move = (typeof movements)[number];
      const moveColumns: Column<Move>[] = [
        { header: 'الوقت', width: 18, value: (m) => m.createdAt },
        { header: 'الصنف', width: 32, value: (m) => m.item.name },
        { header: 'المقاس', width: 10, value: (m) => m.size },
        {
          header: 'النوع',
          width: 10,
          value: (m) => ({ in: 'وارد', out: 'صادر', adjust: 'تسوية' })[m.type],
        },
        { header: 'الكمية', width: 10, value: (m) => m.quantity },
        { header: 'المرجع', width: 20, value: (m) => m.referenceId ?? m.referenceType },
        { header: 'المستخدم', width: 18, value: (m) => m.user.name },
        { header: 'ملاحظة', width: 32, value: (m) => m.note },
      ];

      const buffer = await buildWorkbook(
        [
          { name: 'الأرصدة', columns, rows, notes: [`عدد الأصناف: ${rows.length}`] },
          { name: 'حركة المخزون', columns: moveColumns, rows: movements } as never,
        ] as never,
        { title: 'المستودع', generatedBy },
      );
      return { buffer, filename: 'المستودع' };
    }

    case 'disbursements': {
      const rows = await listDisbursementOrders();
      type Row = (typeof rows)[number];
      const labels = { issued: 'صادر', delivered: 'تم التسليم', cancelled: 'ملغي' } as const;

      const columns: Column<Row>[] = [
        { header: 'رقم أمر الصرف', width: 16, asText: true, value: (r) => r.orderNo },
        { header: 'رقم الطلب', width: 16, asText: true, value: (r) => r.request.requestNo },
        { header: 'المستفيد', width: 32, value: (r) => r.request.beneficiary.fullName },
        {
          header: 'رقم الهوية',
          width: 14,
          asText: true,
          value: (r) => ctx.id(r.request.beneficiary.nationalId),
        },
        { header: 'الحالة', width: 14, value: (r) => labels[r.status] },
        { header: 'تاريخ الإصدار', width: 14, value: (r) => r.issuedAt },
        { header: 'أصدره', width: 18, value: (r) => r.issuedBy.name },
        { header: 'تاريخ التسليم', width: 14, value: (r) => r.deliveredAt },
        { header: 'اسم المستلم', width: 28, value: (r) => r.receivedByName },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'أوامر الصرف', columns, rows, notes: [`العدد: ${rows.length}`] }],
        { title: 'أوامر الصرف', generatedBy },
      );
      return { buffer, filename: 'أوامر-الصرف' };
    }

    // ── التقارير ──

    case 'monthly': {
      const [months, programs, cities, statuses, demo, avg, stages] = await Promise.all([
        requestsByMonth(ctx.period),
        byProgram(ctx.period),
        byCityDistrict(ctx.period),
        byStatus(ctx.period),
        demographics(ctx.period),
        averageCompletionDays(ctx.period),
        stageDurations(ctx.period),
      ]);

      const buffer = await buildWorkbook(
        [
          {
            name: 'ملخص',
            columns: [
              { header: 'المؤشر', width: 32, value: (r: [string, string | number]) => r[0] },
              { header: 'القيمة', width: 22, value: (r: [string, string | number]) => r[1] },
            ],
            rows: [
              ['إجمالي الطلبات', months.reduce((s, m) => s + m.total, 0)],
              ['الطلبات المسلَّمة', months.reduce((s, m) => s + m.delivered, 0)],
              ['متوسط زمن الإنجاز (يوم)', avg === null ? '—' : Number(avg.toFixed(1))],
              ['ذكور', demo.gender.male],
              ['إناث', demo.gender.female],
            ] as [string, string | number][],
            notes: [note],
          },
          {
            name: 'شهريًا',
            columns: [
              { header: 'الشهر', width: 14, asText: true, value: (r: (typeof months)[number]) => r.month },
              { header: 'الطلبات', width: 12, value: (r: (typeof months)[number]) => r.total },
              { header: 'المسلَّمة', width: 12, value: (r: (typeof months)[number]) => r.delivered },
            ],
            rows: months,
          },
          {
            name: 'حسب البرنامج',
            columns: [
              { header: 'البرنامج', width: 22, value: (r: (typeof programs)[number]) => r.program },
              { header: 'الطلبات', width: 12, value: (r: (typeof programs)[number]) => r.requests },
              { header: 'البنود', width: 12, value: (r: (typeof programs)[number]) => r.items },
              { header: 'الكمية المطلوبة', width: 16, value: (r: (typeof programs)[number]) => r.quantity },
              { header: 'الكمية المصروفة', width: 16, value: (r: (typeof programs)[number]) => r.fulfilled },
            ],
            rows: programs,
          },
          {
            name: 'حسب المدينة والحي',
            columns: [
              { header: 'المدينة', width: 16, value: (r: (typeof cities)[number]) => r.city },
              { header: 'الحي', width: 22, value: (r: (typeof cities)[number]) => r.district },
              { header: 'الطلبات', width: 12, value: (r: (typeof cities)[number]) => r.total },
              { header: 'المسلَّمة', width: 12, value: (r: (typeof cities)[number]) => r.delivered },
            ],
            rows: cities,
          },
          {
            name: 'حسب الحالة',
            columns: [
              { header: 'الحالة', width: 22, value: (r: (typeof statuses)[number]) => r.label },
              { header: 'العدد', width: 12, value: (r: (typeof statuses)[number]) => r.count },
            ],
            rows: statuses,
          },
          {
            name: 'زمن كل مرحلة',
            columns: [
              { header: 'المرحلة', width: 22, value: (r: (typeof stages)[number]) => r.label },
              {
                header: 'متوسط الأيام',
                width: 14,
                value: (r: (typeof stages)[number]) => Number(r.averageDays.toFixed(1)),
              },
              { header: 'عدد القياسات', width: 14, value: (r: (typeof stages)[number]) => r.samples },
            ],
            rows: stages,
          },
          {
            name: 'مصادر الدخل',
            columns: [
              { header: 'مصدر الدخل', width: 22, value: (r: { name: string; count: number }) => r.name },
              { header: 'الطلبات', width: 12, value: (r: { name: string; count: number }) => r.count },
            ],
            rows: demo.income,
          },
        ] as never,
        { title: 'التقرير الشهري الشامل', generatedBy },
      );
      return { buffer, filename: 'التقرير-الشامل' };
    }

    case 'consumption': {
      const rows = await topItems(ctx.period, 500, true);
      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'الصنف', width: 32, value: (r) => r.item },
        { header: 'البرنامج', width: 18, value: (r) => r.program },
        { header: 'المقاس', width: 10, value: (r) => r.size },
        { header: 'الوحدة', width: 10, value: (r) => r.unit },
        { header: 'الكمية المصروفة', width: 16, value: (r) => r.quantity },
        { header: 'عدد مرات الصرف', width: 16, value: (r) => r.lines },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'استهلاك كفالة مريض', columns, rows, notes: [note] }],
        { title: 'استهلاك الأصناف الاستهلاكية', generatedBy },
      );
      return { buffer, filename: 'استهلاك-كفالة-مريض' };
    }

    case 'repeat': {
      const rows = await repeatBeneficiaries(ctx.period, 2, 1000);
      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'رقم الهوية', width: 14, asText: true, value: (r) => ctx.id(r.nationalId) },
        { header: 'الاسم', width: 32, value: (r) => r.fullName },
        { header: 'المدينة', width: 16, value: (r) => r.city },
        { header: 'عدد الطلبات', width: 12, value: (r) => r.requests },
        { header: 'المسلَّمة', width: 12, value: (r) => r.delivered },
        { header: 'أول طلب', width: 14, value: (r) => r.firstAt },
        { header: 'آخر طلب', width: 14, value: (r) => r.lastAt },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'المستفيدون المتكررون', columns, rows, notes: [note, `العدد: ${rows.length}`] }],
        { title: 'المستفيدون المتكررون', generatedBy },
      );
      return { buffer, filename: 'المستفيدون-المتكررون' };
    }

    case 'reorder': {
      const rows = await belowReorder();
      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'الصنف', width: 32, value: (r) => r.item },
        { header: 'البرنامج', width: 18, value: (r) => r.program },
        { header: 'المقاس', width: 10, value: (r) => r.size },
        { header: 'المتاح', width: 10, value: (r) => r.available },
        { header: 'حد إعادة الطلب', width: 14, value: (r) => r.reorderLevel },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'تحت حد إعادة الطلب', columns, rows }],
        { title: 'الأصناف تحت حد إعادة الطلب', generatedBy },
      );
      return { buffer, filename: 'تحت-حد-إعادة-الطلب' };
    }

    case 'items': {
      const rows = await db.requestItem.findMany({
        where: { ...notDeleted, request: { ...notDeleted } },
        take: 20_000,
        orderBy: { createdAt: 'desc' },
        select: {
          size: true,
          quantity: true,
          fulfilledQty: true,
          itemStatus: true,
          legacyText: true,
          note: true,
          item: { select: { name: true, unit: true, program: { select: { name: true } } } },
          request: {
            select: {
              requestNo: true,
              status: true,
              createdAt: true,
              beneficiary: { select: { fullName: true, nationalId: true, city: { select: { name: true } } } },
            },
          },
        },
      });

      type Row = (typeof rows)[number];
      const columns: Column<Row>[] = [
        { header: 'رقم الطلب', width: 16, asText: true, value: (r) => r.request.requestNo },
        { header: 'تاريخ الطلب', width: 14, value: (r) => r.request.createdAt },
        { header: 'حالة الطلب', width: 18, value: (r) => STATUS_LABELS[r.request.status] },
        { header: 'المستفيد', width: 32, value: (r) => r.request.beneficiary.fullName },
        {
          header: 'رقم الهوية',
          width: 14,
          asText: true,
          value: (r) => ctx.id(r.request.beneficiary.nationalId),
        },
        { header: 'المدينة', width: 14, value: (r) => r.request.beneficiary.city?.name ?? null },
        { header: 'البرنامج', width: 18, value: (r) => r.item?.program.name ?? null },
        { header: 'الصنف', width: 32, value: (r) => r.item?.name ?? 'غير مطابَق' },
        { header: 'المقاس', width: 10, value: (r) => r.size },
        { header: 'الكمية', width: 10, value: (r) => r.quantity },
        { header: 'المصروف', width: 10, value: (r) => r.fulfilledQty },
        { header: 'حالة البند', width: 16, value: (r) => ITEM_STATUS_LABELS[r.itemStatus] ?? r.itemStatus },
        { header: 'النص الأصلي (Excel)', width: 36, value: (r) => r.legacyText },
        { header: 'ملاحظة', width: 24, value: (r) => r.note },
      ];

      const buffer = await buildWorkbook(
        [{ name: 'بنود الطلبات', columns, rows, notes: [`العدد: ${rows.length}`] }],
        { title: 'بنود الطلبات', generatedBy },
      );
      return { buffer, filename: 'بنود-الطلبات' };
    }

    default:
      return null;
  }
}
