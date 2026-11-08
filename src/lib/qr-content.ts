import { z } from "zod";
import { qrSchema } from "./qr";
export const qrTypes = [
  "url",
  "text",
  "email",
  "phone",
  "sms",
  "whatsapp",
  "wifi",
  "vcard",
  "location",
  "event",
] as const;
export type QRType = (typeof qrTypes)[number];
export const typeLabels: Record<QRType, string> = {
  url: "URL",
  text: "Teks",
  email: "Email",
  phone: "Telepon",
  sms: "SMS",
  whatsapp: "WhatsApp",
  wifi: "WiFi",
  vcard: "vCard",
  location: "Lokasi",
  event: "Event",
};
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const styleSchema = z.object({
  dots: z.enum([
    "square",
    "rounded",
    "dots",
    "extra-rounded",
    "classy",
    "classy-rounded",
  ]),
  corner: z.enum(["square", "dot", "extra-rounded"]),
  eye: z.enum(["square", "dot"]),
  foreground: hex,
  background: hex,
  transparent: z.boolean(),
  gradient: z.boolean(),
  gradientColor: hex,
  gradientType: z.enum(["linear", "radial"]),
  rotation: z.number().min(0).max(360),
  size: z.number().int().min(256).max(2048),
  margin: z.number().int().min(0).max(100),
  ec: z.enum(["L", "M", "Q", "H"]),
  logo: z
    .string()
    .max(400000)
    .refine(
      (s) =>
        s === "" ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s),
    ),
  logoSize: z.number().min(0.1).max(0.3),
});
export const designSchema = z
  .object({
    type: z.enum(qrTypes),
    fields: z.record(z.string().max(40), z.string().max(2400)),
    style: styleSchema,
  })
  .strict();
