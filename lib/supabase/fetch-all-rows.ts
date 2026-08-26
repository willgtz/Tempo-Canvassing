// Supabase/PostgREST caps any single response at 1000 rows by default
// (the project's "max rows" API setting) — it doesn't error, it just
// silently returns 1000 and stops, however many rows actually matched.
// Any .select() against a table that can plausibly grow past 1000 rows
// (leads, mainly, once a company's been canvassing a while) needs this
// instead of a bare query, or totals/lists quietly go wrong with no
// error anywhere to notice.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;

  // Safety bound, not an expected real limit — stops an infinite loop if a
  // caller's query isn't actually deterministic/paginable for some reason,
  // rather than hanging the request forever.
  for (let page = 0; page < 500; page++) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: all, error: null };
}
