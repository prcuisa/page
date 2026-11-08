import { postSafe, pinnedAgent } from "./outbound.mjs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
export function encryptionReady() {
  return /^[a-f0-9]{64}$/i.test(process.env.CONNECT_ENCRYPTION_KEY || "");
}
function key() {
  if (!encryptionReady()) throw Error("CONFIG_REQUIRED");
  return Buffer.from(process.env.CONNECT_ENCRYPTION_KEY, "hex");
}
export function seal(value) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  return [
    "v1",
    iv.toString("base64url"),
    Buffer.concat([c.update(value, "utf8"), c.final()]).toString("base64url"),
    c.getAuthTag().toString("base64url"),
  ].join(".");
}
export function open(value) {
  const [version, iv, data, tag] = value.split(".");
  if (
    version !== "v1" ||
    Buffer.from(tag || "", "base64url").length !== 16 ||
    Buffer.from(iv || "", "base64url").length !== 12
  )
    throw Error("INVALID_CIPHERTEXT");
  const c = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
    { authTagLength: 16 },
  );
  c.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    c.update(Buffer.from(data, "base64url")),
    c.final(),
  ]).toString("utf8");
}
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const challengeHash = (id, code) =>
  createHmac("sha256", key())
    .update(id + ":" + code)
    .digest("hex");
export function equal(a, b) {
  const x = Buffer.from(a || ""),
    y = Buffer.from(b || "");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function availability() {
  return {
    telegram:
      encryptionReady() &&
      !!process.env.TELEGRAM_BOT_TOKEN &&
      !!process.env.TELEGRAM_BOT_USERNAME &&
      !!process.env.TELEGRAM_WEBHOOK_SECRET,
    whatsapp:
      encryptionReady() && !!process.env.WAHA_URL && !!process.env.WAHA_API_KEY,
    email:
      encryptionReady() &&
      !!process.env.RESEND_API_KEY &&
      !!process.env.CONNECT_EMAIL_FROM,
    push:
      encryptionReady() &&
      !!process.env.VAPID_PUBLIC_KEY &&
      !!process.env.VAPID_PRIVATE_KEY &&
      !!process.env.VAPID_SUBJECT,
    webhook:
      encryptionReady() && process.env.CONNECT_WEBHOOK_ENABLED === "true",
  };
}
// Only operator-configured providers; never fetch user-supplied destinations.
export async function sendProvider(
  channel,
  destination,
  text,
  id,
  workspaceId = null,
) {
  if (channel === "webhook") {
    try {
      const target = JSON.parse(destination),
        timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({
        event_id: id,
        event_type: "connect.notification.ready.v1",
        workspace_id: workspaceId,
        timestamp,
        payload: { message: text },
      });
      const signature = createHmac("sha256", target.secret)
        .update(timestamp + "." + body)
        .digest("hex");
      const result = await postSafe(
        target.url,
        {
          "Content-Type": "application/json",
          "X-PRCUISA-Timestamp": timestamp,
          "X-PRCUISA-Signature": "sha256=" + signature,
          "X-PRCUISA-Delivery": id,
        },
        body,
      );
      return {
        accepted: result.status >= 200 && result.status < 300,
        retryable: result.status === 429 || result.status >= 500,
        errorCode: "HTTP_" + result.status,
      };
    } catch (e) {
      return {
        accepted: false,
        retryable: e.message !== "UNSAFE_DESTINATION",
        errorCode:
          e.message === "UNSAFE_DESTINATION"
            ? "UNSAFE_DESTINATION"
            : "NETWORK_ERROR",
      };
    }
  }
  if (channel === "push") {
    let agent;
    try {
      const subscription = JSON.parse(destination);
      ({ agent } = await pinnedAgent(subscription.endpoint));
      const webpush = (await import("web-push")).default;
      const r = await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "PRCUISA Connect",
          body: "Ada kabar baru dari bisnis kamu. Buka Hub untuk melihat detail.",
        }),
        {
          agent,
          timeout: 10000,
          TTL: 3600,
          vapidDetails: {
            subject: process.env.VAPID_SUBJECT,
            publicKey: process.env.VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY,
          },
        },
      );
      return {
        accepted: r.statusCode >= 200 && r.statusCode < 300,
        retryable: false,
      };
    } catch (e) {
      return {
        accepted: false,
        retryable:
          e.statusCode === 429 ||
          e.statusCode >= 500 ||
          (!e.statusCode && e.message !== "UNSAFE_DESTINATION"),
        errorCode:
          e.statusCode === 410 || e.statusCode === 404
            ? "SUBSCRIPTION_EXPIRED"
            : e.message === "UNSAFE_DESTINATION"
              ? "UNSAFE_DESTINATION"
              : "PUSH_ERROR",
      };
    } finally {
      agent?.destroy();
    }
  }
  let url,
    headers = { "Content-Type": "application/json" },
    body;
  if (channel === "telegram") {
    if (!process.env.TELEGRAM_BOT_TOKEN)
      return {
        accepted: false,
        retryable: false,
        errorCode: "CONFIG_REQUIRED",
      };
    url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    body = { chat_id: destination, text: text.slice(0, 4000) };
  } else if (channel === "whatsapp") {
    const base = new URL(process.env.WAHA_URL || "");
    if (base.protocol !== "https:") throw Error("WAHA_HTTPS_REQUIRED");
    url = new URL("/api/sendText", base);
    headers["X-Api-Key"] = process.env.WAHA_API_KEY;
    body = {
      session: process.env.WAHA_SESSION || "default",
      chatId: destination.replace(/^\+/, "") + "@c.us",
      text,
    };
  } else if (channel === "email") {
    url = "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${process.env.RESEND_API_KEY}`;
    headers["Idempotency-Key"] = id;
    body = {
      from: process.env.CONNECT_EMAIL_FROM,
      to: [destination],
      subject: "PRCUISA Connect",
      text,
    };
  } else
    return {
      accepted: false,
      retryable: false,
      errorCode: "UNSUPPORTED_CHANNEL",
    };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    const data = await r.json().catch(() => ({}));
    const accepted = r.ok && (channel !== "telegram" || data.ok === true);
    return {
      accepted,
      retryable: r.status === 429 || r.status >= 500,
      errorCode: accepted ? undefined : `PROVIDER_${r.status}`,
      providerMessageId: String(data.result?.message_id || data.id || ""),
      retryAfter: Math.min(
        3600,
        Number(
          data.parameters?.retry_after || r.headers.get("retry-after") || 0,
        ),
      ),
    };
  } catch {
    return { accepted: false, retryable: true, errorCode: "NETWORK_ERROR" };
  }
}
// Keep financial detail inside the authenticated Hub. External alerts contain no amounts.
export function renderNotice(payload) {
  return `PRCUISA Connect\n${payload.title || "Kabar bisnis"}\nLaporan atau notifikasi baru tersedia. Masuk ke PRCUISA untuk melihat detail.\n${(process.env.CONNECT_APP_URL || "https://app.prcuisa.com").replace(/\/$/, "")}/connect\nKelola atau nonaktifkan channel di halaman Connect.`;
}
