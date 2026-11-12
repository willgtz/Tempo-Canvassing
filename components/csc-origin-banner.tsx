import Link from "next/link";

// Shown on an appointment that was set from a Tempo CSC lead, linking back
// to where it came from. Admins open the original appointment itself; a
// rep can't (they were never assigned to it), so they go to the CSC lead,
// whose panel shows the original appointment's full details.
export function CscOriginBanner({
  originAppointmentId,
  leadId,
  isAdmin,
}: {
  originAppointmentId: string | null;
  leadId: string;
  isAdmin: boolean;
}) {
  if (!originAppointmentId) return null;

  const linkClass = "font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400";
  return (
    <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      ★ Set from a Tempo CSC lead.{" "}
      {isAdmin ? (
        // Plain <a>: the appointments page only reads ?appointment= on load.
        <a href={`/admin/appointments?appointment=${originAppointmentId}`} className={linkClass}>
          View original appointment
        </a>
      ) : (
        <Link href={`/leads?lead=${leadId}`} className={linkClass}>
          View original appointment
        </Link>
      )}
    </p>
  );
}
