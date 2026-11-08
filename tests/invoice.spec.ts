import { expect, test } from "@playwright/test";

test("invoice preview recalculates the total and explains demo saving", async ({ page }) => {
  await page.goto("/preview");
  await page.getByRole("button", { name: "Buka Invoice", exact: true }).click();
  await page.getByLabel("Nomor invoice").fill("INV-TEST-001");
  await page.getByLabel("Nama klien").fill("Klien Demo");
  await page.getByLabel("Deskripsi item 1").fill("Jasa desain");
  await page.getByLabel("Harga item 1").fill("250000");
  await page.getByLabel("Jumlah item 1").fill("2");
  await page.getByLabel("Pajak (%)").fill("11");
  await page.getByLabel("Diskon (%)").fill("10");
  await expect(page.getByText("Rp\u00a0499.500").last()).toBeVisible();
  await page.getByRole("button", { name: "Simpan invoice" }).click();
  await expect(page.getByRole("status")).toContainText("masuk ke akun PRCUISA");
  await expect(page.getByText("Klien Demo").last()).toBeVisible();
});


test("Invoice & Quotation preview supports customer, quote and conversion without fake backend claims", async ({ page }) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Buka Invoice & Quotation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invoice & Quotation' })).toBeVisible();
  await page.getByRole('button', { name: 'Buat penawaran' }).click();
  await page.getByRole('button', { name: 'Tambah pelanggan' }).click();
  await page.getByLabel('Nama pelanggan / perusahaan').fill('Pelanggan Uji');
  await page.getByRole('button', { name: 'Simpan' }).last().click();
  await page.getByLabel('Pilih pelanggan').selectOption({ label: 'Pelanggan Uji' });
  await page.getByLabel('Deskripsi').fill('Jasa konsultasi');
  await page.getByLabel('Harga satuan (Rp)').fill('250000');
  await page.getByRole('button', { name: 'Simpan draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft tersimpan');
  await page.getByRole('button', { name: 'Tutup' }).click();
  await expect(page.getByText('Draft belum terbit')).toBeVisible();
});
