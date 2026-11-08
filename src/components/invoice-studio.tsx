"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  PenLine,
  FilePlus2,
  ImagePlus,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";

type Item = { description: string; quantity: number; unit_price: number };
type InvoiceData = {
  sender: { name: string; address: string; email: string };
  client: { name: string; address: string; email: string };
  items: Item[];
  tax_rate: number;
  discount_rate: number;
  notes: string;
  logo_data_url: string | null;
};
type SavedInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  created_at: string;
  payload?: InvoiceData;
};
const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
const fresh = (business: string): InvoiceData => ({
  sender: { name: business, address: "", email: "" },
  client: { name: "", address: "", email: "" },
  items: [{ description: "", quantity: 1, unit_price: 0 }],
  tax_rate: 0,
  discount_rate: 0,
  notes: "",
  logo_data_url: null,
});

export default function InvoiceStudio({
  workspaceId,
  workspaceName,
  preview,
}: {
  workspaceId: string;
  workspaceName: string;
  preview: boolean;
}) {
  const [data, setData] = useState(() => fresh(workspaceName));
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [saved, setSaved] = useState<SavedInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  function printInvoice() {
    const original = document.title;
    document.title = invoiceNumber.trim() || "Invoice PRCUISA";
    document.body.classList.add("invoice-printing");
    const restore = () => { document.title = original; document.body.classList.remove("invoice-printing"); };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  }
  const totals = useMemo(() => {
    const subtotal = data.items.reduce(
      (sum, item) =>
        sum + Math.max(0, item.quantity) * Math.max(0, item.unit_price),
      0,
    );
    const discount = Math.round(
      (subtotal * Math.min(100, Math.max(0, data.discount_rate))) / 100,
    );
    const tax = Math.round(
      ((subtotal - discount) * Math.min(100, Math.max(0, data.tax_rate))) / 100,
    );
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [data]);
  async function loadSaved() {
    if (preview || !workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/invoices?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const result = await r.json();
      if (!r.ok)
        throw new Error(
          result.error || "Invoice tersimpan belum berhasil dimuat.",
        );
      setSaved(result.invoices);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadSaved();
  }, [workspaceId, preview]);
  function setParty(
    kind: "sender" | "client",
    field: "name" | "address" | "email",
    value: string,
  ) {
    setData((d) => ({ ...d, [kind]: { ...d[kind], [field]: value } }));
  }
  function setItem(index: number, field: keyof Item, value: string) {
    setData((d) => ({
      ...d,
      items: d.items.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]:
                field === "description"
                  ? value
                  : Math.max(0, Number(value) || 0),
            }
          : item,
      ),
    }));
  }
  async function logoChanged(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Pilih gambar berukuran maksimal 2 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setData((d) => ({ ...d, logo_data_url: String(reader.result) }));
    reader.onerror = () => setError("Logo belum berhasil dibaca.");
    reader.readAsDataURL(file);
  }
  async function saveInvoice() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!data.sender.name.trim() || !invoiceDate) throw new Error("Isi nama bisnis dan tanggal invoice.");
      if (!invoiceNumber.trim())
        throw new Error("Isi nomor invoice terlebih dahulu.");
      if (!data.items.every((i) => i.description.trim() && Number.isSafeInteger(i.quantity) && i.quantity > 0 && Number.isSafeInteger(i.unit_price) && i.unit_price >= 0))
        throw new Error("Lengkapi semua item dengan deskripsi, jumlah bulat, dan harga yang valid.");
      if (preview) {
        setNotice(
          "Preview siap. Invoice akan tersimpan saat kamu masuk ke akun PRCUISA.",
        );
        return;
      }
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspaceId,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          payload: data,
        }),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error || "Invoice belum berhasil disimpan.");
      setNotice(`Invoice ${result.invoice.invoice_number} berhasil disimpan.`);
      await loadSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openSaved(id: string) {
    setError("");
    try {
      const r = await fetch(
        `/api/invoices?workspace=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error || "Invoice belum berhasil dibuka.");
      setInvoiceNumber(result.invoice.invoice_number);
      setInvoiceDate(result.invoice.invoice_date);
      setData(result.invoice.payload);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="invoice-studio">
      <div className="page-heading invoice-heading">
        <div>
          <span className="eyebrow">TOOL BISNIS</span>
          <h1>Invoice</h1>
          <p>Buat invoice sederhana dengan total yang langsung terhitung.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setData(fresh(workspaceName));
            setInvoiceNumber("");
            setInvoiceDate(today());
            setError("");
            setNotice("");
          }}
        >
          <FilePlus2 size={17} /> Invoice baru
        </button>
      </div>
      <div className="invoice-mode" aria-label="Tampilan invoice"><button aria-pressed={mode === "edit"} onClick={() => setMode("edit")}><PenLine size={16}/> Isi invoice</button><button aria-pressed={mode === "preview"} onClick={() => setMode("preview")}><Eye size={16}/> Pratinjau</button></div>
      <div className={`invoice-layout invoice-mode-${mode}`}>
        <section className="invoice-editor" aria-label="Data invoice">
          <h2>Data invoice</h2>
          <div className="invoice-fields two">
            <label>
              Nomor invoice
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                maxLength={50}
              />
            </label>
            <label>
              Tanggal
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="invoice-logo"
            onClick={() => logoInput.current?.click()}
          >
            {data.logo_data_url ? (
              <img src={data.logo_data_url} alt="Logo bisnis" />
            ) : (
              <ImagePlus size={19} />
            )}
            <span>
              {data.logo_data_url ? "Ganti logo bisnis" : "Tambah logo bisnis"}
              <small>PNG, JPG, SVG · Maks. 2 MB</small>
            </span>
          </button>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              onChange={(e) => void logoChanged(e)}
              hidden
            />
          {data.logo_data_url && (
            <button
              type="button"
              className="text-button"
              onClick={() => setData((d) => ({ ...d, logo_data_url: null }))}
            >
              Hapus logo
            </button>
          )}
          <div className="invoice-divider">
            <h3>Dari bisnis</h3>
          </div>
          <div className="invoice-fields">
            <label>
              Nama bisnis
              <input
                value={data.sender.name}
                onChange={(e) => setParty("sender", "name", e.target.value)}
                placeholder="Nama bisnis kamu"
                maxLength={120}
              />
            </label>
            <label>
              Alamat
              <textarea
                value={data.sender.address}
                onChange={(e) => setParty("sender", "address", e.target.value)}
                rows={2}
                maxLength={500}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={data.sender.email}
                onChange={(e) => setParty("sender", "email", e.target.value)}
                placeholder="email@bisnis.com"
                maxLength={254}
              />
            </label>
          </div>
          <div className="invoice-divider">
            <h3>Ditagihkan kepada</h3>
          </div>
          <div className="invoice-fields">
            <label>
              Nama klien
              <input
                value={data.client.name}
                onChange={(e) => setParty("client", "name", e.target.value)}
                placeholder="Nama klien"
                maxLength={120}
              />
            </label>
            <label>
              Alamat
              <textarea
                value={data.client.address}
                onChange={(e) => setParty("client", "address", e.target.value)}
                rows={2}
                maxLength={500}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={data.client.email}
                onChange={(e) => setParty("client", "email", e.target.value)}
                placeholder="email@klien.com"
                maxLength={254}
              />
            </label>
          </div>
          <div className="invoice-divider">
            <h3>Item invoice</h3>
          </div>
          {data.items.map((item, i) => (
            <fieldset className="invoice-line" key={i}>
              <legend>Item {i + 1}</legend>
              <label>Deskripsi<input aria-label={`Deskripsi item ${i + 1}`} value={item.description} onChange={e => setItem(i, "description", e.target.value)} placeholder="Nama barang atau jasa" maxLength={160}/></label>
              <div className="invoice-line-numbers">
                <label>Jumlah<input aria-label={`Jumlah item ${i + 1}`} type="number" inputMode="numeric" min="1" max="999999" step="1" value={item.quantity} onChange={e => setItem(i,"quantity",e.target.value)}/></label>
                <label>Harga satuan (Rp)<input aria-label={`Harga item ${i + 1}`} type="number" inputMode="numeric" min="0" max="999999999999" step="1" value={item.unit_price || ""} onChange={e => setItem(i,"unit_price",e.target.value)} placeholder="0"/></label>
              </div>
              <div className="invoice-line-footer"><span>Jumlah <strong>{rupiah(item.quantity * item.unit_price)}</strong></span><button type="button" className="text-button" aria-label={`Hapus item ${i+1}`} disabled={data.items.length === 1} onClick={() => setData(d => ({...d,items:d.items.filter((_,j)=>j!==i)}))}><Trash2 size={16}/> Hapus</button></div>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary invoice-add"
            disabled={data.items.length >= 50}
            onClick={() =>
              setData((d) => ({
                ...d,
                items: [
                  ...d.items,
                  { description: "", quantity: 1, unit_price: 0 },
                ],
              }))
            }
          >
            <Plus size={16} /> Tambah item
          </button>
          <div className="invoice-divider">
            <h3>Pengaturan</h3>
          </div>
          <div className="invoice-fields two">
            <label>
              Pajak (%)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={data.tax_rate}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    tax_rate: Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  }))
                }
              />
              <small>Isi jika berlaku</small>
            </label>
            <label>
              Diskon (%)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={data.discount_rate}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    discount_rate: Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  }))
                }
              />
            </label>
          </div>
          <label className="invoice-notes-label">
            Catatan
            <textarea
              value={data.notes}
              onChange={(e) =>
                setData((d) => ({ ...d, notes: e.target.value }))
              }
              rows={3}
              maxLength={1000}
              placeholder="Informasi pembayaran atau ucapan terima kasih"
            />
          </label>
          {error && (
            <p className="invoice-message error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="invoice-message success" role="status">
              {notice}
            </p>
          )}
          <div className="invoice-actions">
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => void saveInvoice()}
            >
              <Save size={17} />
              {busy ? "Menyimpan…" : "Simpan invoice"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={printInvoice}
            >
              <Printer size={17} /> Cetak / Simpan PDF
            </button>
          </div>
          <p className="invoice-print-hint">
            Untuk PDF, pilih “Simpan sebagai PDF” di jendela cetak.
          </p>
          {!preview && (
            <div className="invoice-saved">
              <div className="invoice-divider">
                <h3>Invoice tersimpan</h3>
              </div>
              {loading ? (
                <p className="muted">Memuat invoice…</p>
              ) : saved.length ? (
                saved.map((inv) => (
                  <button
                    key={inv.id}
                    className="invoice-saved-row"
                    onClick={() => void openSaved(inv.id)}
                  >
                    <span>
                      <strong>{inv.invoice_number}</strong>
                      <small>
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(inv.invoice_date + "T12:00:00"))}
                      </small>
                    </span>
                    <b>{rupiah(inv.total)}</b>
                  </button>
                ))
              ) : (
                <p className="muted">Belum ada invoice tersimpan.</p>
              )}
            </div>
          )}
        </section>
        <section
          className="invoice-preview-wrap"
          aria-label="Pratinjau invoice"
        >
          <div className="invoice-paper" id="invoice-print-area">
            <div className="invoice-paper-header">
              {data.logo_data_url ? (
                <img
                  className="invoice-paper-logo"
                  src={data.logo_data_url}
                  alt="Logo"
                />
              ) : null}
              <div>
                <div className="invoice-paper-brand">
                  {data.sender.name || "Nama Bisnis"}
                </div>
                <p>{data.sender.address}</p>
                <p>{data.sender.email}</p>
              </div>
              <div className="invoice-paper-number">
                <span>INVOICE</span>
                <strong>{invoiceNumber || "—"}</strong>
                <small>
                  {invoiceDate
                    ? new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "long",
                        timeZone: "Asia/Jakarta",
                      }).format(new Date(invoiceDate + "T12:00:00"))
                    : "—"}
                </small>
              </div>
            </div>
            <div className="invoice-paper-parties">
              <div>
                <span>DARI</span>
                <strong>{data.sender.name || "—"}</strong>
                <p>{data.sender.address}</p>
                <p>{data.sender.email}</p>
              </div>
              <div>
                <span>DITAGIHKAN KEPADA</span>
                <strong>{data.client.name || "—"}</strong>
                <p>{data.client.address}</p>
                <p>{data.client.email}</p>
              </div>
            </div>
            <div className="invoice-paper-table">
              <div className="invoice-paper-table-head">
                <span>Deskripsi</span>
                <span>Qty</span>
                <span>Harga satuan</span>
                <span>Total</span>
              </div>
              {data.items.map((item, i) => (
                <div className="invoice-paper-table-row" key={i}>
                  <span>{item.description || "—"}</span>
                  <span>{item.quantity}</span>
                  <span>{rupiah(item.unit_price)}</span>
                  <strong>{rupiah(item.quantity * item.unit_price)}</strong>
                </div>
              ))}
            </div>
            <div className="invoice-paper-totals">
              <div>
                <span>Subtotal</span>
                <span>{rupiah(totals.subtotal)}</span>
              </div>
              {data.discount_rate > 0 && (
                <div>
                  <span>Diskon ({data.discount_rate}%)</span>
                  <span>−{rupiah(totals.discount)}</span>
                </div>
              )}
              {data.tax_rate > 0 && (
                <div>
                  <span>Pajak ({data.tax_rate}%)</span>
                  <span>{rupiah(totals.tax)}</span>
                </div>
              )}
              <div className="grand-total">
                <strong>Total</strong>
                <strong>{rupiah(totals.total)}</strong>
              </div>
            </div>
            {data.notes && (
              <div className="invoice-paper-notes">
                <strong>CATATAN</strong>
                <p>{data.notes}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
