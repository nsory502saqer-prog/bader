import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { PurchasingBoard } from '@/components/purchasing/purchasing-board';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { listPurchaseDemand, listPurchaseOrders, listSuppliers } from '@/server/inventory';

export const metadata: Metadata = { title: 'المشتريات' };
export const dynamic = 'force-dynamic';

export default async function PurchasingPage() {
  const user = await requirePermission('purchasing:read');

  const [demand, orders, suppliers] = await Promise.all([
    listPurchaseDemand(),
    listPurchaseOrders(),
    listSuppliers(),
  ]);

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
        canManage={can(user.role, 'purchasing:manage')}
      />
    </div>
  );
}
