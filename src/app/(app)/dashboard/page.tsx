import type { Metadata } from 'next';
import Link from 'next/link';
import { RequestStatus } from '@prisma/client';
import { AlertIcon } from '@primer/octicons-react';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { StatusLabel } from '@/components/ui/label';
import { MonthlyRequestsChart, ProgramChart } from '@/components/dashboard/charts';
import { RankList } from '@/components/dashboard/rank-list';
import { ExportButton } from '@/components/ui/export-button';
import { db, notDeleted } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { formatDate, formatDurationDays } from '@/lib/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/workflow';
import {
  averageCompletionDays,
  belowReorder,
  byCityDistrict,
  byProgram,
  requestsByMonth,
  topItems,
} from '@/server/reports';

export const metadata: Metadata = { title: 'لوحة المعلومات' };
export const dynamic = 'force-dynamic';

/**
 * لوحة المعلومات.
 *
 * المؤشرات صفوف كثيفة لا بطاقات ضخمة: رقم واحد لا يستحق بطاقة بحشو كبير،
 * والهدف أن تُقرأ الصورة كاملة في شاشة واحدة كما تُقرأ صفحة Issues في GitHub.
 */

type Metric = { label: string; value: string | number; href?: string };

async function loadMetrics(): Promise<Metric[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [today, screening, inWarehouse, readyToIssue, avgDays] = await Promise.all([
    db.request.count({ where: { ...notDeleted, createdAt: { gte: startOfToday } } }),
    db.request.count({
      where: { ...notDeleted, status: { in: [RequestStatus.submitted, RequestStatus.screening] } },
    }),
    db.request.count({ where: { ...notDeleted, status: RequestStatus.warehouse } }),
    db.request.count({ where: { ...notDeleted, status: RequestStatus.ready_to_issue } }),
    averageCompletionDays({ from: null, to: null }),
  ]);

  return [
    { label: 'طلبات اليوم', value: today, href: '/requests' },
    { label: 'قيد الفرز', value: screening, href: `/requests?status=${RequestStatus.screening}` },
    {
      label: 'عالقة في المستودع',
      value: inWarehouse,
      href: `/requests?status=${RequestStatus.warehouse}`,
    },
    {
      label: 'جاهزة للصرف',
      value: readyToIssue,
      href: `/requests?status=${RequestStatus.ready_to_issue}`,
    },
    {
      label: 'متوسط زمن الإنجاز',
      value: formatDurationDays(avgDays),
    },
  ];
}

