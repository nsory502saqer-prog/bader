import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from '@primer/octicons-react';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/ui/export-button';
import { RequestFilters } from '@/components/requests/request-filters';
import { RequestTable } from '@/components/requests/request-table';
import { SavedViews, type SavedViewRow } from '@/components/requests/saved-views';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { requestFilterSchema } from '@/lib/validation/request';
import { getRequestFilterOptions, listRequests } from '@/server/requests';

export const metadata: Metadata = { title: 'الطلبات' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('request:read');
  const raw = await searchParams;

  // الفلاتر تأتي من الـURL، فتُنظَّف بنفس مخطط Zod قبل أن تلمس قاعدة البيانات.
  const parsed = requestFilterSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : requestFilterSchema.parse({});

  const [{ rows, total, page, pageSize }, options, savedViews] = await Promise.all([
    listRequests(filters),
    getRequestFilterOptions(),
    // عروض الموظف نفسه، ومعها ما شاركه غيره.
    db.savedView.findMany({
      where: { OR: [{ userId: user.id }, { isShared: true }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, filters: true, isShared: true, userId: true },
    }),
  ]);

  const views: SavedViewRow[] = savedViews.map((view) => ({
    id: view.id,
    name: view.name,
    filters: (view.filters ?? {}) as Record<string, string>,
    isShared: view.isShared,
    isMine: view.userId === user.id,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFullId = can(user.role, 'beneficiary:read_full_id');

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="الطلبات"
        description="كل طلبات الإعانة في مكان واحد، بفلاتر تعيش في الرابط فيمكن حفظه ومشاركته."
        actions={
          <>
            {/* التصدير متاح لكل دور — بدونه يعود الموظفون لملفاتهم الجانبية. */}
            <ExportButton kind="requests" />
            {can(user.role, 'request:create') ? (
              <Link href="/requests/new">
                <Button variant="primary" leadingIcon={<PlusIcon size={16} />}>
                  طلب جديد
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            النتائج <span className="tnum font-normal text-fg-muted">({total})</span>
          </BoxTitle>
        </BoxHeader>

        <div className="flex flex-col gap-2 border-b border-border p-2">
          <RequestFilters options={options} />
          <div className="border-t border-border pt-1">
            <SavedViews views={views} />
          </div>
        </div>

        <RequestTable
          rows={rows}
          showFullId={showFullId}
          emptyTitle="لا توجد طلبات مطابقة"
          emptyDescription="جرّب توسيع الفلاتر أو مسحها."
        />

        {totalPages > 1 ? (
          <nav
            aria-label="ترقيم الصفحات"
            className="flex items-center justify-between gap-1 px-2 py-1 text-xs"
          >
            <span className="text-fg-muted">
              صفحة <span className="tnum">{page}</span> من <span className="tnum">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <PageLink raw={raw} page={page - 1} disabled={page <= 1}>
                السابق
              </PageLink>
              <PageLink raw={raw} page={page + 1} disabled={page >= totalPages}>
                التالي
              </PageLink>
            </div>
          </nav>
        ) : null}
      </Box>
    </div>
  );
}

function PageLink({
  raw,
  page,
  disabled,
  children,
}: {
  raw: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded border border-border px-1 py-0.5 text-fg-disabled">{children}</span>
    );
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'page') continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) search.set(key, v);
  }
  search.set('page', String(page));

  return (
    <Link
      href={`/requests?${search.toString()}`}
      className="rounded border border-border px-1 py-0.5 text-fg hover:bg-canvas-subtle"
    >
      {children}
    </Link>
  );
}
