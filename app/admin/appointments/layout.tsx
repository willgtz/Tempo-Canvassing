import { AppointmentsSubnav } from "./appointments-subnav";

// Groups the appointments list, Statuses, and Form Fields settings under
// one "Appointments" top-nav entry (app/admin/layout.tsx), same pattern as
// app/admin/leads/layout.tsx groups Upload/Batches/Dispositions. Admin auth
// is already enforced by the parent layout.
export default function AppointmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <AppointmentsSubnav />
      {children}
    </div>
  );
}
