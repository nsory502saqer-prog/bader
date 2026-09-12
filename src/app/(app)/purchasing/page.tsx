import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { PurchasingBoard } from '@/components/purchasing/purchasing-board';
import { QuotationsPanel } from '@/components/purchasing/quotations-panel';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import {
  listPurchaseDemand,
  listPurchaseOrders,
  listQuotations,
  listSuppliers,
} from '@/server/inventory';
import { getCatalog } from '@/server/requests';

export const metadata: Metadata = { title: 'المشتريات' };
export const dynamic = 'force-dynamic';

export default async function PurchasingPage() {
  const user = await requirePermission('purchasing:read');

  const [demand, orders, suppliers, quotations, catalog] = await Promise.all([
    listPurchaseDemand(),
    listPurchaseOrders(),
    listSuppliers(),
    listQuotations(),
    getCatalog(),
  ]);

  const canManage = can(user.role, 'purchasing:manage');

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="المشتريات"
        description="البنود التي لم يجدها المستودع تتجمّع هنا تلقائيًا. الاستلام يدخل المخزون في نفس اللحظة."
      />

      <PurchasingBoard
        demand={demand}
        orders={orders}
        suppliers={suppliers}
        canManage={canManage}
      />

      <QuotationsPanel
        quotations={quotations}
        suppliers={suppliers}
        catalog={catalog}
        canManage={canManage}
      />
    </div>
  );
}
