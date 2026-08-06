// Deliberately not clsx/tailwind-merge — this codebase has no className-
// merging dependency yet, and the usage here (join truthy strings) doesn't
// need conflict resolution, just filtering.
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
