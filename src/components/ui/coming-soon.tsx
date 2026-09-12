import { Box, PageHeader } from '@/components/ui/surface';

/**
 * شاشة لم تُبنَ بعد.
 * تُذكر المرحلة صراحةً بدل رسالة مبهمة، حتى يعرف الموظف متى يتوقّعها
 * بدل أن يظن أن النظام معطّل.
 */
export function ComingSoon({
  title,
  phase,
  scope,
}: {
  title: string;
  phase: string;
  scope: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title={title} description={`تُسلَّم هذه الشاشة في ${phase}.`} />
      <Box className="p-2">
        <p className="text-sm font-semibold text-fg">ما ستتضمّنه</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-3 text-sm text-fg-muted">
          {scope.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Box>
    </div>
  );
}
