import type { Metadata } from 'next';
import { Box, BoxHeader, BoxTitle, EmptyState, PageHeader } from '@/components/ui/surface';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { ExportButton } from '@/components/ui/export-button';
import { PeriodFilter } from '@/components/reports/period-filter';
import { requirePermission } from '@/lib/session';
import { formatDate, formatDurationDays } from '@/lib/format';
import {
  averageCompletionDays,
  byCityDistrict,
  byProgram,
  byStatus,
  demographics,
  repeatBeneficiaries,
  requestsByMonth,
  stageDurations,
  topItems,
  type Period,
} from '@/server/reports';

export const metadata: Metadata = { title: 'التقارير' };
export const dynamic = 'force-dynamic';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** مؤشر واحد في صف كثيف — لا بطاقة ضخمة لرقم واحد. */
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-2 py-1">
      <span className="text-sm text-fg">{label}</span>
      <span className="tnum text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('report:read');
  const params = await searchParams;

  const fromRaw = one(params['from']);
  const toRaw = one(params['to']);
  const period: Period = {
    from: fromRaw ? new Date(fromRaw) : null,
    to: toRaw ? new Date(toRaw) : null,
  };

  const [months, programs, cities, statuses, consumables, repeats, stages, avg, demo] =
    await Promise.all([
      requestsByMonth(period),
      byProgram(period),
      byCityDistrict(period),
      byStatus(period),
      topItems(period, 20, true),
      repeatBeneficiaries(period, 2, 25),
      stageDurations(period),
      averageCompletionDays(period),
      demographics(period),
    ]);

  const totalRequests = months.reduce((sum, m) => sum + m.total, 0);
  const totalDelivered = months.reduce((sum, m) => sum + m.delivered, 0);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="التقارير"
        description="كل ما يلي مبنيّ على سجل الحالات وبنود الطلبات — وهي المعلومات التي كان استخراجها من ملف Excel مستحيلًا."
        actions={<ExportButton kind="monthly" label="تصدير التقرير الشامل" />}
      />

      <Box className="p-2">
        <PeriodFilter />
      </Box>

      <Box>
        <BoxHeader>
          <BoxTitle>الملخص</BoxTitle>
        </BoxHeader>
        <div className="grid divide-y divide-[var(--borderColor-default)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5">
          <Metric label="إجمالي الطلبات" value={totalRequests} />
          <Metric label="المسلَّمة" value={totalDelivered} />
          <Metric
            label="نسبة الإنجاز"
            value={totalRequests > 0 ? `${Math.round((totalDelivered / totalRequests) * 100)}%` : '—'}
          />
          <Metric
            label="متوسط زمن الإنجاز"
            value={formatDurationDays(avg)}
          />
          <Metric label="ذكور / إناث" value={`${demo.gender.male} / ${demo.gender.female}`} />
        </div>
      </Box>

      <div className="grid gap-2 lg:grid-cols-2">
        <Box>
          <BoxHeader>
            <BoxTitle>الطلبات شهريًا</BoxTitle>
            <ExportButton kind="monthly" label="تصدير" size="sm" />
          </BoxHeader>
          {months.length === 0 ? (
            <EmptyState title="لا توجد بيانات في هذه الفترة" />
          ) : (
            <TableContainer>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>الشهر</Th>
                    <Th textAlign="center">الطلبات</Th>
                    <Th textAlign="center">المسلَّمة</Th>
                    <Th textAlign="center">نسبة الإنجاز</Th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <Tr key={m.month}>
                      <Td className="tnum">{m.month}</Td>
                      <Td textAlign="center" className="tnum">
                        {m.total}
                      </Td>
                      <Td textAlign="center" className="tnum">
                        {m.delivered}
                      </Td>
                      <Td textAlign="center" className="tnum text-fg-muted">
                        {m.total > 0 ? `${Math.round((m.delivered / m.total) * 100)}%` : '—'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>حسب البرنامج</BoxTitle>
            <ExportButton kind="monthly" label="تصدير" size="sm" />
          </BoxHeader>
          {programs.length === 0 ? (
            <EmptyState title="لا توجد بيانات في هذه الفترة" />
          ) : (
            <TableContainer>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>البرنامج</Th>
                    <Th textAlign="center">الطلبات</Th>
                    <Th textAlign="center">البنود</Th>
                    <Th textAlign="center">المصروف</Th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <Tr key={p.programId}>
                      <Td>{p.program}</Td>
                      <Td textAlign="center" className="tnum">
                        {p.requests}
                      </Td>
                      <Td textAlign="center" className="tnum text-fg-muted">
                        {p.items}
                      </Td>
                      <Td textAlign="center" className="tnum">
                        {p.fulfilled}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>حسب المدينة والحي</BoxTitle>
            <ExportButton kind="monthly" label="تصدير" size="sm" />
          </BoxHeader>
          <TableContainer>
            <Table className="min-w-0">
              <thead>
                <tr>
                  <Th>المدينة</Th>
                  <Th>الحي</Th>
                  <Th textAlign="center">الطلبات</Th>
                  <Th textAlign="center">المسلَّمة</Th>
                </tr>
              </thead>
              <tbody>
                {cities.slice(0, 25).map((c) => (
                  <Tr key={`${c.city}-${c.district}`}>
                    <Td>{c.city}</Td>
                    <Td className="text-fg-muted">{c.district}</Td>
                    <Td textAlign="center" className="tnum">
                      {c.total}
                    </Td>
                    <Td textAlign="center" className="tnum text-fg-muted">
                      {c.delivered}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
          {cities.length > 25 ? (
            <p className="px-2 py-1 text-xs text-fg-muted">
              يُعرض أعلى 25 حيًّا. الملف المصدَّر يحوي الـ
              <span className="tnum">{cities.length}</span> كاملة.
            </p>
          ) : null}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>متوسط زمن كل مرحلة</BoxTitle>
            <ExportButton kind="monthly" label="تصدير" size="sm" />
          </BoxHeader>
          {stages.length === 0 ? (
            <EmptyState
              title="لا توجد قياسات بعد"
              description="يُحسب الزمن من الفروق بين قيود سجل الحالات، فيحتاج طلبًا انتقل بين مرحلتين على الأقل."
            />
          ) : (
            <TableContainer>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>المرحلة</Th>
                    <Th textAlign="center">متوسط الأيام</Th>
                    <Th textAlign="center">عدد القياسات</Th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s) => (
                    <Tr key={s.status}>
                      <Td>{s.label}</Td>
                      <Td textAlign="center" className="tnum font-semibold">
                        {s.averageDays.toFixed(1)}
                      </Td>
                      <Td textAlign="center" className="tnum text-fg-muted">
                        {s.samples}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>استهلاك أصناف كفالة مريض</BoxTitle>
            <ExportButton kind="consumption" label="تصدير" size="sm" />
          </BoxHeader>
          {consumables.length === 0 ? (
            <EmptyState title="لا يوجد استهلاك مسجَّل في هذه الفترة" />
          ) : (
            <TableContainer>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>الصنف</Th>
                    <Th>المقاس</Th>
                    <Th textAlign="center">الكمية</Th>
                    <Th textAlign="center">مرات الصرف</Th>
                  </tr>
                </thead>
                <tbody>
                  {consumables.map((c) => (
                    <Tr key={c.key}>
                      <Td>{c.item}</Td>
                      <Td className="tnum">{c.size ?? '—'}</Td>
                      <Td textAlign="center" className="tnum font-semibold">
                        {c.quantity} <span className="text-xs text-fg-muted">{c.unit}</span>
                      </Td>
                      <Td textAlign="center" className="tnum text-fg-muted">
                        {c.lines}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Box>
          <BoxHeader>
            <BoxTitle>المستفيدون المتكررون</BoxTitle>
            <ExportButton kind="repeat" label="تصدير" size="sm" />
          </BoxHeader>
          {repeats.length === 0 ? (
            <EmptyState title="لا يوجد مستفيد له أكثر من طلب في هذه الفترة" />
          ) : (
            <TableContainer>
              <Table className="min-w-0">
                <thead>
                  <tr>
                    <Th>الاسم</Th>
                    <Th>المدينة</Th>
                    <Th textAlign="center">الطلبات</Th>
                    <Th>آخر طلب</Th>
                  </tr>
                </thead>
                <tbody>
                  {repeats.map((b) => (
                    <Tr key={b.id}>
                      <Td>{b.fullName}</Td>
                      <Td className="text-fg-muted">{b.city}</Td>
                      <Td textAlign="center" className="tnum font-semibold">
                        {b.requests}
                      </Td>
                      <Td className="tnum text-fg-muted">{formatDate(b.lastAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </div>

      <Box>
        <BoxHeader>
          <BoxTitle>التوزيع حسب الحالة</BoxTitle>
        </BoxHeader>
        <TableContainer>
          <Table className="min-w-0">
            <thead>
              <tr>
                <Th>الحالة</Th>
                <Th textAlign="center">العدد</Th>
                <Th textAlign="center">النسبة</Th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => (
                <Tr key={s.status}>
                  <Td>{s.label}</Td>
                  <Td textAlign="center" className="tnum">
                    {s.count}
                  </Td>
                  <Td textAlign="center" className="tnum text-fg-muted">
                    {totalRequests > 0 ? `${Math.round((s.count / totalRequests) * 100)}%` : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Box>
    </div>
  );
}
