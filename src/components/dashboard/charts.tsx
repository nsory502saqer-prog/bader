'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * رسوم لوحة المعلومات.
 *
 * قرارات مقصودة:
 *   - **محور واحد دائمًا.** لا رسم بمحورين رأسيين مهما أغرى ذلك.
 *   - **لونان فقط**، وكلاهما رمز Primer دلالي لا لون زخرفي: الأزرق للإجمالي
 *     والأخضر للمُنجز. مرّا على فحص فصل عمى الألوان في الوضعين (ΔE 26 فاتح،
 *     27 داكن) فلا يلتبسان.
 *   - **الألوان بمتغيرات CSS** لا قيم ثابتة، فالوضع الليلي يبدّلها من جذورها
 *     بدل قلبها.
 *   - **اتجاه RTL أصيل**: المحاور معكوسة والتسميات على اليمين، لا صورة معكوسة.
 *   - **الشبكة خافتة**: خطوط أفقية فقط بلون الحدّ، فالبيانات هي البطل.
 */

const ACCENT = 'var(--bgColor-accent-emphasis)';
const SUCCESS = 'var(--bgColor-success-emphasis)';
const GRID = 'var(--borderColor-default)';
const INK_MUTED = 'var(--fgColor-muted)';

const AXIS_TICK = { fill: INK_MUTED, fontSize: 12 } as const;

/** تلميح موحّد بأسلوب Primer — ظل مسموح هنا لأنه عنصر عائم. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded border border-border bg-canvas px-1 py-0.5 text-xs shadow-overlay">
      <p className="font-semibold text-fg">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-0.5 text-fg-muted">
          <span
            aria-hidden="true"
            className="inline-block h-[8px] w-[8px] rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="tnum font-semibold text-fg">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** الطلبات شهريًا: سلسلتان، فالتسمية التوضيحية إلزامية. */
export function MonthlyRequestsChart({
  data,
}: {
  data: { month: string; total: number; delivered: number }[];
}) {
  return (
    <div className="h-[240px] w-full px-1 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="month"
            reversed
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID }}
          />
          <YAxis
            orientation="right"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bgColor-neutral-muted)' }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={24}
            wrapperStyle={{ fontSize: 12, color: INK_MUTED }}
          />
          <Bar dataKey="total" name="الطلبات" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar
            dataKey="delivered"
            name="المسلَّمة"
            fill={SUCCESS}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** التوزيع حسب البرنامج: سلسلة واحدة، فلا تسمية توضيحية — العنوان يسمّيها. */
export function ProgramChart({ data }: { data: { program: string; requests: number }[] }) {
  return (
    <div className="w-full px-1 pb-1" style={{ height: Math.max(180, data.length * 34 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="0" horizontal={false} />
          <XAxis
            type="number"
            reversed
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            allowDecimals={false}
          />
          {/* أسماء البرامج عربية كاملة («كفالة مريض»، «أتوكأ عليها»)، فالعرض
              هنا مقاس عليها لا افتراضي — وإلا اقتُطعت وفقدت معناها. */}
          <YAxis
            type="category"
            dataKey="program"
            orientation="right"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={110}
            interval={0}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bgColor-neutral-muted)' }} />
          <Bar dataKey="requests" name="الطلبات" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((entry) => (
              <Cell key={entry.program} fill={ACCENT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
