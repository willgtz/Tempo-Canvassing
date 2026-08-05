import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/admin";
import { geocodeAddress } from "@/lib/geocode/google";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let address: unknown;
  try {
    ({ address } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "`address` is required" }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Geocoding failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
