import "server-only";

// Vercel (and most proxies) set x-forwarded-for as a comma-separated
// list, client IP first, each hop appending its own — no existing
// precedent for this in the app elsewhere since nothing before Send HIC
// needed to record a visitor's IP for an audit trail.
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function getUserAgent(request: Request): string {
  return request.headers.get("user-agent") ?? "unknown";
}
