import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function createQuotation(page:Page) {
  await page.goto('/preview/invoice-quotation');
  await page.getByRole('button',{name:'Buat penawaran',exact:true}).click();
  await page.getByRole('button',{name:'Tambah pelanggan'}).click();
  await page.getByLabel('Nama pelanggan / perusahaan').fill('Pelanggan Uji');
  await page.getByLabel('Email',{exact:true}).fill('pelanggan@example.test');
  await page.getByLabel('Telepon',{exact:true}).fill('081234567890');
  await page.getByRole('button',{name:'Simpan',exact:true}).last().click();
  await page.getByRole('combobox',{name:'Pilih pelanggan',exact:true}).selectOption({label:'Pelanggan Uji'});
  await page.getByLabel('Deskripsi',{exact:true}).fill('Jasa konsultasi');
  await page.getByLabel('Harga satuan (Rp)').fill('50000');
  await page.getByRole('button',{name:'Simpan draft',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Draft tersimpan'})).toBeVisible();
  await page.getByRole('button',{name:'Tutup',exact:true}).click();
  await page.getByRole('button',{name:'Lihat',exact:true}).click();
  await page.getByRole('button',{name:'Terbitkan',exact:true}).click();
  await expect(page.getByRole('heading',{name:/DEMO-QT-/})).toBeVisible();
  await page.getByRole('button',{name:'PDF & bagikan',exact:true}).click();
  await expect(page.getByRole('button',{name:'Unduh PDF',exact:true})).toBeVisible();
}

test('quotation PDF works in demo, sharing retains user activation and cancellation is quiet', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'canShare',{value:() => true,configurable:true});
    Object.defineProperty(navigator,'share',{value:async (data:ShareData) => {
      (window as any).shared={name:data.files?.[0]?.name,type:data.files?.[0]?.type,size:data.files?.[0]?.size,text:data.text,active:navigator.userActivation.isActive};
      if((window as any).cancelShare) throw new DOMException('Cancelled','AbortError');
    },configurable:true});
  });
  await createQuotation(page);
  const modal=page.getByRole('dialog');
  const box=await modal.boundingBox();
  expect(Math.abs(box!.x+box!.width/2-195)).toBeLessThan(2);
  expect(Math.abs(box!.y+box!.height/2-422)).toBeLessThan(2);
  if(process.env.PRCUISA_UI_CAPTURE==='true') await page.screenshot({path:'/tmp/prcuisa-quotation-share-mobile.png',fullPage:true});
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Unduh PDF',exact:true}).click();
  const saved=await download;
  expect(saved.suggestedFilename()).toMatch(/^DEMO-QT-.*\.pdf$/);
  const bytes=await readFile((await saved.path())!);
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
  await page.getByRole('button',{name:'Bagikan PDF',exact:true}).click();
  const shared=await page.evaluate(() => (window as any).shared);
  expect(shared.type).toBe('application/pdf');
  expect(shared.size).toBeGreaterThan(500);
  expect(shared.active).toBe(true);
  expect(shared.text).toContain('penawaran');
  await page.evaluate(() => {(window as any).cancelShare=true;});
  await page.getByRole('button',{name:'Bagikan PDF',exact:true}).click();
  await expect(page.locator('.iq-share-error')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('unsupported file sharing offers an honest WhatsApp/email attachment fallback',async({page}) => {
  await page.setViewportSize({width:360,height:800});
  await page.addInitScript(() => {Object.defineProperty(navigator,'canShare',{value:() => false,configurable:true});});
  await createQuotation(page);
  await expect(page.getByRole('button',{name:'Bagikan PDF',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Buka WhatsApp',exact:true})).toHaveAttribute('href',/wa\.me\/6281234567890\?text=/);
  await expect(page.getByRole('link',{name:'Buka email',exact:true})).toHaveAttribute('href',/^mailto:pelanggan%40example\.test\?subject=/);
  await expect(page.getByText('PDF akan diunduh, lalu pesan baru dibuka. Lampirkan PDF tersebut sebelum mengirim.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [360,390,768,1440]) {
  test(`admin navigation and tool filtering fit ${width}px`,async({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/preview/admin');
    await expect(page.getByRole('heading',{name:'Ringkasan',exact:true})).toBeVisible();
    if(process.env.PRCUISA_UI_CAPTURE==='true' && width===390) await page.screenshot({path:'/tmp/prcuisa-admin-overview-mobile.png',fullPage:true});
    if(width<=760) await page.getByLabel('Bagian Admin Console').selectOption('tools');
    else await page.getByRole('navigation',{name:'Bagian admin'}).getByRole('button',{name:'Tools',exact:true}).click();
    await page.getByLabel('Cari tool admin').fill('QR Tools');
    await expect(page.locator('.admin-tool-summary strong')).toHaveText(['QR Tools']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const status=page.getByLabel('Status tool admin');
    expect(await status.evaluate(el => getComputedStyle(el).paddingRight)).toBe('46px');
  });
}

for(const width of [360,768,1440]) {
  test(`main preview routes avoid page overflow at ${width}px`,async({page}) => {
    await page.setViewportSize({width,height:900});
    for(const route of ['/preview','/preview/qr','/preview/kasir-pinter','/preview/connect','/preview/invoice-quotation','/login']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),route).toBe(true);
    }
  });
}