export type QRStyle = z.infer<typeof styleSchema>;
export type QRDesign = z.infer<typeof designSchema>;
export const defaultStyle: QRStyle = {
  dots: "square",
  corner: "square",
  eye: "square",
  foreground: "#12141a",
  background: "#ffffff",
  transparent: false,
  gradient: false,
  gradientColor: "#006e76",
  gradientType: "linear",
  rotation: 0,
  size: 768,
  margin: 32,
  ec: "Q",
  logo: "",
  logoSize: 0.2,
};
export const emptyDesign = (): QRDesign => ({
  type: "url",
  fields: {},
  style: { ...defaultStyle },
});
const escaped = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function required(s: string, label: string) {
  if (!s.trim()) throw new Error(`Isi ${label} terlebih dahulu.`);
  return s.trim();
}
function phone(s: string) {
  const value = s.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(value))
    throw new Error("Isi nomor telepon yang valid, termasuk kode negara.");
  return value;
}
function email(s: string) {
  if (!z.email().safeParse(s.trim()).success)
    throw new Error("Alamat email belum valid.");
  return s.trim();
}
function http(s: string) {
  const r = qrSchema.safeParse(s);
  if (!r.success)
    throw new Error("Gunakan tautan lengkap http:// atau https://.");
  return r.data;
}
// Fold iCalendar/vCard lines by UTF-8 octets, preserving escaped content.
function fold(line: string) {
  let n = 0,
    out = "";
  for (const ch of line) {
    const bytes = new TextEncoder().encode(ch).length;
    if (n + bytes > 73) {
      out += "\r\n ";
      n = 1;
    }
    out += ch;
    n += bytes;
  }
  return out;
}
export function buildQRContent(design: QRDesign): string {
  const { type, fields: f } = designSchema.parse(design);
  const v = (key: string) => f[key] || "";
  let data = "";
  switch (type) {
    case "url":
      data = http(required(v("url"), "tautan tujuan"));
      break;
    case "text":
      data = required(v("text"), "teks");
      break;
    case "email": {
      const q = new URLSearchParams();
      if (v("subject")) q.set("subject", v("subject"));
      if (v("message")) q.set("body", v("message"));
      data =
        "mailto:" +
        email(v("email")) +
        (q.size ? "?" + q.toString().replace(/\+/g, "%20") : "");
      break;
    }
    case "phone":
      data = "tel:" + phone(v("phone"));
      break;
    case "sms":
      data =
        "sms:" +
        phone(v("phone")) +
        (v("message") ? "?body=" + encodeURIComponent(v("message")) : "");
      break;
    case "whatsapp": {
      let number = phone(v("phone"));
      if (number.startsWith("0")) number = "62" + number.slice(1);
      data =
        "https://wa.me/" +
        number.replace(/^\+/, "") +
        (v("message") ? "?text=" + encodeURIComponent(v("message")) : "");
      break;
    }
    case "wifi": {
      const ssid = required(v("ssid"), "nama jaringan");
      const encryption = ["WPA", "WEP", "nopass"].includes(v("encryption"))
        ? v("encryption")
        : "WPA";
      if (encryption !== "nopass") required(v("password"), "kata sandi WiFi");
      const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
      data = `WIFI:T:${encryption};S:${wifiEscape(ssid)};${encryption === "nopass" ? "" : `P:${wifiEscape(v("password"))};`}H:${v("hidden") === "true" ? "true" : "false"};;`;
      break;
    }
    case "vcard": {
      const first = required(v("first"), "nama depan"),
        last = v("last");
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escaped(last)};${escaped(first)};;;`,
        `FN:${escaped(first + " " + last)}`,
      ];
      for (const [key, label] of [
        ["org", "ORG"],
        ["job", "TITLE"],
        ["phone", "TEL"],
        ["email", "EMAIL"],
        ["website", "URL"],
      ] as const) {
        if (v(key)) {
          const val =
            key === "phone"
              ? phone(v(key))
              : key === "email"
                ? email(v(key))
                : key === "website"
                  ? http(v(key))
                  : v(key);
          lines.push(label + ":" + escaped(val));
        }
      }
      if (v("address")) lines.push("ADR:;;" + escaped(v("address")) + ";;;;");
      lines.push("END:VCARD");
      data = lines.map(fold).join("\r\n");
      break;
    }
    case "location": {
      const lat = Number(required(v("latitude"), "latitude")),
        lon = Number(required(v("longitude"), "longitude"));
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw new Error("Latitude harus -90–90 dan longitude -180–180.");
      data = `geo:${lat},${lon}`;
      break;
    }
    case "event": {
      const title = required(v("title"), "judul acara");
      const parse = (s: string) => {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))
          throw new Error("Isi waktu mulai dan selesai.");
        const date = new Date(s + ":00+07:00");
        if (
          !Number.isFinite(date.getTime()) ||
          new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !==
            s
        )
          throw new Error("Tanggal acara belum valid.");
        return date;
      };
      const start = parse(v("start")),
        end = parse(v("end"));
      if (end <= start)
        throw new Error("Waktu selesai harus setelah waktu mulai.");
      const stamp = (d: Date) =>
        d
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z");
      const uid = (v("uid") || "prcuisa-event").replace(/[^a-zA-Z0-9-]/g, "");
      data = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PRCUISA//QR Tools//ID",
        "BEGIN:VEVENT",
        "UID:" + uid + "@prcuisa.com",
        "DTSTAMP:" + stamp(start),
        "DTSTART:" + stamp(start),
        "DTEND:" + stamp(end),
        "SUMMARY:" + escaped(title),
        ...(v("location") ? ["LOCATION:" + escaped(v("location"))] : []),
        ...(v("description")
          ? ["DESCRIPTION:" + escaped(v("description"))]
          : []),
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .map(fold)
        .join("\r\n");
      break;
    }
  }
  if (new TextEncoder().encode(data).length > 1800)
    throw new Error("Konten terlalu panjang. Ringkas agar QR mudah dipindai.");
  return data;
}
export function contrast(a: string, b: string) {
  const luminance = (h: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
