import { NextRequest, NextResponse } from "next/server";
import { serverClient, configured } from "@/lib/supabase/server";
import { transactionSchema, periodDates } from "@/lib/domain";
import { z } from "zod";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });
async function context() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}
export async function GET(req: NextRequest) {
  try {
    if (!configured())
      return fail("Layanan belum tersedia. Coba lagi nanti.", 503);
    const { db, user } = await context();
    if (!user) return fail("Silakan masuk kembali.", 401);
    const { data: workspaces, error } = await db
      .from("workspaces")
      .select("*")
      .order("created_at");
    if (error) throw error;
    const id = req.nextUrl.searchParams.get("workspace");
    const workspace = id ? workspaces.find((w) => w.id === id) : workspaces[0];
    if (!workspace)
      return NextResponse.json({
        workspaces,
        snapshot: null,
        email: user.email,
        name: user.user_metadata?.full_name || "",
      });
    const access = await db.rpc("platform_access", {
      p_workspace: workspace.id,
      p_app: "business-report",
    });
    if (access.error || !access.data?.enabled)
      return fail(
        "Business Report belum tersedia untuk akunmu. Lihat paket di Pengaturan.",
        403,
      );
    const period = ["today", "month", "all"].includes(
      req.nextUrl.searchParams.get("period") || "",
    )
      ? req.nextUrl.searchParams.get("period")!
      : "today";
    const page = Math.floor(
      Math.max(
        0,
        Math.min(100000, Number(req.nextUrl.searchParams.get("page")) || 0),
      ),
    );
    const dates = periodDates(period);
    const [stats, records, events, usage] = await Promise.all([
      db.rpc("business_summary", {
        p_workspace: workspace.id,
        p_start: dates.start,
        p_end: dates.end,
        p_previous_start: dates.previousStart,
        p_previous_end: dates.previousEnd,
      }),
      db
        .from("transactions")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspace.id)
        .gte("date", dates.start)
        .lte("date", dates.end)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * 20, page * 20 + 19),
      db
        .from("activity_events")
        .select("id,name,created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
      db.rpc("business_usage", { p_workspace: workspace.id }),
    ]);
    if (stats.error || records.error || events.error || usage.error)
      throw stats.error || records.error || events.error || usage.error;
    return NextResponse.json({
      workspaces,
      email: user.email,
      name: user.user_metadata?.full_name || "",
      snapshot: {
        workspace,
        usage: usage.data,
        summary: stats.data,
        transactions: records.data,
        total: records.count,
        page,
        events: events.data,
      },
    });
  } catch {
    return fail("Data belum berhasil dimuat. Silakan coba lagi.", 503);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (!origin || origin !== req.nextUrl.origin)
      return fail("Permintaan tidak dapat diproses.", 403);
    if (!configured()) return fail("Layanan belum tersedia.", 503);
    const { db, user } = await context();
    if (!user) return fail("Silakan masuk kembali.", 401);
    const body = await req.json();
    if (body.action === "profile") {
      const full_name = z.string().trim().min(1).max(80).parse(body.full_name);
      const { error } = await db.auth.updateUser({ data: { full_name } });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.action === "workspace") {
      const name = z.string().trim().min(2).max(80).parse(body.name);
      const { data, error } = await db
        .from("workspaces")
        .insert({
          name,
          owner_id: user.id,
          business_type: z
            .string()
            .trim()
            .min(1)
            .max(60)
            .default("Lainnya")
            .parse(body.business_type),
          primary_goal: z
            .enum([
              "Pemasukan & pengeluaran",
              "Laporan bisnis",
              "Pekerjaan berulang",
              "Customer service",
              "Belum tahu, saya mau coba dulu",
            ])
            .default("Belum tahu, saya mau coba dulu")
            .parse(body.primary_goal),
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ workspace: data });
    }
    if (body.action === "rename") {
      const id = z.uuid().parse(body.id);
      const name = z.string().trim().min(2).max(80).parse(body.name);
      const { data, error } = await db
        .from("workspaces")
        .update({ name })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ workspace: data });
    }
    if (body.action === "transaction") {
      const row = transactionSchema.parse(body.transaction);
      const { data, error } = await db
        .from("transactions")
        .upsert(
          { ...row, created_by: user.id },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select();
      if (error) throw error;
      return NextResponse.json({ ok: true, inserted: data.length > 0 });
    }
    if (body.action === "event") {
      const name = z
        .enum(["workspace_opened", "upgrade_intent"])
        .parse(body.name);
      const workspace_id = z.uuid().parse(body.workspace_id);
      const { error } = await db
        .from("activity_events")
        .insert({ workspace_id, user_id: user.id, name });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return fail("Tindakan tidak dikenali.");
  } catch (e) {
    return fail(
      e instanceof z.ZodError
        ? "Periksa kembali isian kamu."
        : "Belum berhasil menyimpan. Coba lagi; catatan yang sama tidak akan disimpan dua kali.",
      e instanceof z.ZodError ? 400 : 503,
    );
  }
}
