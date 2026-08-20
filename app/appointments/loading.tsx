import { Skeleton } from "@/components/ui/skeleton";

export default function AppointmentsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
