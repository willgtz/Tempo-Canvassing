import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-32" />
        ))}
      </div>
      <Skeleton className="h-[calc(100dvh-220px)] min-h-[400px]" />
    </div>
  );
}
