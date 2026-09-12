import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { OrgLogo } from '@/components/ui/org-logo';
import { getCurrentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { formatDate, formatDateTime } from '@/lib/format';
import { getDisbursementOrder, getOrgSettings } from '@/server/disbursements';
import { PrintTrigger } from './print-trigger';

export const metadata: Metadata = { title: 'أمر صرف — للطباعة' };
export const dynamic = 'force-dynamic';

/**
 * أمر الصرف للطباعة.
 *
 * تُبنى الصفحة خارج تخطيط التطبيق (بلا ترويسة ولا تنقّل) وبأنماط مطبوعة
 * مستقلة، ويحفظها الموظف PDF عبر «طباعة إلى PDF» في المتصفح.
 *
 * لماذا لا مكتبة PDF على الخادم؟ توليد PDF عربي من مكتبات JavaScript يكسر
 * تشكيل الحروف واتجاه النص (`@react-pdf/renderer` لا يصل الحروف العربية).
 * محرّك المتصفح نفسه يرسم العربية رسمًا صحيحًا، والمخرَج PDF حقيقي بنفس
 * الجودة وبلا اعتماد إضافي على الخادم.
 */
export default async function DisbursementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!can(user.role, 'disbursement:read')) redirect('/403');

  const { id } = await params;
  const [order, org] = await Promise.all([getDisbursementOrder(id), getOrgSettings()]);
  if (!order) notFound();

  // رمز QR يحمل رقم الأمر ورقم الطلب والهوية، فيُتحقق من الورقة دون نظام.
  const qrPayload = [
    `أمر صرف: ${order.orderNo}`,
    `طلب: ${order.request.requestNo}`,
    `هوية: ${order.request.beneficiary.nationalId}`,
    `تاريخ: ${formatDate(order.issuedAt)}`,
  ].join('\n');

  const qrSvg = await QRCode.toString(qrPayload, {
    type: 'svg',
    margin: 0,
    width: 96,
    errorCorrectionLevel: 'M',
  });

  const lines = order.request.items.filter((i) => i.itemStatus !== 'cancelled');

  return (
    <>
      <PrintTrigger />

      <main className="sheet">
        <header className="head">
          <div className="brand">
            {/* الشعار هو الصورة الزخرفية الوحيدة في الوثيقة، ويغيب بصمت
                إن لم يُرفع فتبقى الترويسة نصية سليمة. */}
            <OrgLogo size={56} />
            <div>
              <h1 className="org">{org.name}</h1>
              <p className="region">{org.region}</p>
            </div>
          </div>

          <div className="qr" aria-label="رمز التحقق" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </header>

        <h2 className="title">أمر صرف عيني</h2>

        <section className="meta">
          <div>
            <span className="k">رقم أمر الصرف</span>
            <span className="v mono">{order.orderNo}</span>
          </div>
          <div>
            <span className="k">رقم الطلب</span>
            <span className="v mono">{order.request.requestNo}</span>
          </div>
          <div>
            <span className="k">تاريخ الإصدار</span>
            <span className="v mono">{formatDateTime(order.issuedAt)}</span>
          </div>
          <div>
            <span className="k">أصدره</span>
            <span className="v">{order.issuedBy.name}</span>
          </div>
        </section>

        <section className="meta">
          <div>
            <span className="k">اسم المستفيد</span>
            <span className="v">{order.request.beneficiary.fullName}</span>
          </div>
          <div>
            <span className="k">رقم الهوية</span>
            <span className="v mono">{order.request.beneficiary.nationalId}</span>
          </div>
          <div>
            <span className="k">الجوال</span>
            <span className="v mono">{order.request.beneficiary.phone ?? '—'}</span>
          </div>
          <div>
            <span className="k">العنوان</span>
            <span className="v">
              {order.request.beneficiary.city?.name ?? '—'}
              {order.request.beneficiary.district
                ? ` · ${order.request.beneficiary.district.name}`
                : ''}
            </span>
          </div>
        </section>

        <table className="items">
          <thead>
            <tr>
              <th style={{ width: '32px' }}>م</th>
              <th>الصنف</th>
              <th>البرنامج</th>
              <th style={{ width: '64px' }}>المقاس</th>
              <th style={{ width: '72px' }}>الكمية</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item, index) => (
              <tr key={item.id}>
                <td className="mono">{index + 1}</td>
                <td>{item.item?.name ?? item.legacyText ?? 'صنف غير مطابَق'}</td>
                <td>{item.item?.program.name ?? '—'}</td>
                <td className="mono">{item.size ?? '—'}</td>
                <td className="mono">
                  {item.fulfilledQty > 0 ? item.fulfilledQty : item.quantity} {item.item?.unit ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="sign">
          <div className="box">
            <p className="k">اسم المستلم</p>
            <p className="line">{order.receivedByName ?? ''}</p>
          </div>
          <div className="box">
            <p className="k">التوقيع</p>
            <p className="line" />
          </div>
          <div className="box">
            <p className="k">تاريخ الاستلام</p>
            <p className="line mono">
              {order.deliveredAt ? formatDate(order.deliveredAt) : ''}
            </p>
          </div>
        </section>

        <footer className="foot">
          <p>
            هذه الوثيقة صادرة من نظام إدارة طلبات الإعانات في {org.name}. يمكن التحقق من صحتها
            بمطابقة رقم أمر الصرف في النظام أو بمسح رمز التحقق أعلاه.
          </p>
        </footer>
      </main>

      <style>{`
        :root { color-scheme: light; }
        body { background: #fff; color: #1f2328; }

        .sheet {
          max-width: 780px;
          margin: 0 auto;
          padding: 24px;
          font-size: 14px;
          line-height: 1.5;
        }

        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid #d1d9e0;
          padding-bottom: 16px;
        }
        .brand { display: flex; align-items: center; gap: 16px; }
        .org { font-size: 20px; font-weight: 600; margin: 0; }
        .region { font-size: 12px; color: #59636e; margin: 4px 0 0; }
        .qr { width: 96px; height: 96px; flex: none; }
        .qr svg { width: 100%; height: 100%; display: block; }

        .title {
          font-size: 16px;
          font-weight: 600;
          margin: 16px 0;
          text-align: center;
          border: 1px solid #d1d9e0;
          border-radius: 6px;
          padding: 8px;
          background: #f6f8fa;
        }

        .meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 16px;
          border: 1px solid #d1d9e0;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .meta .k { display: block; font-size: 12px; color: #59636e; }
        .meta .v { display: block; font-size: 14px; }

        .items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .items th, .items td {
          border: 1px solid #d1d9e0;
          padding: 8px;
          text-align: start;
          font-size: 14px;
        }
        .items th { background: #f6f8fa; font-size: 12px; font-weight: 600; color: #59636e; }

        .sign { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .sign .box { border: 1px solid #d1d9e0; border-radius: 6px; padding: 8px; }
        .sign .k { font-size: 12px; color: #59636e; margin: 0 0 24px; }
        .sign .line { border-top: 1px solid #d1d9e0; margin: 0; padding-top: 8px; min-height: 24px; }

        .foot {
          margin-top: 24px;
          border-top: 1px solid #d1d9e0;
          padding-top: 8px;
          font-size: 12px;
          color: #59636e;
        }
        .foot p { margin: 0; }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          direction: ltr;
          unicode-bidi: isolate;
        }

        @media print {
          @page { size: A4; margin: 12mm; }
          .sheet { max-width: none; padding: 0; }
        }
      `}</style>
    </>
  );
}
