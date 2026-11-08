import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import { nextReveal, periodDates } from "../src/lib/domain";
test("one Hub, two useful tools, favorites, requests, and retained business records", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Mau permudah apa hari ini?" }),
  ).toBeVisible();
  await expect(page.locator(".metric")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/hub-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Cari PRCUISA Tools").fill("invoice");
  await expect(
    page.getByText("Tool yang kamu cari belum tersedia."),
  ).toBeVisible();
  await page.getByLabel("Cari PRCUISA Tools").fill("laporan");
  await page
    .getByRole("button", { name: "Tambah favorit Business Report" })
    .click();
  await page
    .getByRole("button", { name: "Buka Business Report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hari Ini", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Catat Pemasukan", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Nominal" })).toBeFocused();
  await page.getByRole("textbox", { name: "Nominal" }).fill("250000");
  await page
    .getByRole("button", { name: "Simpan Pemasukan", exact: true })
    .click();
  await expect(page.locator(".metric").first()).toContainText("250.000");
  await page.getByRole("button", { name: "Pengeluaran", exact: true }).click();
  await page.getByRole("textbox", { name: "Nominal" }).fill("70000");
  await page
    .getByRole("button", { name: "Simpan Pengeluaran", exact: true })
    .click();
  await expect(page.locator(".metric-profit")).toContainText("180.000");
  await page.getByRole("button", { name: "Pemasukan", exact: true }).click();
  await page.getByRole("textbox", { name: "Nominal" }).fill("0");
  await page
    .getByRole("button", { name: "Simpan Pemasukan", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Kembali ke Hub", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lanjutkan aktivitasmu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tools favorit" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Buka QR Tools", exact: true })
    .click();
  await page.getByLabel("Tautan tujuan").fill("https://prcuisa.com/menu");
  await page.getByRole("button", { name: "Buat QR", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unduh PNG" })).toBeEnabled();
  const pixels = await page
    .locator(".qr-output img")
    .evaluate((img: HTMLImageElement) => {
      const c = document.createElement("canvas");
      c.width = 768;
      c.height = 768;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 768, 768);
      return Array.from(ctx.getImageData(0, 0, 768, 768).data);
    });
  expect(jsQR(new Uint8ClampedArray(pixels), 768, 768)?.data).toBe(
    "https://prcuisa.com/menu",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PNG" }).click();
  expect((await download).suggestedFilename()).toBe("prcuisa-qr.png");
  await page.screenshot({
    path: `test-results/qr-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Kembali ke Hub", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Buka Business Report", exact: true })
    .first()
    .click();
  await expect(page.locator(".metric-profit")).toContainText("180.000");
  await page.getByRole("button", { name: "Ringkasan", exact: true }).click();
  await page.getByLabel("Periode laporan").selectOption("all");
  await expect(page.locator(".metric").first()).toContainText("250.000");
  await page.getByRole("button", { name: "Catatan", exact: true }).click();
  await expect(page.locator(".activity-item")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Kembali ke Hub", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("belum dapat digunakan");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Minta Tool", exact: true }).click();
  await page
    .getByLabel("Pekerjaan atau masalah yang ingin dibantu")
    .fill("Saya perlu mengingatkan pembayaran pelanggan setiap minggu.");
  await page
    .getByRole("button", { name: "Kirim Permintaan", exact: true })
    .click();
  await expect(page.locator(".request-row")).toContainText("Diterima");
  const nav = page.getByRole("navigation", {
    name:
      info.project.name === "mobile" ? "Navigasi Hub mobile" : "Navigasi Hub",
    exact: true,
  });
  await nav.getByRole("button", { name: "Aktivitas", exact: true }).click();
  await expect(page.locator(".platform-activity")).toContainText(
    "Permintaan tool dikirim",
  );
  await nav.getByRole("button", { name: "Akun", exact: true }).click();
  await page.getByRole("button", { name: "Paket & akses" }).click();
  await expect(
    page.getByText("Mode preview tidak memulai pembayaran.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Lanjutkan aktivitasmu" }),
  ).toHaveCount(0);
});
test("preview can inspect a sample dashboard without saving example data", async ({
  page,
}) => {
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Buka Business Report", exact: true })
    .click();
  await page.getByRole("button", { name: "Lihat contoh dashboard" }).click();
  await expect(page.locator(".metric").first()).toContainText("250.000");
  await expect(page.locator(".metric").nth(1)).toContainText("70.000");
  await expect(page.locator(".metric-profit")).toContainText("180.000");
  await expect(page.getByText("Contoh pemasukan hari ini")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Buka Business Report", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lihat contoh dashboard" }),
  ).toBeVisible();
  await expect(page.locator(".metric")).toHaveCount(0);
});
test("business onboarding leads to the ecosystem launcher", async ({
  page,
}) => {
  await page.goto("/preview/onboarding");
  await page.getByLabel("Nama bisnis", { exact: true }).fill("Warung Bu Sari");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: "Buat Bisnis", exact: true }).click();
  await page.getByRole("button", { name: "Jelajahi PRCUISA Tools" }).click();
  await expect(
    page.getByRole("heading", { name: "Mau permudah apa hari ini?" }),
  ).toBeVisible();
  await expect(page.locator(".topbar")).toContainText("Warung Bu Sari");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("public SEO, reset-password and protected boundaries", async ({
  page,
  request,
}) => {
  await page.goto("/products/business-report");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://prcuisa.com/products/business-report",
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("meta[name=robots]")).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.getByRole("link", { name: "Lupa kata sandi?" }).click();
  await expect(
    page.getByRole("heading", { name: "Lupa kata sandi?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pemulihan akun belum tersedia di preview ini."),
  ).toBeVisible();
  expect((await request.get("/api/hub")).status()).toBe(503);
  expect(
    (
      await request.post("/api/hub", {
        data: { action: "workspace", name: "Test" },
      })
    ).status(),
  ).toBe(403);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/dashboard",
  );
});
test("reveal eligibility uses actual history, never report-page count", () => {
  expect(
    nextReveal({ record_count: 0, active_days: 0, recent_count: 0 }),
  ).toBeNull();
  expect(
    nextReveal({ record_count: 1, active_days: 1, recent_count: 1 })?.key,
  ).toBe("close-day");
  expect(
    nextReveal({ record_count: 3, active_days: 1, recent_count: 3 })?.key,
  ).toBe("insight");
  expect(
    nextReveal({ record_count: 3, active_days: 3, recent_count: 3 })?.key,
  ).toBe("trends");
  expect(
    nextReveal({ record_count: 20, active_days: 2, recent_count: 20 })?.key,
  ).toBe("chat");
  expect(
    nextReveal({ record_count: 40, active_days: 7, recent_count: 20 })?.key,
  ).toBe("daily-report");
  expect(
    nextReveal({ record_count: 60, active_days: 14, recent_count: 10 })?.key,
  ).toBe("assistant");
  expect(
    nextReveal({ record_count: 120, active_days: 30, recent_count: 10 })?.key,
  ).toBe("automation");
  expect(periodDates("today", "2026-10-07").start).toBe("2026-10-07");
});
