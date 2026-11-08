import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
const noticeSchema = z.object({
  order_id: z.string().regex(/^PRC-[a-f0-9]{32}$/),
});
function endpoints() {
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

export async function POST(req: NextRequest) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serverKey || !serviceKey || !supabaseUrl)
    return NextResponse.json(
      { error: "Webhook belum dikonfigurasi." },
      { status: 503 },
    );
  try {
    const { order_id } = noticeSchema.parse(await req.json());
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/payments?order_id=eq.${encodeURIComponent(order_id)}&select=order_id,amount_idr&limit=1`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store",
      },
    );
    if (!lookup.ok)
      return NextResponse.json(
        { error: "Pembayaran belum berhasil diperiksa." },
        { status: 503 },
      );
    const [savedOrder] = z
      .array(z.object({ order_id: z.string(), amount_idr: z.number() }))
      .parse(await lookup.json());
    if (!savedOrder)
      return NextResponse.json(
        { error: "Pesanan tidak ditemukan." },
        { status: 200 },
      );
    // Never grant access from the notification payload; retrieve the current,
    // merchant-authenticated order status directly from Midtrans instead.
    const auth = Buffer.from(`${serverKey}:`).toString("base64");
    const response = await fetch(
      `${endpoints()}/v2/${encodeURIComponent(order_id)}/status`,
      {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!response.ok)
      return NextResponse.json(
        { error: "Status transaksi belum dapat diverifikasi." },
        { status: 502 },
      );
    const verified = z
      .object({
        order_id: z.string(),
        gross_amount: z.string(),
        transaction_status: z.string(),
        fraud_status: z.string().optional(),
        transaction_id: z.string().optional(),
        payment_type: z.string().optional(),
      })
      .parse(await response.json());
    if (verified.order_id !== order_id)
      return NextResponse.json(
        { error: "Transaksi tidak cocok." },
        { status: 400 },
      );
    const amount = Number(verified.gross_amount);
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount !== savedOrder.amount_idr
    )
      return NextResponse.json(
        { error: "Nominal transaksi tidak cocok." },
        { status: 400 },
      );
    const result = await fetch(
      `${supabaseUrl}/rest/v1/rpc/apply_midtrans_notification`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order_id: order_id,
          p_amount_idr: amount,
          p_transaction_status: verified.transaction_status,
          p_fraud_status: verified.fraud_status || "",
          p_transaction_id: verified.transaction_id || null,
          p_payment_method: verified.payment_type || null,
        }),
        cache: "no-store",
      },
    );
    if (!result.ok)
      return NextResponse.json(
        { error: "Notifikasi belum berhasil diproses." },
        { status: 502 },
      );
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Notifikasi transaksi tidak valid." },
      { status: 400 },
    );
  }
}
