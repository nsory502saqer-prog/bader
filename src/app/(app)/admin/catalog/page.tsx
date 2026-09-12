import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/surface';
import { CatalogManager } from '@/components/admin/catalog-manager';
import { requirePermission } from '@/lib/session';
import { db, notDeleted } from '@/lib/db';

export const metadata: Metadata = { title: 'الكتالوج والقوائم المرجعية' };
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  await requirePermission('admin:catalog');

  const [items, programs, cities, districts, incomeSources] = await Promise.all([
    db.item.findMany({
      where: notDeleted,
      orderBy: [{ program: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        unit: true,
        hasSizes: true,
        isConsumable: true,
        reorderLevel: true,
        isActive: true,
        programId: true,
        program: { select: { name: true } },
      },
    }),
    db.program.findMany({
      where: notDeleted,
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    db.city.findMany({
      where: notDeleted,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    }),
    db.district.findMany({
      where: notDeleted,
      orderBy: [{ cityId: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true, cityId: true },
    }),
    db.incomeSource.findMany({
      where: notDeleted,
      orderBy: { id: 'asc' },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="الكتالوج والقوائم المرجعية"
        description="كل قيمة قابلة للتصنيف تُدار من هنا. لا حقل نصي حر لصنف أو مدينة أو مصدر دخل في أي شاشة — وهذا بالضبط ما أفسد ملف الإكسل القديم."
      />

      <CatalogManager
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          hasSizes: item.hasSizes,
          isConsumable: item.isConsumable,
          reorderLevel: item.reorderLevel,
          isActive: item.isActive,
          programId: item.programId,
          programName: item.program.name,
        }))}
        programs={programs}
        cities={cities}
        districts={districts}
        incomeSources={incomeSources}
      />
    </div>
  );
}
