"use client";
import { useEffect, useRef, useState } from "react";
import type QRCodeStyling from "qr-code-styling";
import type { Options } from "qr-code-styling";
import {
  Download,
  Copy,
  Save,
  QrCode,
  ImagePlus,
  RotateCcw,
} from "lucide-react";
import {
  emptyDesign,
  buildQRContent,
  typeLabels,
  qrTypes,
  contrast,
  type QRDesign,
  type QRType,
  type QRStyle,
} from "@/lib/qr-content";
type Saved = {
  id: string;
  name: string;
  type?: QRType;
  design?: QRDesign;
  created_at: string;
};
type Rendered = { qr: QRCodeStyling; png: string; revision: string };
const blobURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Gambar belum berhasil dibaca."));
    r.readAsDataURL(blob);
  });
export default function QRStudio({
  workspaceId,
  preview,
  onValue,
}: {
  workspaceId: string;
  preview: boolean;
  onValue: () => void;
}) {
  const [design, setDesign] = useState<QRDesign>(emptyDesign),
    [rendered, setRendered] = useState<Rendered | null>(null),
    [rendering, setRendering] = useState(false),
    [renderError, setRenderError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [saved, setSaved] = useState<Saved[]>([]),
    [loadingSaved, setLoadingSaved] = useState(false),
    [savedError, setSavedError] = useState("");
  const generation = useRef(0),
    logoInput = useRef<HTMLInputElement>(null);
  const revision = JSON.stringify(design);
  let content = "",
    validation = "";
  try {
    content = buildQRContent(design);
  } catch (e) {
    validation =
      (e as Error).name === "ZodError"
        ? "Periksa kembali pengaturan QR."
        : (e as Error).message;
  }
  const style = design.style,
    ready =
      rendered?.revision === revision &&
      !rendering &&
      !validation &&
      !renderError;
  const lowContrast =
    contrast(style.foreground, style.background) < 4.5 ||
    (style.gradient && contrast(style.gradientColor, style.background) < 4.5);
  async function api(action: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: workspaceId, action, ...extra }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "QR belum berhasil diproses.");
    return result;
  }
  async function loadSaved() {
    if (preview) return;
    setLoadingSaved(true);
    setSavedError("");
    try {
      const r = await fetch("/api/qr?workspace=" + workspaceId, {
        cache: "no-store",
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setSaved(result.designs);
    } catch (e) {
      setSavedError((e as Error).message);
    } finally {
      setLoadingSaved(false);
    }
  }
  useEffect(() => {
    void loadSaved();
  }, [workspaceId, preview]);
  useEffect(() => {
    const seq = ++generation.current;
    setRendered(null);
    setRenderError("");
    if (!content) {
      setRendering(false);
      return;
    }
    setRendering(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const QR = (await import("qr-code-styling")).default;
          const s = design.style;
          const gradient = s.gradient
            ? {
                type: s.gradientType,
                rotation: (s.rotation * Math.PI) / 180,
                colorStops: [
                  { offset: 0, color: s.foreground },
                  { offset: 1, color: s.gradientColor },
                ],
              }
            : undefined;
          const options: Options = {
            type: "svg",
            width: s.size,
            height: s.size,
            // qr-code-styling 1.9.2 uses a low-byte encoder internally.
            // Feed UTF-8 bytes explicitly so accents and emoji round-trip.
            data: Array.from(new TextEncoder().encode(content), (b) =>
              String.fromCharCode(b),
            ).join(""),
            margin: s.margin,
            qrOptions: {
              mode: "Byte",
              errorCorrectionLevel: s.logo ? "H" : s.ec,
            },
            dotsOptions: { type: s.dots, color: s.foreground, gradient },
            cornersSquareOptions: { type: s.corner, color: s.foreground },
            cornersDotOptions: { type: s.eye, color: s.foreground },
            backgroundOptions: {
              color: s.transparent ? "#ffffff00" : s.background,
            },
            image: s.logo || undefined,
            imageOptions: {
              hideBackgroundDots: true,
              imageSize: s.logoSize,
              margin: 4,
              saveAsBlob: true,
            },
          };
          const qr = new QR(options);
          const blob = await qr.getRawData("png");
          if (!(blob instanceof Blob))
            throw new Error("QR belum bisa dirender.");
          const png = await blobURL(blob);
          if (generation.current === seq) setRendered({ qr, png, revision });
        } catch {
          if (generation.current === seq)
            setRenderError(
              "QR belum berhasil dibuat. Coba ringkas konten, kurangi logo, atau ubah gaya.",
            );
        } finally {
          if (generation.current === seq) setRendering(false);
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [revision, content]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function field(key: string, value: string) {
    setError("");
    setDesign((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));
  }
  function appearance<K extends keyof QRStyle>(key: K, value: QRStyle[K]) {
    setDesign((d) => ({ ...d, style: { ...d.style, [key]: value } }));
  }
  function chooseType(type: QRType) {
    setError("");
    setDesign((d) => ({
      ...d,
      type,
      fields:
        type === "event" && !d.fields.uid
          ? { ...d.fields, uid: crypto.randomUUID() }
          : d.fields,
    }));
  }
  function preset(preset: string) {
    const presets: Record<string, Partial<QRStyle>> = {
      Klasik: {
        dots: "square",
        corner: "square",
        eye: "square",
        foreground: "#12141a",
        gradient: false,
      },
      Bulat: {
        dots: "rounded",
        corner: "extra-rounded",
        eye: "dot",
        foreground: "#006e76",
        gradient: false,
      },
      Titik: {
        dots: "dots",
        corner: "dot",
        eye: "dot",
        foreground: "#12141a",
        gradient: false,
      },
      Neon: {
        dots: "rounded",
        corner: "extra-rounded",
        eye: "dot",
        foreground: "#064e3b",
        gradient: true,
        gradientColor: "#0f566e",
      },
      Sunset: {
        dots: "rounded",
        corner: "extra-rounded",
        eye: "dot",
        foreground: "#7c2d12",
        gradient: true,
        gradientColor: "#831843",
      },
      Mono: {
        dots: "square",
        corner: "square",
        eye: "square",
        foreground: "#000000",
        gradient: false,
      },
    };
    setDesign((d) => ({
      ...d,
      style: {
        ...d.style,
        ...presets[preset],
        background: "#ffffff",
        transparent: false,
      },
    }));
  }
  async function logo(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      )
        throw new Error("Gunakan PNG, JPEG, atau WebP maksimal 2 MB.");
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("Logo tidak dapat dibaca."));
          i.src = url;
        });
        if (img.width * img.height > 16000000)
          throw new Error(
            "Resolusi logo terlalu besar. Gunakan gambar yang lebih kecil.",
          );
        const c = document.createElement("canvas");
        const scale = Math.min(1, 256 / Math.max(img.width, img.height));
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        setDesign((d) => ({
          ...d,
          style: { ...d.style, logo: c.toDataURL("image/png"), ec: "H" },
        }));
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    if (logoInput.current) logoInput.current.value = "";
  }
  async function exportFile(format: "png" | "svg" | "jpeg" | "webp" | "copy") {
    if (!ready || !rendered || busy) return;
    const current = rendered;
    setBusy(true);
    setError("");
    try {
      let blob: Blob;
      if (format === "svg") {
        const raw = await current.qr.getRawData("svg");
        if (!(raw instanceof Blob))
          throw new Error("SVG belum berhasil dibuat.");
        blob = raw;
      } else {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("Gambar belum siap."));
          i.src = current.png;
        });
        const c = document.createElement("canvas");
        c.width = style.size;
        c.height = style.size;
        const ctx = c.getContext("2d")!;
        if (format === "jpeg") {
          ctx.fillStyle = style.background;
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(img, 0, 0);
        const mime = format === "copy" ? "image/png" : "image/" + format;
        blob = await new Promise<Blob>((resolve, reject) =>
          c.toBlob(
            (b) =>
              b
                ? resolve(b)
                : reject(new Error("Format ini belum didukung browser.")),
            mime,
            0.95,
          ),
        );
        if (blob.type !== mime)
          throw new Error(
            "Format ini belum didukung browser. Pilih PNG atau SVG.",
          );
      }
      if (!preview) await api("export");
      if (format === "copy") {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw new Error(
            "Browser belum mendukung salin gambar. Gunakan Unduh PNG.",
          );
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setNotice("Gambar QR disalin.");
      } else {
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download =
          (name.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || "prcuisa-qr") +
          "." +
          format;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setNotice(format.toUpperCase() + " siap diunduh.");
      }
      onValue();
    } catch (e) {
      setError(
        (e as Error).message ||
          "Gambar belum berhasil disalin. Gunakan Unduh PNG.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!ready || busy) return;
    if (!name.trim()) {
      setError("Isi nama QR sebelum menyimpan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const clean = { ...design, fields: fieldsForType(design) };
      const row = preview
        ? {
            id: crypto.randomUUID(),
            name: name.trim(),
            design: clean,
            created_at: new Date().toISOString(),
          }
        : (await api("save", { name: name.trim(), design: clean })).design;
      setSaved((s) => [row, ...s]);
      setNotice(
        preview
          ? "Disimpan sementara di sesi preview ini."
          : "QR tersimpan di akun untuk bisnis ini.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openSaved(row: Saved) {
    setBusy(true);
    setError("");
    try {
      let value = row;
      if (!row.design) {
        const r = await fetch(`/api/qr?workspace=${workspaceId}&id=${row.id}`, {
          cache: "no-store",
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        value = body.design;
      }
      if (!value.design) throw new Error("Desain belum berhasil dimuat.");
      setDesign(value.design);
      setName(value.name);
      setNotice("Desain dimuat. Perubahan dapat disimpan sebagai QR baru.");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function input(
    key: string,
    label: string,
    type = "text",
    required = false,
    placeholder = "",
  ) {
    return (
      <label key={key}>
        {label}
        {!required && <span className="optional">opsional</span>}
        <input
          type={type}
          name={key}
          value={design.fields[key] || ""}
          onChange={(e) => field(key, e.target.value)}
          required={required}
          maxLength={key === "url" ? 1200 : 240}
          placeholder={placeholder}
          autoComplete="off"
          step={type === "number" ? "any" : undefined}
        />
      </label>
    );
  }
  function text(key: string, label: string, required = false) {
    return (
      <label>
        {label}
        {!required && <span className="optional">opsional</span>}
        <textarea
          name={key}
          rows={3}
          maxLength={1800}
          value={design.fields[key] || ""}
          onChange={(e) => field(key, e.target.value)}
          required={required}
        />
      </label>
    );
  }
  return (
    <div className="qr-studio">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRCUISA QR TOOLS</span>
          <h1>Buat QR sesuai kebutuhanmu.</h1>
          <p>
            Isi konten, sesuaikan tampilannya, lalu unduh. Semua dari satu
            PRCUISA ID.
          </p>
        </div>
      </div>
      <a className="qr-jump text-button" href="#qr-preview">
        Lihat hasil & unduh ↓
      </a>
      <div className="qr-studio-grid">
        <form
          className="qr-controls operational-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(validation || renderError);
          }}
        >
          <fieldset disabled={busy}>
            <section className="qr-control-section">
              <div className="qr-section-title">
                <span>01</span>
                <h2>Isi Konten</h2>
              </div>
              <div className="qr-types" role="group" aria-label="Tipe konten">
                {qrTypes.map((type) => (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={design.type === type}
                    className={design.type === type ? "selected" : ""}
                    onClick={() => chooseType(type)}
                  >
                    {typeLabels[type]}
                  </button>
                ))}
              </div>
              <div className="qr-fields">
                {design.type === "url" &&
                  input(
                    "url",
                    "Tautan tujuan",
                    "url",
                    true,
                    "https://tokokamu.com/menu",
                  )}
                {design.type === "text" && text("text", "Teks QR", true)}
                {design.type === "email" && (
                  <>
                    {input("email", "Alamat email", "email", true)}
                    {input("subject", "Subjek")}
                    {text("message", "Pesan")}
                  </>
                )}
                {design.type === "phone" &&
                  input(
                    "phone",
                    "Nomor telepon",
                    "tel",
                    true,
                    "+6281234567890",
                  )}
                {design.type === "sms" && (
                  <>
                    {input(
                      "phone",
                      "Nomor telepon",
                      "tel",
                      true,
                      "+6281234567890",
                    )}
                    {text("message", "Pesan SMS")}
                  </>
                )}
                {design.type === "whatsapp" && (
                  <>
                    {input(
                      "phone",
                      "Nomor WhatsApp",
                      "tel",
                      true,
                      "6281234567890",
                    )}
                    {text("message", "Pesan WhatsApp")}
                    <p className="meta">
                      Nomor berawalan 08 otomatis memakai kode negara Indonesia
                      (62).
                    </p>
                  </>
                )}
                {design.type === "wifi" && (
                  <>
                    {input("ssid", "Nama jaringan (SSID)", "text", true)}
                    <label>
                      Enkripsi
                      <select
                        value={design.fields.encryption || "WPA"}
                        onChange={(e) => field("encryption", e.target.value)}
                      >
                        <option value="WPA">WPA/WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">Tanpa sandi</option>
                      </select>
                    </label>
                    {design.fields.encryption !== "nopass" &&
                      input("password", "Kata sandi WiFi", "password", true)}
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={design.fields.hidden === "true"}
                        onChange={(e) =>
                          field("hidden", String(e.target.checked))
                        }
                      />
                      Jaringan tersembunyi
                    </label>
                    <p className="qr-notice">
                      QR berisi kata sandi jaringan. Bagikan hanya kepada orang
                      yang kamu izinkan.
                    </p>
                  </>
                )}
                {design.type === "vcard" && (
                  <div className="qr-field-grid">
                    {input("first", "Nama depan", "text", true)}
                    {input("last", "Nama belakang")}
                    {input("org", "Perusahaan")}
                    {input("job", "Jabatan")}
                    {input("phone", "Telepon kontak", "tel")}
                    {input("email", "Email kontak", "email")}
                    {input("website", "Website", "url")}
                    {input("address", "Alamat")}
                  </div>
                )}
                {design.type === "location" && (
                  <>
                    {input("latitude", "Latitude", "number", true, "-6.2")}
                    {input("longitude", "Longitude", "number", true, "106.8")}
                    <p className="meta">
                      Gunakan koordinat desimal dari aplikasi peta.
                    </p>
                  </>
                )}
                {design.type === "event" && (
                  <>
                    {input("title", "Judul acara", "text", true)}
                    {input("location", "Lokasi acara")}
                    {input("start", "Mulai (WIB)", "datetime-local", true)}
                    {input("end", "Selesai (WIB)", "datetime-local", true)}
                    {text("description", "Deskripsi acara")}
                    <p className="meta">
                      Waktu Asia/Jakarta (WIB). Pemindai kalender dapat
                      menampilkan waktu lokal penerima.
                    </p>
                  </>
                )}
              </div>
            </section>
            <section className="qr-control-section">
              <div className="qr-section-title">
                <span>02</span>
                <h2>Gaya & Warna</h2>
              </div>
              <span className="meta">Preset cepat</span>
              <div className="qr-presets">
                {["Klasik", "Bulat", "Titik", "Neon", "Sunset", "Mono"].map(
                  (p) => (
                    <button type="button" key={p} onClick={() => preset(p)}>
                      {p}
                    </button>
                  ),
                )}
              </div>
              <div className="qr-field-grid">
                <label>
                  Bentuk piksel
                  <select
                    value={style.dots}
                    onChange={(e) =>
                      appearance("dots", e.target.value as QRStyle["dots"])
                    }
                  >
                    {[
                      ["square", "Kotak"],
                      ["rounded", "Bulat"],
                      ["dots", "Titik"],
                      ["extra-rounded", "Ekstra bulat"],
                      ["classy", "Classy"],
                      ["classy-rounded", "Classy bulat"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sudut luar
                  <select
                    value={style.corner}
                    onChange={(e) =>
                      appearance("corner", e.target.value as QRStyle["corner"])
                    }
                  >
                    <option value="square">Kotak</option>
                    <option value="dot">Titik</option>
                    <option value="extra-rounded">Ekstra bulat</option>
                  </select>
                </label>
                <label>
                  Sudut dalam
                  <select
                    value={style.eye}
                    onChange={(e) =>
                      appearance("eye", e.target.value as QRStyle["eye"])
                    }
                  >
                    <option value="square">Kotak</option>
                    <option value="dot">Titik</option>
                  </select>
                </label>
                <label>
                  Warna piksel
                  <select
                    value={style.gradient ? "gradient" : "solid"}
                    onChange={(e) =>
                      appearance("gradient", e.target.value === "gradient")
                    }
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradien</option>
                  </select>
                </label>
              </div>
              <div className="qr-field-grid">
                <label>
                  Warna depan
                  <div className="color-control">
                    <input
                      type="color"
                      aria-label="Pilih warna depan"
                      value={style.foreground}
                      onChange={(e) => appearance("foreground", e.target.value)}
                    />
                    <span>{style.foreground.toUpperCase()}</span>
                  </div>
                </label>
                <label>
                  Warna latar
                  <div className="color-control">
                    <input
                      type="color"
                      aria-label="Pilih warna latar"
                      value={style.background}
                      onChange={(e) => appearance("background", e.target.value)}
                    />
                    <span>{style.background.toUpperCase()}</span>
                  </div>
                </label>
                {style.gradient && (
                  <>
                    <label>
                      Warna gradien kedua
                      <div className="color-control">
                        <input
                          type="color"
                          aria-label="Pilih warna gradien kedua"
                          value={style.gradientColor}
                          onChange={(e) =>
                            appearance("gradientColor", e.target.value)
                          }
                        />
                        <span>{style.gradientColor.toUpperCase()}</span>
                      </div>
                    </label>
                    <label>
                      Jenis gradien
                      <select
                        value={style.gradientType}
                        onChange={(e) =>
                          appearance(
                            "gradientType",
                            e.target.value as QRStyle["gradientType"],
                          )
                        }
                      >
                        <option value="linear">Linear</option>
                        <option value="radial">Radial</option>
                      </select>
                    </label>
                    <label>
                      Rotasi gradien · {style.rotation}°
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={15}
                        value={style.rotation}
                        onChange={(e) =>
                          appearance("rotation", Number(e.target.value))
                        }
                      />
                    </label>
                  </>
                )}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={style.transparent}
                  onChange={(e) => appearance("transparent", e.target.checked)}
                />
                Latar transparan
              </label>
              {lowContrast && (
                <p className="qr-notice" role="status">
                  Kontras warna rendah. Pilih warna QR lebih gelap agar mudah
                  dipindai.
                </p>
              )}
            </section>
            <section className="qr-control-section">
              <div className="qr-section-title">
                <span>03</span>
                <h2>Logo & Ukuran</h2>
              </div>
              <label className="logo-upload">
                <ImagePlus size={19} />
                Unggah logo
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void logo(e.target.files?.[0])}
                />
              </label>
              <p className="meta">
                PNG, JPEG, atau WebP · Maksimal 2 MB. Logo diproses di
                perangkatmu.
              </p>
              {style.logo && (
                <div className="logo-chosen">
                  <img
                    src={style.logo}
                    alt="Logo untuk QR"
                    width={48}
                    height={48}
                  />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => appearance("logo", "")}
                  >
                    Hapus logo
                  </button>
                </div>
              )}
              {style.logo && (
                <label>
                  Ukuran logo · {Math.round(style.logoSize * 100)}%
                  <input
                    type="range"
                    min={0.1}
                    max={0.3}
                    step={0.01}
                    value={style.logoSize}
                    onChange={(e) =>
                      appearance("logoSize", Number(e.target.value))
                    }
                  />
                </label>
              )}
              <label>
                Ukuran QR · {style.size} px
                <input
                  type="range"
                  min={256}
                  max={2048}
                  step={32}
                  value={style.size}
                  onChange={(e) => appearance("size", Number(e.target.value))}
                />
              </label>
              <label>
                Margin · {style.margin} px
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={2}
                  value={style.margin}
                  onChange={(e) => appearance("margin", Number(e.target.value))}
                />
              </label>
              {style.margin < 16 && (
                <p className="qr-notice">
                  Margin tipis bisa menyulitkan pemindaian. Sisakan ruang kosong
                  saat mencetak.
                </p>
              )}
              <label>
                Koreksi error
                <select
                  value={style.logo ? "H" : style.ec}
                  disabled={Boolean(style.logo)}
                  onChange={(e) =>
                    appearance("ec", e.target.value as QRStyle["ec"])
                  }
                >
                  <option value="L">L · 7%</option>
                  <option value="M">M · 15%</option>
                  <option value="Q">Q · 25%</option>
                  <option value="H">H · 30%</option>
                </select>
              </label>
              <p className="meta">
                Logo otomatis memakai H. Koreksi lebih tinggi membantu QR
                bertahan saat sebagian pola rusak; selalu uji pindai.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setDesign((d) => ({ ...d, style: emptyDesign().style }))
                }
              >
                <RotateCcw size={15} />
                Reset tampilan
              </button>
            </section>
            <button className="primary" type="submit">
              Buat QR
            </button>
          </fieldset>
        </form>
        <aside
          id="qr-preview"
          className="qr-preview-panel"
          aria-label="Pratinjau QR code"
        >
          <div className="qr-preview-sticky">
            <div className="section-heading">
              <h2>Pratinjau</h2>
              <span className="tag">Otomatis</span>
            </div>
            <div
              className={`qr-output ${style.transparent ? "checkerboard" : ""}`}
              aria-busy={rendering}
            >
              {rendered ? (
                <img
                  src={rendered.png}
                  alt="QR untuk konten kamu"
                  width={320}
                  height={320}
                />
              ) : (
                <>
                  <QrCode size={52} />
                  <p>
                    {rendering
                      ? "Membuat pratinjau…"
                      : validation ||
                        renderError ||
                        "Isi konten untuk memulai."}
                  </p>
                </>
              )}
            </div>
            {renderError && (
              <p className="error" role="alert">
                {renderError}
              </p>
            )}
            <p className="meta">
              {typeLabels[design.type]} · {style.size} × {style.size} px · QR
              statis
            </p>
            <div className="qr-export-grid">
              {(["png", "svg", "jpeg", "webp"] as const).map((format) => (
                <button
                  type="button"
                  className={format === "png" ? "primary" : "secondary"}
                  disabled={!ready || busy}
                  key={format}
                  onClick={() => void exportFile(format)}
                >
                  <Download size={16} />
                  Unduh {format.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              disabled={!ready || busy}
              onClick={() => void exportFile("copy")}
            >
              <Copy size={16} />
              Salin gambar
            </button>
            {style.transparent && (
              <p className="meta">
                PNG, SVG, dan WebP mendukung transparansi. JPEG memakai warna
                latar yang dipilih.
              </p>
            )}
            <p className="qr-notice">
              Pindai hasil unduhan sebelum dibagikan atau dicetak. Isi QR statis
              tidak bisa diubah setelah tersebar.
            </p>
            <div className="qr-save">
              <label>
                Nama QR
                <input
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Menu warung"
                />
              </label>
              <button
                className="secondary"
                disabled={!ready || busy}
                onClick={() => void save()}
              >
                <Save size={16} />
                {busy ? "Memproses…" : "Simpan ke akun"}
              </button>
              <p className="meta">
                {preview
                  ? "Preview: tersimpan sementara hingga halaman dimuat ulang."
                  : "Menyimpan konten dan desain QR ke akunmu dalam bisnis aktif. Konten WiFi dan kontak dapat berisi informasi pribadi."}
              </p>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="qr-success" role="status">
                {notice}
              </p>
            )}
          </div>
        </aside>
      </div>
      <section className="qr-saved">
        <div className="section-heading">
          <h2>QR tersimpan</h2>
          <span className="meta">
            {preview ? "Sesi preview" : "Akun & bisnis ini"}
          </span>
        </div>
        {loadingSaved ? (
          <p role="status">Memuat QR tersimpan…</p>
        ) : savedError ? (
          <p className="error" role="alert">
            {savedError}
            <button className="text-button" onClick={() => void loadSaved()}>
              Coba lagi
            </button>
          </p>
        ) : saved.length ? (
          <div className="tool-grid">
            {saved.map((row) => (
              <article key={row.id} className="tool-card">
                <span className="tag">
                  {typeLabels[row.design?.type || row.type || "url"]}
                </span>
                <h3>{row.name}</h3>
                <p>
                  {new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(row.created_at))}
                </p>
                <button
                  className="tool-open"
                  disabled={busy}
                  onClick={() => void openSaved(row)}
                >
                  Buka desain
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Belum ada QR tersimpan. Beri nama desainmu untuk menggunakannya lagi
            nanti.
          </p>
        )}
      </section>
    </div>
  );
}
const keys: Record<QRType, string[]> = {
  url: ["url"],
  text: ["text"],
  email: ["email", "subject", "message"],
  phone: ["phone"],
  sms: ["phone", "message"],
  whatsapp: ["phone", "message"],
  wifi: ["ssid", "encryption", "password", "hidden"],
  vcard: [
    "first",
    "last",
    "org",
    "job",
    "phone",
    "email",
    "website",
    "address",
  ],
  location: ["latitude", "longitude"],
  event: ["title", "location", "start", "end", "description", "uid"],
};
function fieldsForType(d: QRDesign) {
  return Object.fromEntries(
    keys[d.type]
      .filter(
        (k) =>
          d.fields[k] !== undefined &&
          (d.type !== "wifi" ||
            d.fields.encryption !== "nopass" ||
            k !== "password"),
      )
      .map((k) => [k, d.fields[k]]),
  );
}
