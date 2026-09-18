import { deriveGoalStatus } from "@/lib/dashboard/stats";

type GoalRow = {
  goal_id: string;
  user_id: string;
  full_name: string;
  target_count: number;
  start_date: string;
  end_date: string;
  verified_count: number;
};

export function DoorKnockGoalsTable({ goals, today }: { goals: GoalRow[]; today: string }) {
  // One row per rep's most recent goal only — admin overview cares about
  // "who's on track right now," not full history (reps see their own
  // full history on their own dashboard already).
  const latestPerRep = new Map<string, GoalRow>();
  for (const g of [...goals].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))) {
    if (!latestPerRep.has(g.user_id)) latestPerRep.set(g.user_id, g);
  }
  const rows = Array.from(latestPerRep.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));

  if (rows.length === 0) {
    return (
      <p className="text-sm italic text-black/40 dark:text-white/40">
        No reps have set a door-knock goal yet.
      </p>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-black/5 dark:bg-white/5">
        <tr>
          <th className="px-3 py-2 font-medium">Rep</th>
          <th className="px-3 py-2 font-medium">Window</th>
          <th className="px-3 py-2 font-medium">Progress</th>
          <th className="px-3 py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => {
          const status = deriveGoalStatus(g, g.verified_count, today);
          return (
            <tr key={g.goal_id} className="border-t border-black/5 dark:border-white/10">
              <td className="px-3 py-2">{g.full_name}</td>
              <td className="px-3 py-2">
                {g.start_date} – {g.end_date}
              </td>
              <td className="px-3 py-2">
                {g.verified_count} / {g.target_count}
              </td>
              <td
                className={
                  status === "achieved"
                    ? "px-3 py-2 font-medium text-green-700 dark:text-green-400"
                    : status === "failed"
                      ? "px-3 py-2 font-medium text-red-700 dark:text-red-400"
                      : "px-3 py-2"
                }
              >
                {status === "achieved" ? "Achieved" : status === "failed" ? "Failed" : "In progress"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
