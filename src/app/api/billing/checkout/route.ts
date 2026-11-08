import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const schema = z.object({
  workspace: z.uuid(),
  plan: z.enum(["pro", "business"]),
});

function midtransBase() {
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? {
        snap: "https://app.midtrans.com/snap/v1/transactions",
        api: "https://api.midtrans.com",
      }
    : {
        snap: "https://app.sandbox.midtrans.com/snap/v1/transactions",
        api: "https://api.sandbox.midtrans.com",
      };
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return fail("Permintaan tidak dapat diproses.", 403);
    if (!configured()) return fail("Layanan akun belum tersedia.", 503);
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return fail("Pembayaran belum diaktifkan.", 503);
    const body = schema.parse(await req.json());
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail("Silakan masuk kembali.", 401);
    const { data: order, error: orderError } = await db.rpc(
      "create_midtrans_payment",
      {
        p_workspace: body.workspace,
        p_plan: body.plan,
      },
    );
    if (
      orderError ||
      !order?.order_id ||
      !Number.isSafeInteger(Number(order.amount_idr))
    ) {
      return fail("Paket ini belum tersedia untuk dibeli.", 409);
    }
    const amount = Number(order.amount_idr);
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const credentials = Buffer.from(`${serverKey}:`).toString("base64");
    const { snap } = midtransBase();
    const provider = await fetch(snap, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        transaction_details: { order_id: order.order_id, gross_amount: amount },
        item_details: [
          {
            id: body.plan,
            price: amount,
            quantity: 1,
            name: `PRCUISA ${body.plan.toUpperCase()}`,
          },
        ],
        customer_details: user.email ? { email: user.email } : undefined,
        callbacks: { finish: `${siteUrl}/settings/billing?payment=checking` },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!provider.ok)
      return fail(
        "Pembayaran belum berhasil disiapkan. Silakan coba lagi.",
        502,
      );
    const result = await provider.json();
    if (
      typeof result.redirect_url !== "string" ||
      !(
        new URL(result.redirect_url).protocol === "https:" &&
        new URL(result.redirect_url).origin === new URL(snap).origin
      )
    ) {
      return fail(
        "Pembayaran belum berhasil disiapkan. Silakan coba lagi.",
        502,
      );
    }
    return NextResponse.json({ redirect_url: result.redirect_url });
  } catch {
    return fail("Pembayaran belum berhasil disiapkan. Silakan coba lagi.", 503);
  }
}
