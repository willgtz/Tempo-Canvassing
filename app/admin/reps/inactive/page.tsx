import { getAdminSession } from "@/lib/auth/admin";
import { RepCard, type ManagedUser } from "../rep-card";
import { loadRepsData } from "../load-reps-data";

export default async function InactiveRepsPage() {
  const session = await getAdminSession();
  const data = await loadRepsData();

  if (data.error || !session) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load reps: {data.error?.message}
      </div>
    );
  }

  const { profiles, managerOptions, nameById, assignmentsByUser, historyByUser } = data;
  const inactiveProfiles = profiles.filter((p) => !p.active);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Inactive Reps</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Anyone marked inactive from Manage lands here instead. Hit Edit
          and check Active again to move them back.
        </p>
      </div>

      <div className="space-y-3">
        {inactiveProfiles.length === 0 && (
          <p className="text-sm italic text-black/40 dark:text-white/40">No inactive reps.</p>
        )}
        {inactiveProfiles.map((p) => (
          <RepCard
            key={p.id}
            user={p as ManagedUser}
            managerOptions={managerOptions}
            isSelf={p.id === session.userId}
            managerName={p.manager_id ? (nameById.get(p.manager_id) ?? null) : null}
            initialAssignments={assignmentsByUser.get(p.id) ?? []}
            zipHistory={historyByUser.get(p.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
