import { Skeleton } from "@/components/ui/skeleton";

export default function RouteHistoryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
