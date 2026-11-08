import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const requestedNext = req.nextUrl.searchParams.get("next");
  const next =
    requestedNext === "/update-password" ? "/update-password" : "/dashboard";
  try {
    if (code) {
      const db = await serverClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, req.url));
    }
  } catch {
    /* Expired links or unavailable auth fail closed. */
  }
  return NextResponse.redirect(new URL("/login?notice=expired", req.url));
}
