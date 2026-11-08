import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-shell";
export const metadata = {
  title: "Pencatatan Usaha Harian dengan Business Report",
  description:
    "Catat pemasukan dan pengeluaran usaha kecil, lihat selisihnya, dan pahami aktivitas harian dalam satu tempat sederhana di PRCUISA.",
  alternates: { canonical: "/products/business-report" },
  openGraph: {
    title: "Business Report untuk Usaha Kecil | PRCUISA",
    description: "Catat hari ini. Pahami hasilnya.",
    url: "/products/business-report",
  },
};
export default function Page() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "PRCUISA Business Report",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://prcuisa.com/products/business-report",
        description:
          "Pencatatan pemasukan dan pengeluaran harian untuk usaha kecil.",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "PRCUISA",
            item: "https://prcuisa.com",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Business Report",
            item: "https://prcuisa.com/products/business-report",
          },
        ],
      },
    ],
  };
  return (
    <>
      <PublicHeader />
      <main id="main" className="public-main">
        <span className="eyebrow">PRCUISA BUSINESS REPORT</span>
        <h1>
          Catat hari ini.
          <br />
          <em>Pahami hasilnya.</em>
        </h1>
        <p className="public-intro">
          Pencatatan sederhana untuk pemilik usaha kecil. Ketahui uang yang
          masuk, uang yang keluar, dan selisihnya tanpa membangun spreadsheet
          sendiri.
        </p>
        <div className="public-actions">
          <Link className="button primary" href="/signup">
            Mulai mencatat
          </Link>
          <Link className="button secondary" href="/preview">
            Coba preview
          </Link>
        </div>
        <section className="public-columns">
          <article>
            <span className="eyebrow">01 · CATAT</span>
            <h2>Cukup isi nominal.</h2>
            <p>
              Tambahkan pemasukan atau pengeluaran. Kategori, catatan, dan
              tanggal membantu memberi konteks saat kamu membutuhkannya.
            </p>
          </article>
          <article>
            <span className="eyebrow">02 · PAHAMI</span>
            <h2>Hasil langsung terlihat.</h2>
            <p>
              Total dan selisih pemasukan dan pengeluaran diperbarui setelah
              catatan tersimpan. Pilih hari ini atau bulan ini untuk melihat
              periode yang relevan.
            </p>
          </article>
          <article>
            <span className="eyebrow">03 · ULANGI</span>
            <h2>Besok, lanjutkan.</h2>
            <p>
              Gunakan PRCUISA ID yang sama untuk membuka kembali bisnis kamu.
              Riwayat catatan membantu menjaga kebiasaan yang konsisten.
            </p>
          </article>
        </section>
        <section className="public-bottom">
          <h2>Apa arti selisih pemasukan & pengeluaran?</h2>
          <p>
            Business Report menghitung pemasukan dikurangi pengeluaran yang kamu
            catat. Angka ini tidak memperhitungkan piutang, utang, penyusutan,
            persediaan, atau pajak secara otomatis. Ini adalah ringkasan
            operasional sederhana.
          </p>
          <h2>Untuk siapa?</h2>
          <p>
            Pemilik kedai, penjual online, usaha jasa, peternakan, dan toko
            kecil yang masih mencatat lewat WhatsApp, Notes, spreadsheet,
            kertas, atau ingatan. Cukup gunakan HP untuk mencatat sambil
            melayani pelanggan atau menjalankan usaha.
          </p>
          <h2>Apakah pencatatan dari chat sudah tersedia?</h2>
          <p>
            Belum. Sekarang, kamu mencatat langsung di PRCUISA. Pencatatan lewat
            WhatsApp atau Telegram dan pengiriman rekap otomatis masih dalam
            rencana pengembangan.
          </p>
          <h2>Berapa biayanya?</h2>
          <p>
            Paket berbayar belum ditetapkan. Preview dapat dicoba tanpa akun;
            catatan preview tidak disimpan setelah halaman dimuat ulang.
          </p>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </main>
      <PublicFooter />
    </>
  );
}
