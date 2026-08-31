"use client";

import { useMemo, useState } from "react";
import { RepCard, type ManagedUser } from "../rep-card";

type ManagerOption = { id: string; full_name: string; role: string };
type Assignment = { id: string; zipcode: string };
type ZipHistoryEntry = {
  id: string;
  zipcode: string;
  assignedAt: string;
  assignedByName: string | null;
  unassignedAt: string | null;
  unassignedByName: string | null;
};

const PAGE_SIZE = 10;

function matchesQuery(user: ManagedUser, query: string): boolean {
  if (!query) return true;
  return user.full_name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
}

export function ManageRepsClient({
  activeProfiles,
  managerOptions,
  nameById,
  assignmentsByUser,
  historyByUser,
  currentUserId,
}: {
  activeProfiles: ManagedUser[];
  managerOptions: ManagerOption[];
  nameById: Map<string, string>;
  assignmentsByUser: Map<string, Assignment[]>;
  historyByUser: Map<string, ZipHistoryEntry[]>;
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Pending invites get their own section so they don't crowd the main
  // list — someone who hasn't finished setting up their account yet isn't
  // really "a rep" to page through/search alongside everyone else.
  const pendingProfiles = useMemo(() => activeProfiles.filter((p) => p.name_pending), [activeProfiles]);
  const setUpProfiles = useMemo(() => activeProfiles.filter((p) => !p.name_pending), [activeProfiles]);

  const query = search.trim().toLowerCase();
  const filteredPending = useMemo(
    () => pendingProfiles.filter((p) => matchesQuery(p, query)),
    [pendingProfiles, query]
  );
  const filteredSetUp = useMemo(
    () => setUpProfiles.filter((p) => matchesQuery(p, query)),
    [setUpProfiles, query]
  );

  // Reset to page 1 whenever the search query changes — otherwise a
  // search could land you on a now-out-of-range page showing nothing,
  // with no obvious reason why. Adjusted directly during render (React's
  // documented pattern for "reset state when an input changes") rather
  // than in an effect, which would cost an extra render pass here.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredSetUp.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProfiles = filteredSetUp.slice(pageStart, pageStart + PAGE_SIZE);

  function renderCard(p: ManagedUser) {
    return (
      <RepCard
        key={p.id}
        user={p}
        managerOptions={managerOptions}
        isSelf={p.id === currentUserId}
        managerName={p.manager_id ? (nameById.get(p.manager_id) ?? null) : null}
        initialAssignments={assignmentsByUser.get(p.id) ?? []}
        zipHistory={historyByUser.get(p.id) ?? []}
      />
    );
  }

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search reps by name or email"
        className="w-full rounded border border-black/15 px-3 py-1.5 text-sm dark:border-white/20 dark:bg-transparent"
      />

      {filteredPending.length > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <h2 className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Pending Invites ({filteredPending.length})
          </h2>
          <div className="space-y-3">{filteredPending.map(renderCard)}</div>
        </div>
      )}

      <div className="space-y-3">
        {filteredSetUp.length === 0 ? (
          <p className="text-sm italic text-black/40 dark:text-white/40">
            {query ? "No reps match your search." : "No active reps."}
          </p>
        ) : (
          pageProfiles.map(renderCard)
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded border border-black/15 px-3 py-1 disabled:opacity-40 dark:border-white/20"
          >
            Previous
          </button>
          <span className="text-black/60 dark:text-white/60">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded border border-black/15 px-3 py-1 disabled:opacity-40 dark:border-white/20"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
