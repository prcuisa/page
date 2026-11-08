import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import {
  buildQRContent,
  emptyDesign,
  type QRType,
} from "../src/lib/qr-content";
const payload = (type: QRType, fields: Record<string, string>) =>
  buildQRContent({ ...emptyDesign(), type, fields });
test("ten content formats validate and escape actual QR payloads", () => {
  expect(payload("url", { url: "https://prcuisa.com/menu" })).toBe(
    "https://prcuisa.com/menu",
  );
  expect(payload("text", { text: "Kopi ☕ — siap!" })).toBe("Kopi ☕ — siap!");
  expect(
    payload("email", {
      email: "hello@example.com",
      subject: "Pesan & kopi",
      message: "Halo\nPagi",
    }),
  ).toBe(
    "mailto:hello@example.com?subject=Pesan%20%26%20kopi&body=Halo%0APagi",
  );
  expect(payload("phone", { phone: "+62 812-3456-7890" })).toBe(
    "tel:+6281234567890",
  );
  expect(
    payload("sms", { phone: "+6281234567890", message: "Halo & pagi" }),
  ).toBe("sms:+6281234567890?body=Halo%20%26%20pagi");
  expect(
    payload("whatsapp", { phone: "081234567890", message: "Pesan kopi" }),
  ).toBe("https://wa.me/6281234567890?text=Pesan%20kopi");
  expect(
    payload("wifi", {
      ssid: "Toko;Satu",
      password: "abc:def",
      encryption: "WPA",
      hidden: "true",
    }),
  ).toBe("WIFI:T:WPA;S:Toko\\;Satu;P:abc\\:def;H:true;;");
  expect(payload("wifi", { ssid: "Tamu", encryption: "nopass" })).not.toContain(
    "P:",
  );
  const vc = payload("vcard", {
    first: "Sari",
    last: "Usaha",
    org: "Warung\nEND:VCARD",
    phone: "+6281234567890",
  });
  expect(vc).toContain("N:Usaha;Sari;;;");
  expect(vc).toContain("ORG:Warung\\nEND:VCARD");
  expect(vc.split("\r\nEND:VCARD")).toHaveLength(2);
  expect(payload("location", { latitude: "-6.2", longitude: "106.8" })).toBe(
    "geo:-6.2,106.8",
  );
  const event = payload("event", {
    title: "Buka; Toko",
    start: "2026-10-08T09:00",
    end: "2026-10-08T10:00",
    uid: "unit-test",
  });
  expect(event).toContain("DTSTART:20261008T020000Z");
  expect(event).toContain("SUMMARY:Buka\\; Toko");
  expect(() => payload("url", { url: "javascript:alert(1)" })).toThrow();
  expect(() =>
    payload("location", { latitude: "91", longitude: "0" }),
  ).toThrow();
  expect(() =>
    payload("event", {
      title: "a",
      start: "2026-10-08T10:00",
      end: "2026-10-08T09:00",
    }),
  ).toThrow();
  expect(() =>
    payload("event", {
      title: "a",
      start: "2026-02-30T10:00",
      end: "2026-03-01T11:00",
    }),
  ).toThrow();
});
test("custom QR renders, decodes, exports four formats and reopens saved design", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Buka QR Tools", exact: true })
    .click();
  const types = page.getByRole("group", { name: "Tipe konten" });
  await types.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.getByLabel("Nomor WhatsApp").fill("081234567890");
  await page.getByLabel("Pesan WhatsApp").fill("Pesan kopi");
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  async function decode() {
    const p = await page
      .locator(".qr-output img")
      .evaluate((img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        return {
          width: c.width,
          height: c.height,
          pixels: Array.from(ctx.getImageData(0, 0, c.width, c.height).data),
        };
      });
    return jsQR(new Uint8ClampedArray(p.pixels), p.width, p.height)?.data;
  }
  expect(await decode()).toBe("https://wa.me/6281234567890?text=Pesan%20kopi");
  await page.getByRole("button", { name: "Bulat", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Warna piksel", exact: true })
    .selectOption("gradient");
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  expect(await decode()).toBe("https://wa.me/6281234567890?text=Pesan%20kopi");
  await page.getByLabel("Nama QR", { exact: true }).fill("QR-Warung");
  for (const format of ["PNG", "SVG", "JPEG", "WEBP"]) {
    const wait = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Unduh " + format, exact: true })
      .click();
    const d = await wait;
    expect(d.suggestedFilename()).toBe("QR-Warung." + format.toLowerCase());
    const bytes = await readFile((await d.path())!);
    if (format === "PNG") expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    if (format === "SVG") expect(bytes.toString()).toContain("<svg");
    if (format === "JPEG")
      expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
    if (format === "WEBP")
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
  }
  await page
    .getByRole("button", { name: "Simpan ke akun", exact: true })
    .click();
  await expect(page.locator(".qr-saved")).toContainText("QR-Warung");
  await types.getByRole("button", { name: "WiFi", exact: true }).click();
  await page.getByLabel("Nama jaringan (SSID)").fill("Toko;Satu");
  await page.getByLabel("Kata sandi WiFi").fill("abc:def");
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  expect(await decode()).toBe("WIFI:T:WPA;S:Toko\\;Satu;P:abc\\:def;H:false;;");
  await types.getByRole("button", { name: "Teks", exact: true }).click();
  await page.getByLabel("Teks QR").fill("Kopi ☕ — siap!");
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  expect(await decode()).toBe("Kopi ☕ — siap!");
  await page.getByRole("button", { name: "Buka desain", exact: true }).click();
  await expect(
    types.getByRole("button", { name: "WhatsApp", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Pesan WhatsApp")).toHaveValue("Pesan kopi");
  // A logo fixture verifies raster handling and forced H without uploading private data.
  await page
    .getByLabel("Unggah logo")
    .setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1EAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(
    page.getByRole("combobox", { name: "Koreksi error", exact: true }),
  ).toHaveValue("H");
  await expect(
    page.getByRole("combobox", { name: "Koreksi error", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  expect(await decode()).toBe("https://wa.me/6281234567890?text=Pesan%20kopi");
  await page.getByRole("button", { name: "Hapus logo" }).click();
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/qr-studio-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
