import type { Metadata } from 'next';
import Link from 'next/link';
import { Box, BoxHeader, BoxTitle, EmptyState, Flash, PageHeader } from '@/components/ui/surface';
import { StockTable } from '@/components/inventory/stock-table';
import { ExportButton } from '@/components/ui/export-button';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { db, notDeleted } from '@/lib/db';
import { listStock } from '@/server/inventory';

export const metadata: Metadata = { title: 'المستودع' };
export const dynamic = 'force-dynamic';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('inventory:read');
  const params = await searchParams;

  const q = one(params['q']);
  const programIdRaw = one(params['programId']);
  const onlyBelow = one(params['below']) === '1';

  const [rows, programs] = await Promise.all([
    listStock({
      q,
      programId: programIdRaw ? Number(programIdRaw) : null,
      onlyBelowReorder: onlyBelow,
    }),
    db.program.findMany({
      where: { ...notDeleted, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const belowCount = rows.filter((r) => r.belowReorder).length;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="المستودع"
        description="الرصيد هو ما في الرفوف، والمحجوز مخصَّص لطلبات قائمة. العبرة بالمتاح."
        actions={
          <>
            <ExportButton kind="inventory" />
            <Link href="/inventory/movements">
            <span className="inline-flex h-[32px] items-center rounded border border-border bg-canvas-subtle px-2 text-sm font-semibold text-fg">
              سجل الحركة
            </span>
            </Link>
          </>
        }
      />

      {belowCount > 0 && !onlyBelow ? (
        <Flash tone="attention">
          <span className="tnum">{belowCount}</span> صنفًا وصل حد إعادة الطلب أو نزل تحته.{' '}
          <Link href="/inventory?below=1" className="text-fg-link underline">
            اعرضها وحدها
          </Link>
        </Flash>
      ) : null}

      <Box>
        <BoxHeader>
          <BoxTitle>
            الأرصدة <span className="tnum font-normal text-fg-muted">({rows.length})</span>
          </BoxTitle>
        </BoxHeader>

        <form className="flex flex-wrap items-end gap-1 border-b border-border p-2">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="inv-q" className="mb-0.5 block text-xs font-semibold text-fg">
              بحث في الأصناف
            </label>
            <input
              id="inv-q"
              name="q"
              defaultValue={q}
              className="h-[32px] w-full rounded border border-border bg-canvas px-1 text-sm text-fg"
            />
          </div>

          <div className="min-w-[160px]">
            <label htmlFor="inv-program" className="mb-0.5 block text-xs font-semibold text-fg">
              البرنامج
            </label>
            <select
              id="inv-program"
              name="programId"
              defaultValue={programIdRaw}
              className="h-[32px] w-full rounded border border-border bg-canvas px-1 text-sm text-fg"
            >
              <option value="">كل البرامج</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex h-[32px] items-center gap-0.5 text-sm text-fg">
            <input type="checkbox" name="below" value="1" defaultChecked={onlyBelow} />
            تحت حد إعادة الطلب فقط
          </label>

          <button
            type="submit"
            className="h-[32px] rounded border border-border bg-canvas-subtle px-2 text-sm font-semibold text-fg"
          >
            تطبيق
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            title="لا توجد أصناف مطابقة"
            description="جرّب توسيع البحث أو إزالة الفلاتر."
          />
        ) : (
          <StockTable rows={rows} canEdit={can(user.role, 'inventory:update')} />
        )}
      </Box>
    </div>
  );
}
