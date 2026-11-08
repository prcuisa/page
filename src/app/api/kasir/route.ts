import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { foundationSession, fail } from "@/lib/foundation-server";
import { productSchema, checkoutSchema } from "@/features/kasir/domain";
export const dynamic = "force-dynamic";
const send = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
function errorReply(e: { code?: string; message?: string }) {
  if (e.code === "42501")
    return fail(
      "Akses kasir tidak tersedia. Periksa paket dan izin bisnis kamu.",
      403,
    );
  const messages: Record<string, string> = {
    PRICE_CHANGED:
      "Harga barang berubah. Kosongkan keranjang, muat ulang, lalu pilih barang kembali.",
    PRODUCT_UNAVAILABLE: "Barang tidak tersedia. Periksa kembali keranjang.",
    USAGE_LIMIT: "Batas transaksi paket tercapai. Lihat paket di Akun.",
    RATE_LIMIT: "Terlalu banyak tindakan. Tunggu sebentar lalu coba lagi.",
    IDR_REQUIRED: "Kasir saat ini mendukung bisnis dengan mata uang IDR.",
  };
  return fail(
    messages[e.message || ""] || "Periksa isian atau koneksi, lalu coba lagi.",
    e.message === "USAGE_LIMIT" ? 409 : 400,
  );
}
export async function GET(req: NextRequest) {
  try {
    const s = await foundationSession();
    if ("error" in s) return s.error;
    const p = req.nextUrl.searchParams;
    const { data, error } = await s.db.rpc("kasir_read", {
      w: z.uuid().parse(p.get("workspace")),
      section: z
        .enum(["products", "sales", "summary"])
        .parse(p.get("section") || "products"),
      q: z
        .string()
        .max(120)
        .parse(p.get("q") || ""),
      page: z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(p.get("page") || 0),
    });
    if (error) return errorReply(error);
    return send(data);
  } catch {
    return fail("Data kasir belum dapat dimuat.", 400);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return fail("Permintaan tidak dapat diproses.", 403);
    if (Number(req.headers.get("content-length") || 0) > 16000)
      return fail("Isian terlalu besar.", 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 16000)
      return fail("Isian terlalu besar.", 413);
    const s = await foundationSession();
    if ("error" in s) return s.error;
    const body = JSON.parse(raw),
      w = z.uuid().parse(body.workspace),
      action = z
        .enum(["product", "checkout", "share", "revoke"])
        .parse(body.action);
    let p: unknown;
    let token = "";
    if (action === "product") p = productSchema.parse(body.payload);
    else if (action === "checkout") p = checkoutSchema.parse(body.payload);
    else {
      const id = z.uuid().parse(body.payload?.id);
      if (action === "share") {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
          return fail(
            "Struk digital belum diaktifkan. Gunakan cetak atau simpan PDF.",
            503,
          );
        token = randomBytes(32).toString("hex");
        p = { id, hash: createHash("sha256").update(token).digest("hex") };
      } else p = { id };
    }
    const { data, error } = await s.db.rpc("kasir_action", { w, action, p });
    if (error) return errorReply(error);
    return send(token ? { ...data, path: "/struk/" + token } : data);
  } catch {
    return fail("Periksa nama, harga, jumlah barang, dan pembayaran.", 400);
  }
}
