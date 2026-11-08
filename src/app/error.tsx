"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="center-page">
      <h1>Halaman belum berhasil dimuat.</h1>
      <p>Coba lagi sebentar lagi.</p>
      <button onClick={reset}>Coba lagi</button>
    </main>
  );
}
