import { formatStatValue } from "@/lib/dashboard/stats";

export function StatTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{formatStatValue(value)}</p>
    </div>
  );
}
