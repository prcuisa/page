import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-shell";
export const metadata = {
  title: "QR Tools Custom untuk Tautan, WiFi & Kontak",
  description:
    "Buat QR custom untuk URL, teks, WhatsApp, WiFi, kontak, lokasi, dan acara. Atur warna serta logo, lalu ekspor PNG, SVG, JPEG, atau WebP.",
  alternates: { canonical: "/products/qr-tools" },
  openGraph: {
    title: "QR Tools | PRCUISA",
    description: "Tautan bisnis, lebih mudah dibagikan.",
    url: "/products/qr-tools",
  },
};
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main id="main" className="public-main">
        <span className="eyebrow">PRCUISA QR TOOLS</span>
        <h1>
          Tautan bisnis,
          <br />
          <em>lebih mudah dibagikan.</em>
        </h1>
        <p className="public-intro">
          Buat QR untuk URL, teks, email, telepon, SMS, WhatsApp, WiFi, vCard,
          lokasi, dan acara. Gunakan PRCUISA ID yang sama seperti Business
          Report.
        </p>
        <div className="public-actions">
          <Link className="button primary" href="/signup">
            Mulai dengan PRCUISA ID
          </Link>
          <Link className="button secondary" href="/preview/qr">
            Coba QR Tools
          </Link>
        </div>
        <section className="public-columns">
          <article>
            <h2>1. Pilih konten.</h2>
            <p>
              Pilih salah satu dari 10 jenis QR, lalu isi informasi yang
              dibutuhkan. Tidak perlu menyusun format QR sendiri.
            </p>
          </article>
          <article>
            <h2>2. Sesuaikan desain.</h2>
            <p>
              Atur bentuk piksel dan sudut, warna solid atau gradien, latar
              transparan, logo, ukuran, margin, dan koreksi error. Pratinjau
              diperbarui otomatis.
            </p>
          </article>
          <article>
            <h2>3. Unduh & periksa.</h2>
            <p>
              Ekspor PNG, SVG, JPEG, atau WebP. Pindai hasilnya dengan ponsel
              sebelum dibagikan atau dicetak. QR statis tidak bisa diubah
              setelah tersebar.
            </p>
          </article>
        </section>
        <section className="public-bottom">
          <h2>Apa yang termasuk?</h2>
          <p>
            Editor custom dan ekspor tersedia dalam akses QR Tools. Simpan
            konten dan desain melalui PRCUISA ID untuk menggunakannya lagi.
            Preview menyimpan hanya selama sesi; penyimpanan akun membutuhkan
            layanan akun aktif. Tidak ada QR dinamis atau statistik pemindaian.
          </p>
          <h2>Satu akun untuk kebutuhan berikutnya.</h2>
          <p>
            Kembali ke Hub untuk membuka Business Report atau meminta tool baru,
            tanpa membuat identitas terpisah.
          </p>
          <Link href="/products/business-report">Kenali Business Report →</Link>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "PRCUISA QR Tools",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://prcuisa.com/products/qr-tools",
              description:
                "Buat QR custom untuk 10 jenis konten dengan warna, logo, dan ekspor PNG, SVG, JPEG, WebP.",
            }),
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
