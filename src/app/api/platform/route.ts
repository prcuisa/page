import { NextRequest, NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/supabase/server";
import { z } from "zod";
import QRCode from "qrcode";
import { qrSchema } from "@/lib/qr";
export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
export async function GET(req: NextRequest) {
  try {
    if (!configured()) return fail("Layanan akun belum tersedia.", 503);
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail("Silakan masuk kembali.", 401);
    if (req.nextUrl.searchParams.get("context") === "1") {
      const { data: workspaces, error } = await db
        .from("workspaces")
        .select("*")
        .order("created_at");
      if (error) throw error;
      const id = req.nextUrl.searchParams.get("workspace");
      const workspace = id
        ? workspaces.find((w) => w.id === id)
        : workspaces[0];
      if (id && !workspace)
        return fail("Kamu tidak memiliki akses ke bisnis ini.", 403);
      return NextResponse.json({
        workspaces,
        snapshot: workspace ? { workspace } : null,
      });
    }
    const workspace = z.uuid().parse(req.nextUrl.searchParams.get("workspace"));
    const access = await db.rpc("platform_access", {
      p_workspace: workspace,
      p_app: "business-report",
    });
    if (access.error)
      return fail("Kamu tidak memiliki akses ke bisnis ini.", 403);
    const plan = access.data.plan;
    const results = await Promise.all([
      db.from("apps").select("*").order("created_at"),
      db
        .from("workspace_apps")
        .select("app_id,favorite,last_opened_at")
        .eq("workspace_id", workspace),
      db
        .from("tool_requests")
        .select("id,problem,workflow,frequency,status,created_at")
        .eq("workspace_id", workspace)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("platform_events")
        .select("id,name,app_id,created_at")
        .eq("workspace_id", workspace)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("plan_entitlements")
        .select("capability,enabled,monthly_limit")
        .eq("plan_id", plan),
      db.rpc("foundation_snapshot", { p_workspace: workspace }),
    ]);
    if (results.some((r) => r.error)) throw new Error("load");
    const toolUsage = await Promise.all((results[0].data || []).filter(t => ["active", "beta"].includes(t.status)).map(async t => {
      const r = await db.rpc("platform_access", {p_workspace:workspace,p_app:t.slug});
      if (r.error) throw r.error;
      return {app_id:t.slug,quantity:r.data.used};
    }));
    return NextResponse.json({
      is_admin: results[5].data.is_admin,
      workspace_role: results[5].data.role,
      name: user.user_metadata?.full_name || "",
      email: user.email,
      tools: results[0].data,
      states: results[1].data,
      requests: results[2].data,
      events: results[3].data,
      plan,
      access: results[4].data,
      usage: toolUsage,
    });
  } catch {
    return fail("Hub belum berhasil dimuat. Silakan coba lagi.", 503);
  }
}
const schema = z.object({
  workspace: z.uuid(),
  action: z.enum([
    "open",
    "favorite",
    "request",
    "qr",
    "hub_viewed",
    "upgrade_viewed",
    "upgrade_clicked",
    "tool_searched",
  ]),
  app: z.string().max(80).optional(),
  payload: z
    .object({
      favorite: z.boolean().optional(),
      problem: z.string().trim().min(10).max(2000).optional(),
      workflow: z.string().trim().max(2000).optional(),
      frequency: z.string().max(80).optional(),
      url: qrSchema.optional(),
    })
    .default({}),
});
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return fail("Permintaan tidak dapat diproses.", 403);
    if (!configured()) return fail("Layanan akun belum tersedia.", 503);
    if (Number(req.headers.get("content-length") || 0) > 12000)
      return fail("Isian terlalu panjang.", 413);
    const raw = await req.text();
    if (raw.length > 12000) return fail("Isian terlalu panjang.", 413);
    const body = schema.parse(JSON.parse(raw));
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail("Silakan masuk kembali.", 401);
    let png: string | undefined;
    if (body.action === "qr") {
      const url = qrSchema.parse(body.payload.url);
      body.app = "qr";
      png = await QRCode.toDataURL(url, {
        width: 768,
        margin: 4,
        errorCorrectionLevel: "M",
      });
    }
    if (body.action === "request" && !body.payload.problem)
      return fail("Ceritakan masalah yang ingin kamu permudah.");
    const { url: discard, ...payload } = body.payload;
    void discard;
    const { data, error } = await db.rpc("platform_action", {
      p_workspace: body.workspace,
      p_action: body.action,
      p_app: body.app || null,
      p_payload: payload,
    });
    if (error) {
      if (error.message.includes("RATE_LIMIT"))
        return fail(
          "Terlalu banyak tindakan. Tunggu sebentar lalu coba lagi.",
          429,
        );
      if (error.message.includes("USAGE_LIMIT"))
        return fail(
          "Batas penggunaan bulan ini sudah tercapai. Lihat paket di Pengaturan.",
          429,
        );
      if (error.code === "42501")
        return fail(
          "Tool atau bisnis ini belum tersedia untuk akunmu. Periksa akses di Pengaturan.",
          403,
        );
      throw error;
    }
    return NextResponse.json({ ...data, png });
  } catch (e) {
    return fail(
      e instanceof z.ZodError
        ? "Periksa isian. Gunakan tautan lengkap https:// untuk QR."
        : "Belum berhasil diproses. Silakan coba lagi.",
      e instanceof z.ZodError ? 400 : 503,
    );
  }
}
