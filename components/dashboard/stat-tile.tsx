import { formatStatValue } from "@/lib/dashboard/stats";
import { Card } from "@/components/ui/card";

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{formatStatValue(value)}</p>
      {hint && <p className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</p>}
    </Card>
  );
}
