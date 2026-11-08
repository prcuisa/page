import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const uuid = z.uuid();
const itemSchema = z.object({
  description: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(999999),
  unit_price: z.number().int().min(0).max(999999999999),
});
const partySchema = z.object({
  name: z.string().max(120), address: z.string().max(500), email: z.union([z.literal(""), z.email().max(254)]),
});
const payloadSchema = z.object({
  sender: partySchema, client: partySchema, items: z.array(itemSchema).min(1).max(50),
  tax_rate: z.number().min(0).max(100), discount_rate: z.number().min(0).max(100),
  notes: z.string().max(1000), logo_data_url: z.union([z.literal(null), z.string().max(2800000).regex(/^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,/i)]),
}).strict();
const bodySchema = z.object({
  workspace: uuid, invoice_number: z.string().trim().min(1).max(50),
  invoice_date: z.iso.date(), payload: payloadSchema,
}).strict();
function message(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return fail("Invoice belum tersedia untuk bisnis atau akun ini.", 403);
  if (error.message?.includes("USAGE_LIMIT")) return fail("Batas invoice bulan ini tercapai. Lihat paket di Pengaturan.", 429);
  if (error.message?.includes("RATE_LIMIT")) return fail("Terlalu banyak tindakan. Tunggu sebentar lalu coba lagi.", 429);
  if (error.code === "23505") return fail("Nomor invoice ini sudah digunakan di bisnis kamu.", 409);
  return fail(fallback, 503);
}
async function authorized(req: NextRequest, workspace: string) {
  if (!configured()) return { error: fail("Layanan akun belum tersedia.", 503) };
  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: fail("Silakan masuk kembali.", 401) };
  const access = await db.rpc("platform_access", { p_workspace: workspace, p_app: "invoice" });
  if (access.error || !access.data?.enabled) return { error: fail("Invoice belum tersedia untuk bisnis atau akun ini.", 403) };
  return { db };
}
export async function GET(req: NextRequest) {
  const workspace = uuid.safeParse(req.nextUrl.searchParams.get("workspace"));
  if (!workspace.success) return fail("Pilih bisnis terlebih dahulu.");
  const auth = await authorized(req, workspace.data); if ("error" in auth) return auth.error;
  const id = req.nextUrl.searchParams.get("id");
  let query = auth.db.from("invoices").select("id,invoice_number,invoice_date,total,created_at,payload").eq("workspace_id", workspace.data);
  if (id) {
    const validId = uuid.safeParse(id); if (!validId.success) return fail("Invoice tidak ditemukan.");
    const { data, error } = await query.eq("id", validId.data).maybeSingle();
    if (error) return message(error, "Invoice belum berhasil dimuat.");
    if (!data) return fail("Invoice tidak ditemukan atau tidak dapat diakses.", 404);
    const parsed = payloadSchema.safeParse(data.payload); if (!parsed.success) return fail("Invoice ini belum dapat dibuka.", 422);
    return NextResponse.json({ invoice: { ...data, payload: parsed.data } });
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) return message(error, "Invoice tersimpan belum berhasil dimuat.");
  return NextResponse.json({ invoices: data });
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return fail("Permintaan tidak dapat diproses.", 403);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 3000000) return fail("Data invoice terlalu besar. Kurangi ukuran logo.", 413);
  let raw: string;
  try { raw = await req.text(); } catch { return fail("Data invoice belum berhasil dibaca."); }
  if (new TextEncoder().encode(raw).length > 3000000) return fail("Data invoice terlalu besar. Kurangi ukuran logo.", 413);
  let parsed: z.infer<typeof bodySchema>;
  try { parsed = bodySchema.parse(JSON.parse(raw)); } catch { return fail("Periksa kembali data invoice, item, dan nominalnya."); }
  const auth = await authorized(req, parsed.workspace); if ("error" in auth) return auth.error;
  const { data, error } = await auth.db.rpc("save_invoice", { p_workspace: parsed.workspace, p_invoice_number: parsed.invoice_number, p_invoice_date: parsed.invoice_date, p_payload: parsed.payload });
  if (error) return message(error, "Invoice belum berhasil disimpan. Coba lagi.");
  return NextResponse.json({ invoice: data }, { status: 201 });
}
