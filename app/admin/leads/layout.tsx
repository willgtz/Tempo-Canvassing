import { LeadsSubnav } from "./leads-subnav";

// Groups Upload / Batches / Dispositions under one "Manage Leads" top-nav
// entry (app/admin/layout.tsx), with this local tab bar to switch between
// them as separate pages rather than one crowded page. Admin auth is
// already enforced by the parent app/admin/layout.tsx.
export default function ManageLeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <LeadsSubnav />
      {children}
    </div>
  );
}
