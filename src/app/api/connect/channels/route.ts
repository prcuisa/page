import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import {
  foundationSession,
  foundationBody,
  fail,
  foundationError,
} from "@/lib/foundation-server";
import { connectDatabase } from "@/features/connect/server/database";
import { destination as validateDestination } from "@/features/connect/server/outbound.mjs";
import {
  availability,
  seal,
  digest,
  challengeHash,
  sendProvider,
} from "@/features/connect/server/providers.mjs";
export const dynamic = "force-dynamic";
const reply = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: NextRequest) {
  try {
    const session = await foundationSession();
    if ("error" in session) return session.error;
    const b = await foundationBody(req),
      w = z.uuid().parse(b.workspace);
    const action = z
      .enum(["state", "start", "verify", "disconnect", "test"])
      .parse(b.action);
    const { data: rows, error } = await session.db.rpc(
      "connect_connections_read",
      { w },
    );
    if (error) return foundationError(error);
    if (action === "state")
      return reply({
        connections: rows,
        available: availability(),
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      });
    const c = z
      .enum(["telegram", "whatsapp", "email", "push", "webhook"])
      .parse(b.channel);
    if (action === "disconnect" || action === "test") {
      const id = z.uuid().parse(b.id);
      const { error } = await session.db.rpc(
        action === "disconnect" ? "connect_disconnect" : "connect_channel_test",
        { w, c: id },
      );
      return error ? foundationError(error) : reply({ ok: true });
    }
    if (!availability()[c])
      return fail("Channel ini belum diaktifkan oleh PRCUISA.", 503);
    const db = connectDatabase();
    if (action === "verify") {
      const id = z.uuid().parse(b.id);
      if (
        !rows.some(
          (x: { id: string; channel: string }) =>
            x.id === id && x.channel === c,
        ) ||
        c === "telegram"
      )
        return fail("Koneksi tidak tersedia.", 403);
      const code = z
        .string()
        .regex(/^\d{6}$/)
        .parse(b.code);
      const { data, error } = await db.rpc("connect_verify", {
        ident: id,
        u: session.user.id,
        hash: challengeHash(id, code),
      });
      if (error || !data)
        return fail(
          "Kode tidak sesuai atau kedaluwarsa. Maksimal 5 percobaan.",
        );
      return reply({ ok: true });
    }
    if (b.consent !== true) return fail("Persetujuan diperlukan.");
    const id = randomUUID(),
      token = randomBytes(24).toString("hex"),
      code = String(randomInt(100000, 1000000));
    let destination = "";
    let webhookSecret: string | undefined;
    if (c === "push") {
      const subscription = z
        .object({
          endpoint: z.url().max(2000),
          keys: z.object({
            auth: z.string().min(16).max(100),
            p256dh: z.string().min(50).max(200),
          }),
        })
        .parse(b.subscription);
      await validateDestination(subscription.endpoint);
      destination = JSON.stringify(subscription);
    }
    if (c === "webhook") {
      const endpoint = z.url().max(512).parse(b.destination);
      await validateDestination(endpoint);
      webhookSecret = randomBytes(32).toString("hex");
      destination = JSON.stringify({ url: endpoint, secret: webhookSecret });
    }
    if (c === "email")
      destination = z.email().max(254).parse(b.destination).toLowerCase();
    if (c === "whatsapp")
      destination = z
        .string()
        .regex(/^\+[1-9]\d{7,14}$/)
        .parse(b.destination);
    const { error: startError } = await db.rpc("connect_start", {
      u: session.user.id,
      w,
      c,
      ident: id,
      hash: c === "telegram" ? digest(token) : challengeHash(id, code),
      dest: destination ? seal(destination) : null,
      lookup_hash: destination ? digest(destination) : null,
    });
    if (startError) return foundationError(startError);
    if (c === "push" || c === "webhook") {
      const { data, error } = await db.rpc("connect_verify", {
        ident: id,
        u: session.user.id,
        hash: challengeHash(id, code),
      });
      if (error || !data) return fail("Koneksi belum berhasil diverifikasi.");
      return reply({ id, verified: true, secret: webhookSecret });
    }
    if (c === "telegram")
      return reply({
        id,
        url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`,
      });
    const result = await sendProvider(
      c,
      destination,
      `Kode verifikasi PRCUISA Connect: ${code}. Berlaku 10 menit. Jangan bagikan kode ini. Abaikan jika kamu tidak meminta.`,
      id,
    );
    if (!result.accepted) {
      await session.db.rpc("connect_disconnect", { w, c: id });
      return fail("Kode belum berhasil dikirim. Coba lagi nanti.", 502);
    }
    return reply({ id, message: "Kode verifikasi dikirim." });
  } catch {
    return fail("Periksa isian atau konfigurasi channel.");
  }
}
