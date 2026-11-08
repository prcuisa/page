import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDatabase } from "@/features/connect/server/database";
import { equal, digest, seal } from "@/features/connect/server/providers.mjs";
export async function POST(req: NextRequest) {
  if (
    !equal(
      req.headers.get("x-telegram-bot-api-secret-token"),
      process.env.TELEGRAM_WEBHOOK_SECRET,
    )
  )
    return new NextResponse(null, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 16000) return new NextResponse(null, { status: 413 });
    const update = JSON.parse(raw);
    const message = update.message;
    if (message?.chat?.type !== "private")
      return NextResponse.json({ ok: true });
    const token = /^\/start\s+([a-f0-9]{48})$/.exec(message.text || "")?.[1];
    if (!token) return NextResponse.json({ ok: true });
    const chat = String(
      z.number().int().positive().safe().parse(message.chat.id),
    );
    const db = connectDatabase();
    const { data: id, error } = await db.rpc("connect_pending", {
      hash: digest(token),
    });
    if (error) throw error;
    if (id) {
      const { error } = await db.rpc("connect_verify", {
        ident: id,
        u: null,
        hash: digest(token),
        dest: seal(chat),
        lookup_hash: digest(chat),
      });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
