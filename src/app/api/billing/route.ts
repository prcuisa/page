import { NextRequest, NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/supabase/server";

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!configured()) return fail("Layanan akun belum tersedia.", 503);
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail("Silakan masuk kembali.", 401);
    const workspace = req.nextUrl.searchParams.get("workspace");
    if (!workspace) return fail("Pilih bisnis terlebih dahulu.");
    const membership = await db
      .from("workspaces")
      .select("id")
      .eq("id", workspace)
      .maybeSingle();
    if (membership.error || !membership.data)
      return fail("Kamu tidak memiliki akses ke bisnis ini.", 403);
    const [plans, subscription, payments] = await Promise.all([
      db
        .from("billing_plans")
        .select("plan_id,amount_idr,period_days,active")
        .eq("active", true),
      db
        .from("subscriptions")
        .select("plan_id,status,current_period_end")
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("payments")
        .select("order_id,plan_id,amount_idr,status,created_at,paid_at")
        .eq("workspace_id", workspace)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (plans.error || subscription.error || payments.error)
      throw new Error("billing");
    return NextResponse.json({
      plans: plans.data,
      subscription: subscription.data,
      payments: payments.data,
      paymentConfigured: Boolean(
        process.env.MIDTRANS_SERVER_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
    });
  } catch {
    return fail("Informasi paket belum berhasil dimuat.", 503);
  }
}
