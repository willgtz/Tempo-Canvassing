import { Skeleton } from "@/components/ui/skeleton";

export default function HicDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-6 w-48" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-40" />
    </div>
  );
}
