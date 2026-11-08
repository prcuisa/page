"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import RecordForm from "./record-form";
import {
  calculate,
  localDate,
  addDays,
  money,
  type Draft,
  type Document,
  type Customer,
  type CatalogItem,
  type Settings,
  type Line,
} from "./domain";
const blankLine = (): Line => ({
  description: "",
  quantity: "1",
  unit_price: "0",
  unit: "",
  discount_rate: "0",
});
export default function Editor({
  kind,
  document,
  settings,
  customers,
  items,
  busy,
  onSearch,
  onCustomer,
  onSave,
  onClose,
}: {
  kind: "quotation" | "invoice";
  document?: Document;
  settings: Settings;
  customers: Customer[];
  items: CatalogItem[];
  busy: boolean;
  onSearch: (kind: "customers" | "items", q: string) => void;
  onCustomer: (p: Record<string, unknown>) => Promise<string | undefined>;
  onSave: (p: Draft) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState<Draft>(() =>
    document
      ? {
          ...document,
          items: document.items.map((i) => ({
            ...i,
            quantity: String(i.quantity),
            unit_price: String(i.unit_price),
            discount_rate: String(i.discount_rate),
          })),
        }
      : {
          document_type: kind,
          customer_id: "",
          issue_date: localDate(),
          valid_until:
            kind === "quotation"
              ? addDays(localDate(), settings.quotation_days || 14)
              : "",
          due_date:
            kind === "invoice"
              ? addDays(localDate(), settings.due_days || 14)
              : "",
          discount_rate: "0",
          tax_rate: "0",
          notes: settings.notes || "",
          terms: settings.terms || "",
          payment_instructions: settings.payment_instructions || "",
          items: [blankLine()],
        },
  );
  const [dirty, setDirty] = useState(false),
    [customerForm, setCustomerForm] = useState(false),
    [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => {
    setDirty(true);
    setValue((v) => ({ ...v, ...patch }));
  };
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function line(index: number, patch: Partial<Line>) {
    set({
      items: value.items.map((i, n) => (n === index ? { ...i, ...patch } : i)),
    });
  }
  let totals;
  try {
    totals = calculate(
      value.items,
      String(value.discount_rate),
      String(value.tax_rate),
    );
  } catch {
    totals = null;
  }
  return (
    <div className="iq-editor">
      <div className="section-head">
        <h2>
          {document ? "Edit draft" : "Buat"}{" "}
          {kind === "quotation" ? "penawaran" : "invoice"}
        </h2>
        <button
          onClick={() => {
            if (!dirty || confirm("Tinggalkan perubahan yang belum disimpan?"))
              onClose();
          }}
        >
          Tutup
        </button>
      </div>
      {customerForm && (
        <section className="iq-inline-form">
          <h3>Pelanggan baru</h3>
          <RecordForm
            kind="customer"
            busy={busy}
            onSave={async (p) => {
              const id = await onCustomer(p);
              if (id) set({ customer_id: id });
              setCustomerForm(false);
            }}
            onCancel={() => setCustomerForm(false)}
          />
        </section>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await onSave(value);
            setDirty(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
        className="iq-editor-grid"
      >
        <div className="operational-form">
          <section>
            <h3>1. Pelanggan</h3>
            <label>
              Cari pelanggan
              <input
                placeholder="Nama atau perusahaan"
                onChange={(e) => onSearch("customers", e.target.value)}
              />
            </label>
            <label>
              Pilih pelanggan
              <select
                required
                value={value.customer_id}
                onChange={(e) => set({ customer_id: e.target.value })}
              >
                <option value="">Pilih pelanggan</option>
                {document &&
                  !customers.some((c) => c.id === document.customer_id) && (
                    <option value={document.customer_id}>
                      {document.customer_snapshot.name}
                    </option>
                  )}
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company_name ? " · " + c.company_name : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => setCustomerForm((v) => !v)}
            >
              + Tambah pelanggan
            </button>
          </section>
          <div className="iq-field-grid">
            <label>
              Tanggal terbit
              <input
                type="date"
                required
                value={value.issue_date}
                onChange={(e) => set({ issue_date: e.target.value })}
              />
            </label>
            <label>
              {kind === "quotation" ? "Berlaku hingga" : "Jatuh tempo"}
              <input
                type="date"
                min={value.issue_date}
                value={
                  kind === "quotation" ? value.valid_until : value.due_date
                }
                onChange={(e) =>
                  set(
                    kind === "quotation"
                      ? { valid_until: e.target.value }
                      : { due_date: e.target.value },
                  )
                }
              />
            </label>
          </div>
          <section>
            <div className="section-head">
              <h3>2. Barang & jasa</h3>
              <span className="meta">{value.items.length}/100</span>
            </div>
            <details>
              <summary>Ambil dari katalog</summary>
              <label>
                Cari barang / jasa
                <input onChange={(e) => onSearch("items", e.target.value)} />
              </label>
              <select
                aria-label="Pilih dari katalog"
                value=""
                onChange={(e) => {
                  const i = items.find((i) => i.id === e.target.value);
                  if (i && value.items.length < 100)
                    set({
                      items: [
                        ...value.items.filter(
                          (x) => x.description || Number(x.unit_price),
                        ),
                        {
                          description: i.description
                            ? `${i.name} — ${i.description}`
                            : i.name,
                          quantity: "1",
                          unit_price: String(i.default_price),
                          unit: i.unit,
                          discount_rate: "0",
                        },
                      ],
                    });
                }}
              >
                <option value="">Pilih barang / jasa</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {money(i.default_price)}
                  </option>
                ))}
              </select>
            </details>
            {value.items.map((i, index) => (
              <fieldset className="iq-line" key={index}>
                <legend>Item {index + 1}</legend>
                <label>
                  Deskripsi
                  <textarea
                    rows={2}
                    required
                    maxLength={2000}
                    value={i.description}
                    onChange={(e) =>
                      line(index, { description: e.target.value })
                    }
                  />
                </label>
                <div className="iq-field-grid">
                  <label>
                    Jumlah
                    <input
                      type="number"
                      inputMode="decimal"
                      step=".001"
                      min=".001"
                      max="999999"
                      required
                      value={i.quantity}
                      onChange={(e) =>
                        line(index, { quantity: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Harga satuan (Rp)
                    <input
                      type="number"
                      inputMode="decimal"
                      step=".01"
                      min="0"
                      max="999999999999"
                      required
                      value={i.unit_price}
                      onChange={(e) =>
                        line(index, { unit_price: e.target.value })
                      }
                    />
                  </label>
                </div>
                <details>
                  <summary>Satuan & diskon item</summary>
                  <div className="iq-field-grid">
                    <label>
                      Satuan
                      <input
                        maxLength={30}
                        value={i.unit}
                        onChange={(e) => line(index, { unit: e.target.value })}
                      />
                    </label>
                    <label>
                      Diskon (%)
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step=".01"
                        value={i.discount_rate}
                        onChange={(e) =>
                          line(index, { discount_rate: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </details>
                <button
                  type="button"
                  aria-label={`Hapus item ${index + 1}`}
                  disabled={value.items.length === 1}
                  onClick={() =>
                    set({ items: value.items.filter((_, n) => n !== index) })
                  }
                >
                  <Trash2 size={16} /> Hapus item
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={value.items.length >= 100}
              onClick={() => set({ items: [...value.items, blankLine()] })}
            >
              <Plus size={16} /> Tambah item
            </button>
          </section>
          <details>
            <summary>Diskon, pajak, dan catatan</summary>
            <div className="iq-field-grid">
              <label>
                Diskon dokumen (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step=".01"
                  value={value.discount_rate}
                  onChange={(e) => set({ discount_rate: e.target.value })}
                />
              </label>
              <label>
                Pajak opsional (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step=".01"
                  value={value.tax_rate}
                  onChange={(e) => set({ tax_rate: e.target.value })}
                />
              </label>
            </div>
            <p className="meta">
              Pajak dihitung setelah diskon. Ini dokumen bisnis biasa, bukan
              faktur pajak resmi.
            </p>
            {(["notes", "terms", "payment_instructions"] as const).map((k) => (
              <label key={k}>
                {
                  {
                    notes: "Catatan",
                    terms: "Ketentuan",
                    payment_instructions: "Petunjuk pembayaran",
                  }[k]
                }
                <textarea
                  value={value[k]}
                  maxLength={k === "payment_instructions" ? 2000 : 4000}
                  onChange={(e) => set({ [k]: e.target.value })}
                />
              </label>
            ))}
          </details>
        </div>
        <aside className="iq-summary">
          <h3>Ringkasan</h3>
          {totals ? (
            <>
              <p>
                Subtotal <strong>{money(totals.subtotal)}</strong>
              </p>
              <p>
                Diskon <span>−{money(totals.discount_total)}</span>
              </p>
              <p>
                Pajak <span>{money(totals.tax_total)}</span>
              </p>
              <p className="iq-grand">
                Total <strong>{money(totals.grand_total)}</strong>
              </p>
            </>
          ) : (
            <p>Periksa angka pada item.</p>
          )}
          <p className="meta">
            Nomor resmi dibuat saat diterbitkan. Draft masih bisa diedit.
          </p>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !totals}>
            {busy ? "Menyimpan…" : "Simpan draft"}
          </button>
          <span className="meta">
            {dirty
              ? "Ada perubahan belum disimpan."
              : "Draft yang disimpan bisa dilanjutkan nanti."}
          </span>
        </aside>
      </form>
    </div>
  );
}
