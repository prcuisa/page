"use client";
import { useState } from "react";
import { Building2, Check } from "lucide-react";
export const businessTypes = [
  "Warung",
  "F&B kecil",
  "Toko",
  "Online seller",
  "Peternakan",
  "Bengkel / workshop",
  "Usaha jasa",
  "Bisnis kreator",
  "Kantor kecil",
  "Lainnya",
];
export const businessGoals = [
  "Pemasukan & pengeluaran",
  "Laporan bisnis",
  "Pekerjaan berulang",
  "Customer service",
  "Belum tahu, saya mau coba dulu",
];
export default function BusinessOnboarding({
  onCreate,
  onComplete,
}: {
  onCreate: (values: {
    name: string;
    business_type: string;
    primary_goal: string;
  }) => Promise<void>;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [type, setType] = useState("Lainnya"),
    [goal, setGoal] = useState(businessGoals[4]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        business_type: type,
        primary_goal: goal,
      });
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <span className="icon-tile">
        {step === 2 ? <Check /> : <Building2 />}
      </span>
      {step === 0 ? (
        <>
          <span className="eyebrow">SELAMAT DATANG DI PRCUISA</span>
          <h2 id="onboarding-title">Apa nama bisnis kamu?</h2>
          <p>Satu bisnis untuk semua tools PRCUISA.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const businessName = String(form.get("name") || "").trim();
              if (businessName.length < 2) return;
              setName(businessName);
              setStep(1);
            }}
          >
            <label>
              Nama bisnis
              <input
                autoFocus
                name="name"
                placeholder="Contoh: Warung Bu Sari"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              Jenis bisnis <span className="optional">opsional</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {businessTypes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button className="primary">Lanjut</button>
          </form>
        </>
      ) : step === 1 ? (
        <>
          <h2 id="onboarding-title">Apa yang paling ingin kamu rapikan?</h2>
          <p>Pilih yang paling dekat dengan kebutuhanmu.</p>
          <fieldset className="goal-options">
            <legend className="sr-only">Kebutuhan utama</legend>
            {businessGoals.map((v) => (
              <label key={v} className={goal === v ? "selected" : ""}>
                <input
                  type="radio"
                  name="goal"
                  checked={goal === v}
                  value={v}
                  onChange={() => setGoal(v)}
                />
                {v}
              </label>
            ))}
          </fieldset>
          <p className="muted onboarding-note">
            Kamu bisa memilih tools yang sesuai setelah bisnis siap.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "Menyiapkan…" : "Buat Bisnis"}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setStep(0)}
          >
            Kembali
          </button>
        </>
      ) : (
        <>
          <h2 id="onboarding-title">Bisnis kamu siap.</h2>
          <p>{name} siap digunakan di PRCUISA Hub.</p>
          <button className="primary" onClick={onComplete}>
            Jelajahi PRCUISA Tools
          </button>
        </>
      )}
    </section>
  );
}
