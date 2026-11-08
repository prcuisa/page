"use client";
import { useState } from "react";
type Plan = {
  plan_id: string;
  amount_idr: number | null;
  period_days: number;
  active: boolean;
};
const rupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
export default function MembershipPlans({
  plans,
  currentPlan,
  configured,
  preview,
  workspace,
}: {
  plans: Plan[];
  currentPlan: string;
  configured: boolean;
  preview: boolean;
  workspace?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = plans.find((p) => p.plan_id === selected && p.active);
  async function checkout() {
    if (!plan || busy || preview || !workspace || !configured) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, plan: plan.plan_id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Pembayaran belum dapat disiapkan.");
      const url = new URL(result.redirect_url);
      if (
        url.protocol !== "https:" ||
        !["app.midtrans.com", "app.sandbox.midtrans.com"].includes(url.hostname)
      )
        throw Error("Tautan pembayaran tidak valid.");
      location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="membership-plans" aria-label="Pilihan paket PRCUISA">
      <div className="section-head">
        <div>
          <h2>Satu paket untuk tools bisnis kamu</h2>
          <p>
            Pilih sesuai kebutuhan. Harga dan masa akses ditampilkan sebelum
            pembayaran.
          </p>
        </div>
      </div>
      <div className="membership-grid">
        {[
          {
            id: "free",
            name: "Free",
            copy: "Mulai menggunakan tools yang tersedia dengan batas paket Free.",
          },
          {
            id: "pro",
            name: "Pro",
            copy: "Untuk kebutuhan usaha dengan akses dan batas penggunaan sesuai paket Pro.",
          },
          {
            id: "business",
            name: "Business",
            copy: "Untuk kebutuhan bisnis dengan akses dan batas penggunaan sesuai paket Business.",
          },
        ].map((p) => {
          const price = plans.find((x) => x.plan_id === p.id && x.active);
          const available = !!price && Number(price.amount_idr) > 0;
          const current = currentPlan === p.id;
          return (
            <article
              className={`membership-card ${selected === p.id ? "selected" : ""}`}
              key={p.id}
            >
              <span className="tag">
                {current ? "Paket kamu" : "PRCUISA Membership"}
              </span>
              <h3>{p.name}</h3>
              <strong className="membership-price">
                {p.id === "free"
                  ? "Gratis"
                  : available
                    ? rupiah(Number(price.amount_idr))
                    : "Harga belum tersedia"}
              </strong>
              <span className="meta">
                {p.id === "free"
                  ? "Akses dasar"
                  : available
                    ? `untuk ${price.period_days} hari akses`
                    : "Belum dibuka untuk pembelian"}
              </span>
              <p>{p.copy}</p>
              <button
                className={selected === p.id ? "primary" : "secondary"}
                disabled={
                  busy ||
                  current ||
                  p.id === "free" ||
                  !available ||
                  !configured ||
                  preview
                }
                onClick={() => {
                  setSelected(p.id);
                  setError("");
                }}
              >
                {current
                  ? "Paket aktif"
                  : selected === p.id
                    ? "Paket dipilih"
                    : preview
                      ? "Preview paket"
                      : !available || !configured
                        ? "Belum tersedia"
                        : `Pilih ${p.name}`}
              </button>
            </article>
          );
        })}
      </div>
      {plan && (
        <section
          className="membership-checkout"
          aria-label="Ringkasan pembayaran"
          aria-live="polite"
        >
          <div>
            <h3>Ringkasan pembayaran</h3>
            <p>
              PRCUISA {plan.plan_id.toUpperCase()} · {plan.period_days} hari
            </p>
            <strong className="membership-price">
              {rupiah(Number(plan.amount_idr))}
            </strong>
            <p>
              Pilih metode pembayaran di halaman Midtrans. Akses aktif setelah
              pembayaran diverifikasi.
            </p>
            <p className="meta">
              Harga akhir diperiksa kembali oleh server saat checkout.
            </p>
          </div>
          <div className="membership-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void checkout()}
            >
              {busy ? "Membuka Midtrans…" : "Bayar melalui Midtrans"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Batal
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
