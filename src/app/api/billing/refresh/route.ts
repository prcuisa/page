import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  workspace: z.uuid(),
  order_id: z.string().regex(/^PRC-[a-f0-9]{32}$/),
});
const reply = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const midtransApi = () =>
  process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return reply("Permintaan tidak dapat diproses.", 403);
  if (!configured()) return reply("Layanan akun belum tersedia.", 503);
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serverKey || !serviceKey || !supabaseUrl)
    return reply("Pemeriksaan pembayaran belum tersedia.", 503);
  try {
    const body = bodySchema.parse(await req.json());
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return reply("Silakan masuk kembali.", 401);
    const { data: payment, error } = await db
      .from("payments")
      .select("order_id,amount_idr")
      .eq("order_id", body.order_id)
      .eq("workspace_id", body.workspace)
      .maybeSingle();
    if (error || !payment) return reply("Pembayaran tidak ditemukan.", 404);
    const credentials = Buffer.from(`${serverKey}:`).toString("base64");
    const response = await fetch(
      `${midtransApi()}/v2/${encodeURIComponent(payment.order_id)}/status`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok)
      return reply(
        "Status pembayaran belum tersedia. Coba lagi sebentar.",
        503,
      );
    const provider = z
      .object({
        order_id: z.string(),
        gross_amount: z.string(),
        transaction_status: z.string(),
        fraud_status: z.string().optional(),
        transaction_id: z.string().optional(),
        payment_type: z.string().optional(),
      })
      .parse(await response.json());
    const amount = Number(provider.gross_amount);
    if (
      provider.order_id !== payment.order_id ||
      !Number.isSafeInteger(amount) ||
      amount !== payment.amount_idr
    )
      return reply("Detail pembayaran tidak cocok.", 400);
    const applied = await fetch(
      `${supabaseUrl}/rest/v1/rpc/apply_midtrans_notification`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order_id: payment.order_id,
          p_amount_idr: amount,
          p_transaction_status: provider.transaction_status,
          p_fraud_status: provider.fraud_status || "",
          p_transaction_id: provider.transaction_id || null,
          p_payment_method: provider.payment_type || null,
        }),
        cache: "no-store",
      },
    );
    if (!applied.ok) return reply("Status belum berhasil diperbarui.", 503);
    return NextResponse.json({ received: true });
  } catch {
    return reply("Status pembayaran belum berhasil diperiksa.", 400);
  }
}
