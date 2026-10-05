import { HicsSubnav } from "./hics-subnav";

// Groups All HICs / Settings under one "HICs" top-nav entry
// (app/admin/layout.tsx), same pattern as app/admin/reps/layout.tsx.
// Admin auth is already enforced by the parent app/admin/layout.tsx.
export default function HicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <HicsSubnav />
      {children}
    </div>
  );
}
