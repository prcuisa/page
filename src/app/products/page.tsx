import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-shell";
export const metadata = {
  title: "Tools Praktis untuk Bisnis",
  description:
    "Kenali Business Report, QR Tools, dan Invoice untuk kebutuhan bisnis sehari-hari. Satu PRCUISA ID menghubungkan tools ini.",
  alternates: { canonical: "/products" },
  openGraph: {
    title: "PRCUISA Tools",
    description: "Tools bisnis yang berguna, satu akun PRCUISA.",
    url: "/products",
  },
};
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main id="main" className="public-main">
        <span className="eyebrow">PRCUISA TOOLS</span>
        <h1>Pilih berdasarkan kebutuhanmu.</h1>
        <p className="public-intro">
          Mulai dari pekerjaan yang ingin kamu permudah. Semua tools ini menggunakan
          PRCUISA ID dan bisnis yang sama.
        </p>
        <section className="public-columns">
          <article>
            <h2>Business Report</h2>
            <p>
              Untuk pemilik usaha yang ingin tahu uang masuk, uang keluar, dan
              selisihnya. Catat aktivitas harian lalu lihat ringkasan per
              periode, tanpa menghitung manual.
            </p>
            <p>
              Termasuk akses Free. Bukan pengganti pembukuan atau laporan pajak.
            </p>
            <Link href="/products/business-report">
              Cara kerja Business Report →
            </Link>
          </article>
          <article>
            <h2>QR Tools</h2>
            <p>
              Untuk membagikan menu, katalog, toko, atau halaman bisnis.
              Masukkan tautan dan unduh QR sebagai PNG untuk digunakan secara
              digital atau dicetak.
            </p>
            <p>
              Termasuk akses Free. QR statis tanpa pelacakan jumlah pemindaian.
            </p>
            <Link href="/products/qr-tools">Cara kerja QR Tools →</Link>
          </article>
          <article>
            <h2>Invoice</h2>
            <p>Buat invoice untuk klien, hitung item, diskon, dan pajak, lalu cetak atau simpan sebagai PDF.</p>
            <p>Invoice tersimpan bersama bisnis di PRCUISA Hub.</p>
            <Link href="/products/invoice">Cara kerja Invoice →</Link>
          </article>
        </section>
        <section className="public-bottom">
          <h2>Belum menemukan yang kamu butuhkan?</h2>
          <p>
            Masuk ke Hub dan pilih Minta Tool. Ceritakan masalah dan pekerjaanmu
            saat ini; tidak perlu menulis spesifikasi teknis.
          </p>
          <Link className="button primary" href="/signup">
            Buat PRCUISA ID
          </Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
