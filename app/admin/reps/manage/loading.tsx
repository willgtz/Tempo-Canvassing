import { Skeleton } from "@/components/ui/skeleton";

export default function ManageRepsLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-6">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
