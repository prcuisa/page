import { NextRequest, NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/supabase/server";
import { buildQRContent, designSchema } from "@/lib/qr-content";
import { z } from "zod";
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
    const workspace = z.uuid().parse(req.nextUrl.searchParams.get("workspace"));
    const access = await db.rpc("platform_access", {
      p_workspace: workspace,
      p_app: "qr",
    });
    if (access.error || !access.data?.enabled)
      return fail("QR Tools belum tersedia untuk akun atau bisnis ini.", 403);
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const { data, error } = await db
        .from("qr_designs")
        .select("id,name,design,created_at")
        .eq("workspace_id", workspace)
        .eq("id", z.uuid().parse(id))
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return fail("Desain tidak ditemukan atau tidak dapat diakses.", 404);
      const parsed = designSchema.safeParse(data.design);
      if (!parsed.success) return fail("Desain ini belum dapat dibuka.", 422);
      return NextResponse.json({ design: { ...data, design: parsed.data } });
    }
    const { data, error } = await db
      .from("qr_designs")
      .select("id,name,type:design->>type,created_at")
      .eq("workspace_id", workspace)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ designs: data });
  } catch {
    return fail("QR tersimpan belum berhasil dimuat. Coba lagi.", 503);
  }
}
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("export"), workspace: z.uuid() }),
  z.object({
    action: z.literal("save"),
    workspace: z.uuid(),
    name: z.string().trim().min(1).max(80),
    design: designSchema,
  }),
]);
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return fail("Permintaan tidak dapat diproses.", 403);
    if (!configured()) return fail("Layanan akun belum tersedia.", 503);
    if (Number(req.headers.get("content-length") || 0) > 450000)
      return fail("Desain terlalu besar. Gunakan logo lebih kecil.", 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 450000)
      return fail("Desain terlalu besar. Gunakan logo lebih kecil.", 413);
    const body = requestSchema.parse(JSON.parse(raw));
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail("Silakan masuk kembali.", 401);
    if (body.action === "save")
      try {
        buildQRContent(body.design);
      } catch {
        return fail("Isi konten QR yang valid sebelum menyimpan.");
      }
    const result =
      body.action === "save"
        ? await db.rpc("save_qr_design", {
            p_workspace: body.workspace,
            p_name: body.name,
            p_design: body.design,
          })
        : await db.rpc("platform_action", {
            p_workspace: body.workspace,
            p_action: "qr",
            p_app: "qr",
          });
    if (result.error) {
      if (result.error.message.includes("RATE_LIMIT"))
        return fail(
          "Terlalu banyak tindakan. Tunggu sebentar lalu coba lagi.",
          429,
        );
      if (result.error.message.includes("USAGE_LIMIT"))
        return fail(
          "Batas penggunaan bulan ini tercapai. Lihat paket di Pengaturan.",
          429,
        );
      if (result.error.code === "42501")
        return fail("QR Tools belum tersedia untuk akun atau bisnis ini.", 403);
      throw result.error;
    }
    return NextResponse.json(
      body.action === "save" ? { design: result.data } : { ok: true },
    );
  } catch (e) {
    return fail(
      e instanceof z.ZodError
        ? "Periksa nama, konten, dan pengaturan QR."
        : "Belum berhasil diproses. Silakan coba lagi.",
      e instanceof z.ZodError ? 400 : 503,
    );
  }
}
