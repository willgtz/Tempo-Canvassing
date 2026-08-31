import { getAdminSession } from "@/lib/auth/admin";
import type { ManagedUser } from "../rep-card";
import { loadRepsData } from "../load-reps-data";
import { ManageRepsClient } from "./manage-reps-client";

export default async function ManageRepsPage() {
  const session = await getAdminSession();
  const data = await loadRepsData();

  if (data.error || !session) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load reps: {data.error?.message}
      </div>
    );
  }

  const { profiles, managerOptions, nameById, assignmentsByUser, historyByUser, unassignedZips } = data;
  // Inactive reps live on their own tab now (app/admin/reps/inactive) —
  // moved out rather than just shown dimmed here, per William's request,
  // so this list stays a clean "who's currently active" view.
  const activeProfiles = profiles.filter((p) => p.active);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Manage Reps</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Zip assignment is always available. Editing name, email, phone,
          role, manager, or active status requires hitting Edit — you
          can&apos;t edit your own account here, and the last remaining
          admin/super_admin can&apos;t be demoted or deactivated. Removing a
          zip closes it out (keeps history) rather than deleting the row.
          Marking someone inactive moves them to the Inactive tab.
        </p>
      </div>

      {unassignedZips.length > 0 ? (
        <details open className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <summary className="cursor-pointer select-none font-medium text-amber-700 dark:text-amber-400">
            Unassigned Zip Codes ({unassignedZips.length})
          </summary>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            These zips have leads but no rep currently covering them.
            Sorted by lead count, highest first.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unassignedZips.map((z) => (
              <span
                key={z.zipcode}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-neutral-950"
              >
                <span className="font-medium">{z.zipcode}</span>
                <span className="text-black/40 dark:text-white/40">
                  {z.leadCount} lead{z.leadCount === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </div>
        </details>
      ) : (
        <p className="text-sm italic text-black/40 dark:text-white/40">
          Every zip with leads currently has a rep assigned.
        </p>
      )}

      <ManageRepsClient
        activeProfiles={activeProfiles as ManagedUser[]}
        managerOptions={managerOptions}
        nameById={nameById}
        assignmentsByUser={assignmentsByUser}
        historyByUser={historyByUser}
        currentUserId={session.userId}
      />
    </div>
  );
}
