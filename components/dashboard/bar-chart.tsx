export type BarChartItem = {
  label: string;
  value: number;
  color?: string;
};

// Horizontal magnitude bars. Default (no per-item color) uses the single
// sequential hue — this is a ranking/magnitude comparison, not distinct
// series, so per the dataviz skill it gets one hue, not a categorical
// rainbow. Pass per-item colors only when the categories already carry a
// meaningful identity color elsewhere in the app (disposition breakdowns).
export function BarChart({
  items,
  emptyMessage = "No data yet.",
}: {
  items: BarChartItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2" title={`${item.label}: ${item.value}`}>
          <div className="flex w-28 shrink-0 items-center gap-1.5 sm:w-36">
            {item.color && (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            )}
            <span className="truncate text-sm text-black/70 dark:text-white/70">{item.label}</span>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-4 flex-1">
              <div
                className="h-4 rounded-r-[4px]"
                style={{
                  width: `${Math.max((item.value / max) * 100, 2)}%`,
                  backgroundColor: item.color ?? "var(--chart-series-1)",
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm tabular-nums text-black/60 dark:text-white/60">
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
