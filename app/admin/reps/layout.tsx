import { RepsSubnav } from "./reps-subnav";

// Groups Manage / Add Rep under one "Reps" top-nav entry (app/admin/layout.tsx),
// same pattern as Manage Leads (app/admin/leads/layout.tsx). Admin auth is
// already enforced by the parent app/admin/layout.tsx.
export default function RepsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <RepsSubnav />
      {children}
    </div>
  );
}