export default async function DashboardPage() {
  const user = await requireUser();
  const period = { from: null, to: null };

  const [metrics, months, programs, cities, items, lowStock, recent] = await Promise.all([
    loadMetrics(),
    requestsByMonth(period),
    byProgram(period),
    byCityDistrict(period),
    topItems(period, 10),
    belowReorder(),
    db.request.findMany({
      where: notDeleted,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        requestNo: true,
        status: true,
        createdAt: true,
        beneficiary: { select: { fullName: true } },
      },
    }),
  ]);

  // المدن تُجمَّع من مستوى الحي إلى مستوى المدينة لعرض اللوحة.
  const cityTotals = new Map<string, number>();
  for (const row of cities) {
    cityTotals.set(row.city, (cityTotals.get(row.city) ?? 0) + row.total);
  }
  const topCities = [...cityTotals.entries()]
    .map(([city, total]) => ({ key: city, label: city, value: total }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="لوحة المعلومات"
        description={`أهلًا ${user.name}. هذه صورة حالة الطلبات الآن.`}
        actions={
          can(user.role, 'report:export') ? (
            <ExportButton kind="monthly" label="تصدير التقرير الشامل" />
          ) : null
        }
      />

      <Box>
        <BoxHeader>
          <BoxTitle>المؤشرات</BoxTitle>
        </BoxHeader>
        <div className="grid divide-y divide-[var(--borderColor-default)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5">
          {metrics.map((metric) =>
            metric.href ? (
              <Link
                key={metric.label}
                href={metric.href}
                className="flex items-baseline justify-between gap-2 px-2 py-1 hover:bg-canvas-subtle"
              >
                <span className="text-sm text-fg">{metric.label}</span>
                <span className="tnum text-sm font-semibold text-fg">{metric.value}</span>
              </Link>
            ) : (
              <div
                key={metric.label}
                className="flex items-baseline justify-between gap-2 px-2 py-1"
              >
                <span className="text-sm text-fg">{metric.label}</span>
                <span className="tnum text-sm font-semibold text-fg">{metric.value}</span>
              </div>
            ),
          )}
        </div>
      </Box>

      <div className="grid gap-2 lg:grid-cols-2">
        <Box>
          <BoxHeader>
            <BoxTitle>الطلبات شهريًا</BoxTitle>
          </BoxHeader>
          {months.length === 0 ? (
            <EmptyState title="لا توجد طلبات بعد" />
          ) : (
            <MonthlyRequestsChart data={months} />
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>التوزيع حسب البرنامج</BoxTitle>
          </BoxHeader>
          {programs.length === 0 ? (
            <EmptyState title="لا توجد بيانات" />
          ) : (
            <ProgramChart data={programs.map((p) => ({ program: p.program, requests: p.requests }))} />
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>التوزيع حسب المدينة</BoxTitle>
          </BoxHeader>
          <RankList rows={topCities} unitLabel="طلب" />
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>أعلى 10 أصناف استهلاكًا</BoxTitle>
          </BoxHeader>
          <RankList
            rows={items.map((i) => ({
              key: i.key,
              label: i.item,
              sublabel: i.size ?? undefined,
              value: i.quantity,
            }))}
            unitLabel="وحدة"
            emptyLabel="لم يُصرف أي صنف بعد"
          />
        </Box>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Box>
          <BoxHeader>
            <BoxTitle>
              {lowStock.length > 0 ? (
                <span className="flex items-center gap-0.5">
                  <AlertIcon size={16} className="text-fg-attention" />
                  الأصناف تحت حد إعادة الطلب
                  <span className="tnum font-normal text-fg-muted">({lowStock.length})</span>
                </span>
              ) : (
                'الأصناف تحت حد إعادة الطلب'
              )}
            </BoxTitle>
            {can(user.role, 'report:export') && lowStock.length > 0 ? (
              <ExportButton kind="reorder" label="تصدير" size="sm" />
            ) : null}
          </BoxHeader>

          {lowStock.length === 0 ? (
            <EmptyState
              title="كل الأصناف فوق حد إعادة الطلب"
              description="لا حاجة لطلب شراء وقائي الآن."
            />
          ) : (
            <ul className="divide-y divide-[var(--borderColor-default)]">
              {lowStock.slice(0, 10).map((row) => (
                <li
                  key={`${row.item}-${row.size ?? ''}`}
                  className="flex items-center justify-between gap-2 px-2 py-1 text-sm"
                >
                  <span className="min-w-0 truncate text-fg">
                    {row.item}
                    {row.size ? <span className="tnum text-fg-muted"> · {row.size}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    المتاح <span className="tnum font-semibold text-fg-attention">{row.available}</span>
                    {' / حد '}
                    <span className="tnum">{row.reorderLevel}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>أحدث الطلبات</BoxTitle>
            <Link href="/requests" className="text-xs text-fg-link hover:underline">
              عرض الكل
            </Link>
          </BoxHeader>

          {recent.length === 0 ? (
            <EmptyState title="لا توجد طلبات بعد" />
          ) : (
            <ul className="divide-y divide-[var(--borderColor-default)]">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 text-sm hover:bg-canvas-subtle"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="tnum text-xs text-fg-muted">{r.requestNo}</span>
                      <span className="truncate text-fg">{r.beneficiary.fullName}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="tnum text-xs text-fg-muted">{formatDate(r.createdAt)}</span>
                      <StatusLabel tone={STATUS_TONES[r.status]}>
                        {STATUS_LABELS[r.status]}
                      </StatusLabel>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </div>
  );
}
