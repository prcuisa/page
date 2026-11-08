import Link from "next/link";
import { ReceiptText, QrCode, MessageSquarePlus } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public-shell";
import PublicUsageProof from "@/components/public-usage-proof";
export const metadata = {
  title: "Satu PRCUISA ID, Banyak Tools Bisnis",
  description:
    "Satu akun untuk tools yang bisnis kamu butuhkan. Catat usaha dengan Business Report, buat QR, dan ajukan kebutuhan tool berikutnya di PRCUISA Hub.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Satu PRCUISA ID. Banyak Tools Berguna.",
    description: "One account. Smarter tools. Better business.",
    url: "/",
  },
};
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main id="main" className="public-main">
        <span className="eyebrow">PRCUISA · EKOSISTEM TOOLS BISNIS</span>
        <h1>
          Satu PRCUISA ID.
          <br />
          <em>Banyak tools berguna.</em>
        </h1>
        <p className="public-intro">
          Tools praktis untuk menjalankan bisnis, terhubung melalui satu akun.
          Temukan yang kamu butuhkan hari ini, tanpa membuat akun baru untuk
          setiap tool.
        </p>
        <div className="public-actions">
          <Link className="button primary" href="/signup">
            Buat PRCUISA ID
          </Link>
          <Link className="button secondary" href="/preview">
            Jelajahi Preview Hub
          </Link>
        </div>
        <PublicUsageProof />
        <section className="public-columns">
          <article>
            <ReceiptText className="teal" />
            <h2>Catat & pahami usaha.</h2>
            <p>
              Business Report mencatat pemasukan dan pengeluaran, lalu
              menghitung selisihnya. Cukup isi nominal untuk mulai.
            </p>
            <Link href="/products/business-report">
              Kenali Business Report →
            </Link>
          </article>
          <article>
            <QrCode className="teal" />
            <h2>Bagikan lewat QR.</h2>
            <p>
              Ubah tautan menu, katalog, atau toko menjadi QR statis yang bisa
              diunduh dan dicetak. Tidak membutuhkan pendaftaran terpisah.
            </p>
            <Link href="/products/qr-tools">Kenali QR Tools →</Link>
          </article>
          <article>
            <MessageSquarePlus className="teal" />
            <h2>Bantu pilih tool berikutnya.</h2>
            <p>
              Ada pekerjaan yang berulang dan merepotkan? Ajukan masalahmu dari
              Hub. Kebutuhan nyata menjadi dasar pengembangan PRCUISA.
            </p>
            <Link href="/preview">Jelajahi Hub →</Link>
          </article>
        </section>
        <section className="public-bottom">
          <h2>One account. Smarter tools. Better business.</h2>
          <p>
            PRCUISA Hub menyatukan pencarian tools, konteks bisnis, favorit,
            aktivitas, dan akses akun. Pekerjaan khusus tetap dilakukan di
            masing-masing tool.
          </p>
          <p>
            Business Report dan QR Tools tersedia dalam fondasi Free. Paket Pro
            dan Business sedang disiapkan; harga dan pembayaran berbayar belum
            dibuka.
          </p>
          <Link href="/products">Lihat PRCUISA Tools →</Link>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://prcuisa.com/#organization",
                  name: "PRCUISA",
                  url: "https://prcuisa.com",
                  description:
                    "Business Systems · AI Automation · Smart Technology",
                },
                {
                  "@type": "WebSite",
                  name: "PRCUISA",
                  url: "https://prcuisa.com",
                  publisher: { "@id": "https://prcuisa.com/#organization" },
                },
              ],
            }),
          }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
