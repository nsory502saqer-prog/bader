import type { Metadata } from 'next';
import Link from 'next/link';
import { Box, BoxHeader, BoxTitle, PageHeader } from '@/components/ui/surface';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'الإدارة' };
export const dynamic = 'force-dynamic';

const SECTIONS: { href: string; title: string; description: string; ready: boolean }[] = [
  {
    href: '/admin/users',
    title: 'المستخدمون والأدوار',
    description: 'إنشاء الحسابات وتغيير الأدوار وتعطيلها.',
    ready: true,
  },
  {
    href: '/admin/audit',
    title: 'سجل التدقيق',
    description: 'كل تعديل في النظام بقيمه قبل وبعد.',
    ready: true,
  },
  {
    href: '/admin/notifications',
    title: 'سجل الإشعارات',
    description: 'كل رسالة صادرة من النظام وهل وصلت.',
    ready: true,
  },
  {
    href: '/admin/catalog',
    title: 'الكتالوج والقوائم المرجعية',
    description: 'البرامج والأصناف والمدن والأحياء ومصادر الدخل.',
    ready: true,
  },
  {
    href: '/admin/settings',
    title: 'الإعدادات العامة',
    description: 'اسم الجمعية والشعار ومدد الإنجاز المستهدفة.',
    ready: true,
  },
];

export default async function AdminPage() {
  await requirePermission('admin:users');

  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="الإدارة" />

      <Box>
        <BoxHeader>
          <BoxTitle>الأقسام</BoxTitle>
        </BoxHeader>
        <ul className="divide-y divide-[var(--borderColor-default)]">
          {SECTIONS.map((section) =>
            section.ready ? (
              <li key={section.href}>
                <Link href={section.href} className="block px-2 py-1 hover:bg-canvas-subtle">
                  <span className="text-sm font-semibold text-fg-link">{section.title}</span>
                  <span className="block text-xs text-fg-muted">{section.description}</span>
                </Link>
              </li>
            ) : (
              <li key={section.href} className="px-2 py-1">
                <span className="text-sm font-semibold text-fg-muted">{section.title}</span>
                <span className="block text-xs text-fg-muted">
                  {section.description} — يصل في مرحلة لاحقة.
                </span>
              </li>
            ),
          )}
        </ul>
      </Box>
    </div>
  );
}
