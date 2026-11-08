import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-shell";

export const metadata = {
  title: "Buat Invoice Bisnis Sederhana | PRCUISA",
  description: "Susun invoice bisnis dengan item, pajak, dan diskon yang langsung dihitung. Simpan per bisnis, lalu cetak atau simpan sebagai PDF.",
  alternates: { canonical: "/products/invoice" },
  openGraph: { title: "Invoice Bisnis | PRCUISA", description: "Buat dan simpan invoice bisnis dalam satu tempat.", url: "/products/invoice" },
};

export default function Page() {
  return <><PublicHeader/><main id="main" className="public-main">
    <span className="eyebrow">PRCUISA INVOICE</span>
    <h1>Buat invoice bisnis dengan lebih sederhana.</h1>
    <p className="public-intro">Susun tagihan untuk klien, masukkan item dan jumlahnya, lalu lihat subtotal serta total langsung di pratinjau. Invoice tersimpan bersama bisnis di PRCUISA Hub.</p>
    <div className="public-actions"><Link className="button primary" href="/signup">Mulai dengan PRCUISA ID</Link><Link className="button secondary" href="/login">Masuk ke Hub</Link></div>
    <section className="public-columns"><article><h2>Isi detail seperlunya.</h2><p>Tambahkan informasi bisnis, klien, tanggal, item, dan catatan pembayaran. Logo bersifat opsional.</p></article><article><h2>Periksa hitungannya.</h2><p>Subtotal, diskon, pajak, dan total dihitung dari item invoice yang kamu masukkan. Tarif pajak bisa disesuaikan dengan kebutuhan.</p></article><article><h2>Cetak atau simpan PDF.</h2><p>Pratinjau invoice bisa dicetak atau disimpan sebagai PDF melalui dialog cetak di perangkatmu.</p></article></section>
    <section className="public-bottom"><h2>Terhubung dengan PRCUISA ID.</h2><p>Invoice disimpan per bisnis dan bisa dibuka lagi melalui Hub. Akses serta penyimpanannya memerlukan akun PRCUISA.</p><Link href="/products">Jelajahi tools PRCUISA →</Link></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"SoftwareApplication",name:"PRCUISA Invoice",applicationCategory:"BusinessApplication",operatingSystem:"Web",url:"https://prcuisa.com/products/invoice",description:"Buat, hitung, simpan, dan cetak invoice bisnis dengan PRCUISA Hub."})}}/>
  </main><PublicFooter/></>;
}
