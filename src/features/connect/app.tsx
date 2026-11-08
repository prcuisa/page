"use client";
import { useEffect, useState } from "react";
import Channels from "./channels";
type Preference = {
  enabled: boolean;
  immediate_enabled?: boolean;
  domains: string[];
  local_time: string;
  timezone: string;
};
type Notice = {
  id: string;
  payload: Record<string, unknown>;
  read_at: string | null;
};
type State = {
  preference: Preference | null;
  notifications: Notice[];
  deliveries: {
    id: string;
    channel: string;
    status: string;
    attempt_count: number;
  }[];
};
const defaults: Preference = {
  enabled: false,
  immediate_enabled: false,
  domains: ["sales", "finance", "invoice", "qr"],
  local_time: "21:00",
  timezone: "Asia/Jakarta",
};
const channels = [
  ["Dalam aplikasi", "Tersedia setelah worker aktif"],
  ["Telegram", "Belum diaktifkan"],
  ["WhatsApp", "Beta · belum diaktifkan"],
  ["Email", "Belum diaktifkan"],
  ["Web Push", "Tahap berikutnya"],
  ["Webhook", "Tahap berikutnya"],
];
function Report({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="connect-report">
      <h3>{String(data.title || "Ringkasan bisnis")}</h3>
      {data.message ? (
        <p>{String(data.message)}</p>
      ) : (
        <>
          <p>
            Periode: {String(data.period_start || "—")} sampai{" "}
            {String(data.cutoff || "—")}
          </p>
          {["sales", "finance", "invoice", "qr"]
            .filter((k) => data[k])
            .map((k) => (
              <div key={k}>
                <strong>
                  {
                    {
                      sales: "Penjualan tercatat",
                      finance: "Arus kas tercatat",
                      invoice: "Invoice",
                      qr: "Aktivitas QR",
                    }[k]
                  }
                </strong>
                <dl>
                  {Object.entries(data[k] as Record<string, unknown>).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>
                          {{
                            count: "Jumlah transaksi",
                            recorded: "Nilai penjualan (Rp)",
                            income: "Pemasukan (Rp)",
                            expense: "Pengeluaran (Rp)",
                            issued: "Invoice diterbitkan",
                            created: "Desain tersimpan",
                            scans_available: "Analitik scan",
                          }[key] || key}
                        </dt>
                        <dd>
                          {typeof value === "boolean"
                            ? value
                              ? "Tersedia"
                              : "Belum tersedia"
                            : new Intl.NumberFormat("id-ID").format(
                                Number(value),
                              )}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </div>
            ))}
          {data.previous_tail ? (
            <Report data={data.previous_tail as Record<string, unknown>} />
          ) : null}
          <p className="meta">
            Penjualan, arus kas, dan invoice adalah ukuran berbeda; tidak
            dijumlahkan. Laporan ini mengikuti waktu batas yang tertera.
          </p>
        </>
      )}
    </div>
  );
}
export default function Connect({
  workspaceId,
  preview = false,
}: {
  workspaceId: string;
  preview?: boolean;
}) {
  const [state, setState] = useState<State>({
      preference: null,
      notifications: [],
      deliveries: [],
    }),
    [form, setForm] = useState(defaults),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [report, setReport] = useState<Record<string, unknown> | null>(null),
    [tab, setTab] = useState("preferences");
  async function call(action: string, payload?: unknown) {
    setBusy(true);
    setError("");
    try {
      if (preview) {
        if (action === "save") {
          sessionStorage.setItem(
            "connect.demo." + workspaceId,
            JSON.stringify(form),
          );
          setMessage(
            "Preferensi demo tersimpan untuk sesi ini. Tidak ada pengiriman terjadwal.",
          );
        } else if (action === "test") {
          setState((s) => ({
            ...s,
            notifications: [
              {
                id: crypto.randomUUID(),
                payload: {
                  title: "Notifikasi uji demo",
                  message:
                    "Ini simulasi lokal; tidak dikirim ke channel eksternal.",
                },
                read_at: null,
              },
              ...s.notifications,
            ],
          }));
          setTab("inbox");
        } else if (action === "read")
          setState((s) => ({
            ...s,
            notifications: s.notifications.map((n) => ({
              ...n,
              read_at: new Date().toISOString(),
            })),
          }));
        else if (action === "preview")
          setMessage(
            "Laporan nyata tersedia setelah masuk dan konfigurasi database. Demo tidak membuat angka bisnis.",
          );
        return;
      }
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: workspaceId, action, payload }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Belum dapat memproses.");
      if (action === "preview") setReport(data);
      else {
        setState(data);
        if (action === "read_state")
          setForm(
            data.preference
              ? {
                  ...data.preference,
                  local_time: data.preference.local_time.slice(0, 5),
                }
              : defaults,
          );
        if (action === "save")
          setMessage(
            "Preferensi disimpan. Pengiriman berjalan saat worker aktif.",
          );
        if (action === "test")
          setMessage(
            "Notifikasi uji masuk antrean. Muat ulang setelah worker memproses.",
          );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kendala.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (preview) {
      try {
        const p = sessionStorage.getItem("connect.demo." + workspaceId);
        if (p) setForm(JSON.parse(p));
      } catch {}
    } else void call("read_state");
  }, [workspaceId, preview]);
  return (
    <section className="connect-app">
      <p className="eyebrow">PRCUISA CONNECT · BETA</p>
      <h1>Kabar bisnis, dalam satu tempat.</h1>
      <p>Atur ringkasan harian dan lihat notifikasi bisnis kamu.</p>
      <p className="connect-note">
        Laporan untuk pemilik bisnis. Hubungkan channel yang tersedia dan
        verifikasi tujuan penerima di bawah.
      </p>
      <nav aria-label="Navigasi Connect">
        {[
          ["preferences", "Pengaturan"],
          ["inbox", "Notifikasi"],
          ["history", "Riwayat"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Memproses…</p>}
      {tab === "preferences" ? (
        <>
          <Channels workspaceId={workspaceId} preview={preview} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void call("save", form);
            }}
          >
            <h2>Ringkasan harian</h2>
            <label className="connect-check">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Aktifkan laporan dalam aplikasi
            </label>
            <label className="connect-check"><input type="checkbox" checked={!!form.immediate_enabled} onChange={e=>setForm({...form,immediate_enabled:e.target.checked})}/>Kirim pemberitahuan ketika ada aktivitas baru</label>
            <fieldset>
              <legend>Isi laporan</legend>
              {[
                ["sales", "Penjualan Kasir"],
                ["finance", "Pemasukan & pengeluaran"],
                ["invoice", "Invoice"],
                ["qr", "Aktivitas QR"],
              ].map(([id, label]) => (
                <label className="connect-check" key={id}>
                  <input
                    type="checkbox"
                    checked={form.domains.includes(id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        domains: e.target.checked
                          ? [...form.domains, id]
                          : form.domains.filter((x) => x !== id),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="connect-fields">
              <label>
                Pukul
                <input
                  type="time"
                  required
                  value={form.local_time}
                  onChange={(e) =>
                    setForm({ ...form, local_time: e.target.value })
                  }
                />
              </label>
              <label>
                Zona waktu
                <select
                  value={form.timezone}
                  onChange={(e) =>
                    setForm({ ...form, timezone: e.target.value })
                  }
                >
                  {[
                    "Asia/Jakarta",
                    "Asia/Makassar",
                    "Asia/Jayapura",
                    "UTC",
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              Setiap hari, dari 00:00 sampai waktu pengiriman. Aktivitas setelah
              batas dibawa ke bagian susulan pada laporan berikutnya.
            </p>
            <div className="connect-actions">
              <button className="primary" disabled={busy}>
                Simpan preferensi
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void call("preview")}
              >
                Lihat laporan saat ini
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void call("test")}
              >
                Uji notifikasi in-app
              </button>
            </div>
          </form>
          {report && <Report data={report} />}
        </>
      ) : tab === "inbox" ? (
        <>
          <div className="connect-actions">
            <h2>Notifikasi kamu</h2>
            <button disabled={busy} onClick={() => void call("read")}>
              Tandai semua dibaca
            </button>
            <button disabled={busy} onClick={() => void call("read_state")}>
              Muat ulang
            </button>
          </div>
          {!state.notifications.length ? (
            <p className="quiet-empty">
              Belum ada notifikasi. Coba kirim notifikasi uji.
            </p>
          ) : (
            state.notifications.map((n) => (
              <article key={n.id}>
                <small>{n.read_at ? "Sudah dibaca" : "Belum dibaca"}</small>
                <Report data={n.payload} />
              </article>
            ))
          )}
          <p className="meta">Menampilkan maksimal 25 notifikasi terbaru.</p>
        </>
      ) : (
        <>
          <h2>Riwayat pengiriman</h2>
          {!state.deliveries.length ? (
            <p className="quiet-empty">Belum ada pengiriman.</p>
          ) : (
            state.deliveries.map((d) => (
              <p key={d.id}>
                {d.channel} ·{" "}
                {{
                  pending: "Menunggu worker",
                    processing: "Sedang dikirim",
                    accepted: "Diterima provider",
                  delivered: "Tersimpan di kotak masuk",
                  cancelled: "Dibatalkan",
                  dead_letter: "Perlu pemeriksaan",
                }[d.status] || d.status}{" "}
                · {d.attempt_count} percobaan
              </p>
            ))
          )}
          <button disabled={busy} onClick={() => void call("read_state")}>
            Muat ulang
          </button>
        </>
      )}
    </section>
  );
}
