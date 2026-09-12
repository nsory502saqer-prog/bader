import type { Metadata } from 'next';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { RequestTable } from '@/components/requests/request-table';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { ROLE_LABELS, STATUS_LABELS, inboxStatusesFor } from '@/lib/workflow';
import { listMyTasks } from '@/server/requests';
import { getSlaDays } from '@/server/settings';

export const metadata: Metadata = { title: 'صندوق مهامي' };
export const dynamic = 'force-dynamic';

/**
 * صندوق مهامي.
 * يعرض فقط الطلبات التي دور هذا الموظف عليها الآن، مرتّبة بالأقدم أولًا،
 * والمتأخر عن مدة الإنجاز المستهدفة مميَّز بلون مختلف.
 */
export default async function MyTasksPage() {
  const user = await requirePermission('request:read');
  const [rows, slaDays] = await Promise.all([listMyTasks(user.role), getSlaDays()]);
  const statuses = inboxStatusesFor(user.role);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="صندوق مهامي"
        description={`الطلبات التي تنتظر دور «${ROLE_LABELS[user.role]}» الآن، الأقدم أولًا.`}
        meta={
          statuses.length > 0 ? (
            <span className="text-xs text-fg-muted">
              المراحل: {statuses.map((s) => STATUS_LABELS[s]).join(' · ')}
            </span>
          ) : null
        }
      />

      <Box>
        <BoxHeader>
          <BoxTitle>
            بانتظارك <span className="tnum font-normal text-fg-muted">({rows.length})</span>
          </BoxTitle>
        </BoxHeader>

        <RequestTable
          rows={rows}
          showFullId={can(user.role, 'beneficiary:read_full_id')}
          highlightOverdue
          slaDays={slaDays}
          emptyTitle="لا يوجد ما ينتظرك"
          emptyDescription="كل الطلبات في مراحل يتولّاها زملاؤك."
        />
      </Box>
    </div>
  );
}
