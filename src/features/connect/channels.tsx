"use client";
import { useEffect, useState } from "react";
type Connection = { id: string; channel: string; status: string };
const names: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "Email",
  push: "Web Push",
  webhook: "Webhook",
};
export default function Channels({
  workspaceId,
  preview,
}: {
  workspaceId: string;
  preview: boolean;
}) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [available, setAvailable] = useState<Record<string, boolean>>({}),
    [vapid, setVapid] = useState(""),
    [secret, setSecret] = useState(""),
    [selected, setSelected] = useState(""),
    [destination, setDestination] = useState(""),
    [consent, setConsent] = useState(false),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function request(action: string, channel = selected, id?: string) {
    setBusy(true);
    setError("");
    try {
      let subscription;
      if (action === "start" && channel === "push") {
        if (!("serviceWorker" in navigator) || !("PushManager" in window))
          throw Error(
            "Browser ini belum mendukung push. Gunakan channel lain.",
          );
        if (!consent) throw Error("Persetujuan diperlukan.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw Error("Izin notifikasi belum diberikan.");
        const registration =
          await navigator.serviceWorker.register("/connect-sw.js");
        await navigator.serviceWorker.ready;
        const bytes = Uint8Array.from(
          atob(vapid.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        subscription =
          (await registration.pushManager.getSubscription()) ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          }));
      }
      const res = await fetch("/api/connect/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspaceId,
          action,
          channel,
          id: id || challenge,
          destination,
          consent,
          code,
          subscription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Koneksi belum berhasil.");
      if (action === "state") {
        setConnections(data.connections);
        setAvailable(data.available);
        setVapid(data.vapidPublicKey || "");
      } else if (action === "start" && data.verified) {
        setSecret(data.secret || "");
        setSelected("");
        setMessage("Channel tersimpan. Kirim uji untuk memeriksa penerimaan.");
        await refresh();
      } else if (action === "start") {
        setChallenge(data.id);
        setUrl(data.url || "");
        setMessage(
          data.url
            ? "Buka bot, tekan Start, lalu periksa status di sini."
            : "Masukkan kode yang dikirim ke tujuan kamu.",
        );
      } else {
        setMessage(
          action === "test"
            ? "Pengiriman uji masuk antrean. Lihat riwayat setelah worker memproses."
            : action === "disconnect"
              ? "Koneksi diputus."
              : "Channel berhasil diverifikasi.",
        );
        setChallenge("");
        setUrl("");
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kendala.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const r = await fetch("/api/connect/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: workspaceId, action: "state" }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Status belum tersedia");
    setConnections(d.connections);
    setAvailable(d.available);
    setVapid(d.vapidPublicKey || "");
  }
  useEffect(() => {
    if (!preview) void request("state");
  }, [workspaceId, preview]);
  return (
    <section>
      <h2>Hubungkan channel</h2>
      <p>
        Verifikasi tujuan milikmu sekali, lalu kelola semuanya dari dashboard
        ini.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {secret && (
        <div className="connect-note">
          <strong>
            Salin secret webhook sekarang. Hanya ditampilkan sekali.
          </strong>
          <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
          <button onClick={() => setSecret("")}>Sudah disimpan</button>
        </div>
      )}
      <ul className="connect-channels">
        {Object.entries(names).map(([channel, name]) => {
          const c = connections.find(
            (c) => c.channel === channel && c.status !== "revoked",
          );
          return (
            <li key={channel}>
              <div>
                <strong>{name}</strong>
                <p>
                  {c?.status === "verified"
                    ? "Terverifikasi"
                    : c?.status === "pending"
                      ? "Menunggu verifikasi"
                      : available[channel]
                        ? "Siap dihubungkan"
                        : preview
                          ? "Masuk untuk menghubungkan"
                          : "Belum dikonfigurasi"}
                </p>
              </div>
              <div className="connect-channel-actions">
                {c ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void request("disconnect", channel, c.id)}
                    >
                      Putus koneksi
                    </button>
                    {c.status === "verified" && (
                      <button
                        disabled={busy}
                        onClick={() => void request("test", channel, c.id)}
                      >
                        Kirim uji
                      </button>
                    )}
                    {c.status === "pending" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setSelected(channel);
                          setChallenge(c.id);
                          setUrl("");
                          setCode("");
                        }}
                      >
                        Verifikasi
                      </button>
                    )}
                  </>
                ) : available[channel] && !preview ? (
                  <button
                    onClick={() => {
                      setSelected(channel);
                      setConsent(false);
                      setDestination("");
                      setChallenge("");
                      setUrl("");
                      setCode("");
                    }}
                  >
                    Hubungkan
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {selected && available[selected] && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void request(challenge ? "verify" : "start");
          }}
        >
          <h3>Hubungkan {names[selected]}</h3>
          {challenge ? (
            <>
              {url && (
                <a
                  className="button primary"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka bot Telegram
                </a>
              )}
              {selected === "telegram" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void request("state")}
                >
                  Periksa status koneksi
                </button>
              ) : (
                <label>
                  Kode verifikasi
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              {selected !== "telegram" && selected !== "push" && (
                <label>
                  {selected === "email"
                    ? "Email penerima"
                    : selected === "webhook"
                      ? "URL HTTPS tujuan"
                      : "Nomor WhatsApp dengan kode negara"}
                  <input
                    type={
                      selected === "email"
                        ? "email"
                        : selected === "webhook"
                          ? "url"
                          : "tel"
                    }
                    placeholder={
                      selected === "email"
                        ? "nama@bisnis.com"
                        : selected === "webhook"
                          ? "https://bisnis.com/webhook"
                          : "+6281234567890"
                    }
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </label>
              )}
              <label className="connect-check">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Saya pemilik tujuan ini dan setuju menerima notifikasi PRCUISA.
              </label>
              {selected === "whatsapp" && (
                <p className="meta">
                  WhatsApp menggunakan WAHA, bukan layanan resmi WhatsApp
                  Business. Koneksi dapat terputus.
                </p>
              )}
            </>
          )}
          {(!challenge || selected !== "telegram") && (
            <button className="primary" disabled={busy}>
              {busy ? "Memproses…" : challenge ? "Verifikasi" : "Lanjutkan"}
            </button>
          )}
          <button type="button" onClick={() => setSelected("")}>
            Tutup
          </button>
        </form>
      )}
      <p className="meta">
        Pesan eksternal mengarahkan ke laporan di Hub. Detail keuangan hanya
        dapat dibuka setelah masuk.
      </p>
    </section>
  );
}
