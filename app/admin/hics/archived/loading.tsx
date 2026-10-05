import { Skeleton } from "@/components/ui/skeleton";

export default function ArchivedHicsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div>
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-64" />
    </div>
  );
}
