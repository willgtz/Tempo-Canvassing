const CHART_HEIGHT = 96;

function formatDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No data yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <div
        className="flex items-end gap-0.5 border-b border-black/10 dark:border-white/10"
        style={{ height: CHART_HEIGHT }}
      >
        {data.map((d) => {
          const height = d.count > 0 ? Math.max((d.count / max) * CHART_HEIGHT, 3) : 0;
          return (
            <div
              key={d.date}
              className="flex-1"
              style={{ height: CHART_HEIGHT }}
              title={`${formatDateLabel(d.date)}: ${d.count}`}
            >
              <div
                className="w-full rounded-t-[4px]"
                style={{ height, marginTop: CHART_HEIGHT - height, backgroundColor: "var(--chart-series-1)" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-black/50 dark:text-white/50">
        <span>{formatDateLabel(data[0].date)}</span>
        <span>{formatDateLabel(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
