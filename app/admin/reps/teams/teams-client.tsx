"use client";

import { useMemo, useState, useTransition } from "react";
import { createTeam, renameTeam, deleteTeam, addRepToTeam, removeRepFromTeam } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type Team = { id: string; name: string; created_at: string };
type Profile = { id: string; full_name: string; email: string; role: string; active: boolean };
// One row per (user, team) pair — a user can appear in multiple rows now
// that team membership is many-to-many (team_memberships, schema.sql),
// unlike the old single-team_id model this replaced.
type Membership = { userId: string; teamId: string };

export function TeamsClient({
  initialTeams,
  profiles,
  initialMemberships,
}: {
  initialTeams: Team[];
  profiles: Profile[];
  initialMemberships: Membership[];
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [members] = useState(profiles);
  const [memberships, setMemberships] = useState(initialMemberships);

  const [newTeamName, setNewTeamName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();

  const profileById = useMemo(() => new Map(members.map((p) => [p.id, p])), [members]);
  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  const membersByTeam = useMemo(() => {
    const map = new Map<string, Profile[]>();
    for (const m of memberships) {
      const profile = profileById.get(m.userId);
      if (!profile) continue;
      const list = map.get(m.teamId) ?? [];
      list.push(profile);
      map.set(m.teamId, list);
    }
    return map;
  }, [memberships, profileById]);

  const teamIdsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of memberships) {
      const list = map.get(m.userId) ?? [];
      list.push(m.teamId);
      map.set(m.userId, list);
    }
    return map;
  }, [memberships]);

  const unassigned = useMemo(
    () => members.filter((p) => (teamIdsByUser.get(p.id) ?? []).length === 0),
    [members, teamIdsByUser]
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    startCreate(async () => {
      const result = await createTeam(newTeamName);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setTeams((prev) => [...prev, { ...result.team, created_at: new Date().toISOString() }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTeamName("");
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Teams</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Reps on the same team automatically share zip coverage and can see
          each other&apos;s manually-entered leads — no need to individually
          assign each rep to every zip. A rep can belong to multiple teams;
          they share coverage with each team&apos;s other members
          independently, so being on two teams never shares one team&apos;s
          pins with the other&apos;s members.
        </p>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Create a team</h2>
        <form onSubmit={handleCreate} className="mt-3 flex items-center gap-2">
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={isCreating || !newTeamName.trim()}>
            {isCreating ? "Creating…" : "Create"}
          </Button>
        </form>
        {createError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{createError}</p>
        )}
      </Card>

      {teams.length === 0 ? (
        <p className="text-sm italic text-black/40 dark:text-white/40">No teams yet.</p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              teamMembers={membersByTeam.get(team.id) ?? []}
              addableMembers={members.filter((p) => !(teamIdsByUser.get(p.id) ?? []).includes(team.id))}
              teamIdsByUser={teamIdsByUser}
              teamNameById={teamNameById}
              onRenamed={(name) => {
                setTeams((prev) =>
                  prev.map((t) => (t.id === team.id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name))
                );
              }}
              onDeleted={() => {
                setTeams((prev) => prev.filter((t) => t.id !== team.id));
                setMemberships((prev) => prev.filter((m) => m.teamId !== team.id));
              }}
              onMemberAdded={(userId) => {
                setMemberships((prev) => [...prev, { userId, teamId: team.id }]);
              }}
              onMemberRemoved={(userId) => {
                setMemberships((prev) => prev.filter((m) => !(m.userId === userId && m.teamId === team.id)));
              }}
            />
          ))}
        </div>
      )}

      <details className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
        <summary className="cursor-pointer select-none font-medium">
          Unassigned Reps ({unassigned.length})
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {unassigned.length === 0 ? (
            <p className="text-sm italic text-black/40 dark:text-white/40">
              Everyone is on a team.
            </p>
          ) : (
            unassigned.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-neutral-950"
              >
                {p.full_name}
                {!p.active && <span className="text-black/40 dark:text-white/40">(inactive)</span>}
              </span>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function TeamCard({
  team,
  teamMembers,
  addableMembers,
  teamIdsByUser,
  teamNameById,
  onRenamed,
  onDeleted,
  onMemberAdded,
  onMemberRemoved,
}: {
  team: Team;
  teamMembers: Profile[];
  addableMembers: Profile[];
  teamIdsByUser: Map<string, string[]>;
  teamNameById: Map<string, string>;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
  onMemberAdded: (userId: string) => void;
  onMemberRemoved: (userId: string) => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(team.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, startRename] = useTransition();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const [addUserId, setAddUserId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemoving, startRemove] = useTransition();

  function handleSaveName() {
    setRenameError(null);
    startRename(async () => {
      const result = await renameTeam(team.id, nameDraft);
      if (!result.ok) {
        setRenameError(result.error);
        return;
      }
      onRenamed(nameDraft.trim());
      setIsEditingName(false);
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete "${team.name}"? ${teamMembers.length} member${teamMembers.length === 1 ? "" : "s"} will be unassigned from this team — their zip and lead access reverts to what it'd be without a team, nothing else about them changes.`
      )
    ) {
      return;
    }
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteTeam(team.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      onDeleted();
    });
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!addUserId) return;
    startAdd(async () => {
      const result = await addRepToTeam(addUserId, team.id);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      onMemberAdded(addUserId);
      setAddUserId("");
    });
  }

  function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    startRemove(async () => {
      const result = await removeRepFromTeam(userId, team.id);
      if (result.ok) onMemberRemoved(userId);
      setRemovingId(null);
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        {isEditingName ? (
          <div className="flex flex-1 items-center gap-2">
            <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="flex-1" />
            <Button size="sm" onClick={handleSaveName} disabled={isRenaming || !nameDraft.trim()}>
              {isRenaming ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setNameDraft(team.name);
                setIsEditingName(false);
                setRenameError(null);
              }}
              disabled={isRenaming}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-medium">{team.name}</h2>
            <p className="text-xs text-black/50 dark:text-white/50">
              {teamMembers.length} member{teamMembers.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
        {!isEditingName && (
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditingName(true)}>
              Rename
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </div>
      {renameError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{renameError}</p>}
      {deleteError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {teamMembers.length === 0 && (
          <p className="text-sm italic text-black/40 dark:text-white/40">No members yet.</p>
        )}
        {teamMembers.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/15 py-0.5 pl-2.5 pr-1 text-xs dark:border-white/20"
          >
            {p.full_name}
            <button
              type="button"
              onClick={() => handleRemoveMember(p.id)}
              disabled={isRemoving && removingId === p.id}
              className="rounded-full px-1 text-black/40 hover:bg-black/10 hover:text-black disabled:opacity-50 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
              title="Remove from team"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={handleAddMember} className="mt-3 flex items-center gap-2">
        <Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1">
          <option value="">Add member…</option>
          {addableMembers.map((p) => {
            const otherTeamNames = (teamIdsByUser.get(p.id) ?? [])
              .map((id) => teamNameById.get(id) ?? "another team");
            return (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.role})
                {otherTeamNames.length > 0 ? ` — also on ${otherTeamNames.join(", ")}` : ""}
              </option>
            );
          })}
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={isAdding || !addUserId}>
          {isAdding ? "Adding…" : "Add"}
        </Button>
      </form>
      {addError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p>}
    </Card>
  );
}
