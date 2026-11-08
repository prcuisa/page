import Link from "next/link";
export default function Page() {
  return (
    <main id="main" className="center-page">
      <h1>Halaman tidak ditemukan.</h1>
      <Link href="/dashboard">Kembali ke dashboard</Link>
    </main>
  );
}
