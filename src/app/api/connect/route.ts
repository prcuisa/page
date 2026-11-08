import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  foundationSession,
  foundationBody,
  foundationError,
} from "@/lib/foundation-server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const s = await foundationSession();
    if ("error" in s) return s.error;
    const body = await foundationBody(req);
    const w = z.uuid().parse(body.workspace);
    const action = z
      .enum(["read_state", "save", "preview", "test", "read"])
      .parse(body.action);
    let p = {};
    if (action === "save")
      p = z
        .object({
          enabled: z.boolean(),
        immediate_enabled: z.boolean().default(false),
          domains: z
            .array(z.enum(["sales", "finance", "invoice", "qr"]))
            .max(4),
          local_time: z.string().regex(/^\d{2}:\d{2}$/),
          timezone: z.string().max(80),
        })
        .parse(body.payload);
    if (action === "read")
      p = z.object({ id: z.uuid().optional() }).parse(body.payload || {});
    const { data, error } = await s.db.rpc("connect_action", { w, action, p });
    if (error) return foundationError(error);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return foundationError({});
  }
}
