"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  QrCode,
} from "lucide-react";
import {
  checkoutSchema,
  productSchema,
  totals,
  rupiah,
  type Checkout,
  type Product,
  type Sale,
} from "./domain";
import ReceiptView, { PrintReceipt } from "./receipt";
type CartLine = { product: Product; quantity: number };
type Summary = {
  count: number;
  total: number;
  top: { name: string; quantity: number }[];
};
export default function Kasir({
  workspaceId,
  workspaceName,
  preview = false,
}: {
  workspaceId: string;
  workspaceName: string;
  preview?: boolean;
}) {
  const [tab, setTab] = useState<"cashier" | "products" | "sales" | "summary">(
    "cashier",
  );
  const [products, setProducts] = useState<Product[]>([]),
    [sales, setSales] = useState<Sale[]>([]),
    [demoProducts, setDemoProducts] = useState<Product[]>([]),
    [demoSales, setDemoSales] = useState<Sale[]>([]);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [cart, setCart] = useState<CartLine[]>([]),
    [discount, setDiscount] = useState("0"),
    [method, setMethod] = useState<Checkout["method"]>("cash"),
    [cash, setCash] = useState("");
  const [loading, setLoading] = useState(!preview),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0),
    [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<Partial<Product> | null>(null),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [shareUrl, setShareUrl] = useState(""),
    [qr, setQr] = useState(""),
    [summary, setSummary] = useState<Summary>({ count: 0, total: 0, top: [] }),
    [pending, setPending] = useState<Checkout | null>(null);
  const checkoutLock = useRef(false),
    shareVersion = useRef(0);
  const storage = `prcuisa.kasir.v1.${preview ? "demo" : "live"}.${workspaceId}`;
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(storage) || "null");
      if (d) {
        if (preview) {
          setDemoProducts(d.products || []);
          setDemoSales(d.sales || []);
        }
        setCart(d.cart || []);
        const saved = d.pending ? checkoutSchema.parse(d.pending) : null;
        setPending(saved);
        if (saved) { setDiscount(String(saved.discount)); setMethod(saved.method); setCash(String(saved.tendered)); }
      }
    } catch {}
    setReady(true);
  }, [storage, preview]);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        storage,
        JSON.stringify({
          products: preview ? demoProducts : [],
          sales: preview ? demoSales : [],
          cart,
          pending,
        }),
      );
    } catch {}
  }, [storage, ready, preview, demoProducts, demoSales, cart, pending]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const section = tab === "cashier" || tab === "products" ? "products" : tab;
    fetch(
      "/api/kasir?" +
        new URLSearchParams({
          workspace: workspaceId,
          section,
          q: search,
          page: String(page),
        }),
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (section === "products") setProducts(d.rows);
        else if (section === "sales") setSales(d.rows);
        else setSummary(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, search, workspaceId, preview, refresh]);
  async function send(action: string, payload: unknown) {
    const r = await fetch("/api/kasir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: workspaceId, action, payload }),
    });
    const d = await r.json();
    if (!r.ok)
      throw Object.assign(Error(d.error || "Belum berhasil disimpan."), {
        status: r.status,
      });
    return d;
  }
  const allProducts = preview ? demoProducts : products;
  const matches = allProducts.filter((p) =>
    [p.name, p.category].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const shown = preview ? matches.slice(page * 25, (page + 1) * 25) : matches;
  const shownSales = preview
    ? demoSales
        .filter((s) =>
          s.receipt.number.toLowerCase().includes(search.toLowerCase()),
        )
        .slice(page * 25, (page + 1) * 25)
    : sales;
  let subtotal = 0,
    total = 0;
  try {
    const t = totals(
      cart.map((i) => ({
        id: i.product.id,
        price: i.product.price,
        quantity: i.quantity,
      })),
      Number(discount),
    );
    subtotal = t.subtotal;
    total = t.total;
  } catch {
    subtotal = cart.reduce((n, i) => n + i.quantity * i.product.price, 0);
    total = NaN;
  }
  const valid =
    cart.length > 0 &&
    Number.isFinite(total) &&
    Number.isInteger(Number(discount)) &&
    Number(discount) >= 0;
  const locked = busy || !!pending;
  function add(p: Product) {
    if (locked) return;
    setNotice("");
    setCart((c) => {
      const found = c.find((i) => i.product.id === p.id);
      return found
        ? c.map((i) =>
            i.product.id === p.id
              ? { ...i, quantity: Math.min(9999, i.quantity + 1) }
              : i,
          )
        : c.length < 50
          ? [...c, { product: p, quantity: 1 }]
          : c;
    });
  }
  function selectTab(t: typeof tab) {
    setTab(t);
    setPage(0);
    setQuery("");
    setSearch("");
    setEditing(null);
    setError("");
  }
  function openReceipt(s: Sale) {
    shareVersion.current++;
    setReceipt(s);
    setShareUrl("");
    setQr("");
    setError("");
  }
  async function checkout() {
    if (checkoutLock.current) return;
    checkoutLock.current = true;
    setBusy(true);
    setError("");
    try {
      const p =
        pending ||
        checkoutSchema.parse({
          key: crypto.randomUUID(),
          items: cart.map((i) => ({
            id: i.product.id,
            quantity: i.quantity,
            price: i.product.price,
          })),
          discount: Number(discount),
          method,
          tendered: method === "cash" ? Number(cash) : total,
        });
      const calculated = totals(p.items, p.discount);
      if (p.tendered < calculated.total)
        throw Error("Uang diterima belum mencukupi.");
      setPending(p);
      let s: Sale;
      if (preview) {
        s = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          receipt: {
            number: `DEMO-KP-${demoSales.length + 1}`,
            date: new Date().toISOString(),
            business: workspaceName,
            items: p.items.map((i) => {
              const product = demoProducts.find((x) => x.id === i.id);
              if (!product) throw Error("Barang tidak ditemukan.");
              return {
                name: product.name,
                price: i.price,
                quantity: i.quantity,
                total: i.price * i.quantity,
              };
            }),
            subtotal: calculated.subtotal,
            discount: p.discount,
            total: calculated.total,
            method: p.method,
            tendered: p.tendered,
            change: p.tendered - calculated.total,
          },
        };
        setDemoSales((a) => [s, ...a]);
      } else s = await send("checkout", p);
      setPending(null);
      setCart([]);
      setDiscount("0");
      setCash("");
      setRefresh((v) => v + 1);
      setNotice(
        preview ? "Transaksi demo dibuat." : "Penjualan berhasil dicatat.",
      );
      openReceipt(s);
    } catch (e) {
      if (
        preview ||
        (((e as { status?: number }).status || 0) >= 400 &&
          ((e as { status?: number }).status || 0) < 500)
      )
        setPending(null);
      setError((e as Error).message || "Periksa isian pembayaran.");
    } finally {
      checkoutLock.current = false;
      setBusy(false);
    }
  }
  async function saveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const p = productSchema.parse({
        id: editing?.id,
        name: f.get("name"),
        category: f.get("category"),
        price: Number(f.get("price")),
        active: f.get("active") === "on",
      });
      if (preview) {
        const item = { ...p, id: p.id || crypto.randomUUID() };
        setDemoProducts((a) => [...a.filter((x) => x.id !== item.id), item]);
      } else await send("product", p);
      setEditing(null);
      setRefresh((v) => v + 1);
      setNotice("Barang disimpan.");
    } catch {
      setError("Barang belum disimpan. Periksa nama, harga, dan izin akun.");
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!receipt || busy) return;
    const version = ++shareVersion.current;
    setBusy(true);
    setError("");
    try {
      const path = preview
        ? "/preview/struk#" +
          encodeURIComponent(JSON.stringify(receipt.receipt))
        : (await send("share", { id: receipt.id })).path;
      const url = new URL(path, location.origin).href;
      const QR = (await import("qrcode")).default;
      const png = await QR.toDataURL(url, {
        width: 280,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      if (version !== shareVersion.current) return;
      setShareUrl(url);
      setQr(png);
    } catch {
      setError(
        "QR belum dapat dibuat. Coba lagi; untuk struk panjang di preview gunakan cetak/PDF.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!receipt || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!preview) await send("revoke", { id: receipt.id });
      shareVersion.current++;
      setShareUrl("");
      setQr("");
      setNotice("Tautan struk dicabut.");
    } catch {
      setError("Tautan belum berhasil dicabut. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  const day = (d: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
      new Date(d),
    );
  const todaySales = demoSales.filter(
    (s) => day(s.created_at) === day(new Date().toISOString()),
  );
  const top = Object.entries(
    todaySales
      .flatMap((s) => s.receipt.items)
      .reduce<Record<string, number>>(
        (a, i) => ({ ...a, [i.name]: (a[i.name] || 0) + i.quantity }),
        {},
      ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, quantity]) => ({ name, quantity }));
  const stats = preview
    ? {
        count: todaySales.length,
        total: todaySales.reduce((n, s) => n + s.receipt.total, 0),
        top,
      }
    : summary;
  return (
    <div className="kasir-app">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PRCUISA TOOLS · BISNIS</span>
          <h1>Kasir Pinter</h1>
          <p>
            {workspaceName} · Pilih barang, terima pembayaran, bagikan struk.
          </p>
        </div>
      </header>
      {preview && (
        <p className="notice">
          Mode demo. Data hanya disimpan di sesi browser ini. QR demo bisa
          dipindai, tetapi bukan bukti pembayaran.
        </p>
      )}
      <nav className="kasir-tabs" aria-label="Menu Kasir Pinter">
        {(["cashier", "products", "sales", "summary"] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => selectTab(t)}
          >
            {
              {
                cashier: "Kasir",
                products: "Barang",
                sales: "Riwayat",
                summary: "Hari ini",
              }[t]
            }
          </button>
        ))}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <p className="notice">
          Ada pembayaran yang belum mendapat konfirmasi. Coba kirim ulang dengan
          tombol di keranjang; pengiriman ulang tidak membuat transaksi kedua.
          Periksa riwayat sebelum transaksi berikutnya.
        </p>
      )}
      {receipt ? (
        <section className="kasir-receipt-view">
          <div className="kasir-no-print kasir-toolbar">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                shareVersion.current++;
                setReceipt(null);
                setQr("");
                setShareUrl("");
              }}
            >
              <ArrowLeft size={16} /> Kembali ke kasir
            </button>
            <PrintReceipt />
          </div>
          <div className="kasir-print-area">
            <ReceiptView receipt={receipt.receipt} demo={preview} />
            {qr && (
              <div className="kasir-receipt-qr">
                <img
                  src={qr}
                  alt="QR untuk membuka struk digital"
                  width={200}
                  height={200}
                />
                <p>Scan untuk buka struk</p>
              </div>
            )}
          </div>
          <div className="kasir-share kasir-no-print">
            <h2>Struk digital lewat QR</h2>
            <p>
              {preview
                ? "QR demo membawa salinan struk dalam tautan."
                : "Siapa pun yang memiliki tautan dapat melihat struk ini selama 30 hari. Membuat QR baru mengganti tautan lama."}
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void share()}
            >
              <QrCode size={18} />
              {busy
                ? "Memproses…"
                : shareUrl
                  ? "Buat QR baru"
                  : "Aktifkan QR struk"}
            </button>
            {shareUrl && (
              <>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button secondary"
                >
                  Buka struk
                </a>
                <a
                  href={qr}
                  download={`${receipt.receipt.number}-qr.png`}
                  className="button secondary"
                >
                  Unduh QR
                </a>
              </>
            )}
            {!preview && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void revoke()}
              >
                Cabut tautan struk
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {tab !== "summary" && (
            <div className="kasir-toolbar">
              <label className="kasir-search">
                <Search size={18} />
                <input
                  type="search"
                  maxLength={120}
                  aria-label="Cari barang atau struk"
                  placeholder={
                    tab === "sales"
                      ? "Cari nomor struk"
                      : "Cari nama atau kategori barang"
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              {tab === "products" && (
                <button className="primary" onClick={() => setEditing({})}>
                  <Plus size={16} />
                  Tambah barang
                </button>
              )}
            </div>
          )}
          {editing && tab === "products" && (
            <form
              key={editing.id || "new"}
              className="kasir-product-form"
              onSubmit={saveProduct}
            >
              <h2>{editing.id ? "Ubah barang" : "Barang baru"}</h2>
              <label>
                Nama barang
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing.name}
                />
              </label>
              <label>
                Kategori (opsional)
                <input
                  name="category"
                  maxLength={60}
                  defaultValue={editing.category}
                />
              </label>
              <label>
                Harga (Rp)
                <input
                  name="price"
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  max="1000000000"
                  step="1"
                  defaultValue={editing.price}
                />
              </label>
              <label className="kasir-check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editing.active !== false}
                />
                Aktif dijual
              </label>
              <div className="kasir-toolbar">
                <button className="primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan barang"}
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Batal
                </button>
              </div>
            </form>
          )}
          <div className={tab === "cashier" ? "kasir-layout" : ""}>
            <section>
              {loading ? (
                <p role="status">Memuat…</p>
              ) : tab === "cashier" || tab === "products" ? (
                <>
                  {shown.length ? (
                    <div className="kasir-products">
                      {shown
                        .filter((p) => tab === "products" || p.active)
                        .map((p) => (
                          <article key={p.id}>
                            <small>{p.category || "Barang"}</small>
                            <h3>{p.name}</h3>
                            <strong>{rupiah(p.price)}</strong>
                            {tab === "cashier" ? (
                              <button
                                className="secondary"
                                disabled={locked}
                                onClick={() => add(p)}
                              >
                                <Plus size={16} />
                                Tambah
                              </button>
                            ) : (
                              <button onClick={() => setEditing(p)}>
                                {p.active ? "Ubah barang" : "Nonaktif · Ubah"}
                              </button>
                            )}
                          </article>
                        ))}
                    </div>
                  ) : (
                    <div className="quiet-empty">
                      <h2>
                        {search
                          ? "Barang tidak ditemukan"
                          : "Mulai dengan barang daganganmu"}
                      </h2>
                      <p>
                        {search
                          ? "Coba nama atau kategori lain."
                          : "Simpan nama dan harga sekali, lalu pilih saat melayani pelanggan."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => {
                          selectTab("products");
                          setEditing({});
                        }}
                      >
                        Tambah barang
                      </button>
                    </div>
                  )}
                </>
              ) : tab === "sales" ? (
                <div className="kasir-sales">
                  {shownSales.length ? (
                    shownSales.map((s) => (
                      <button key={s.id} onClick={() => openReceipt(s)}>
                        <span>
                          <strong>{s.receipt.number}</strong>
                          <small>
                            {new Date(s.created_at).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                            })}
                          </small>
                        </span>
                        <strong>{rupiah(s.receipt.total)}</strong>
                      </button>
                    ))
                  ) : (
                    <p className="quiet-empty">
                      {search
                        ? "Struk tidak ditemukan."
                        : "Belum ada penjualan. Mulai dari menu Kasir."}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <h2>Ringkasan hari ini</h2>
                  <div className="kasir-stats">
                    <div>
                      <span>Penjualan tercatat</span>
                      <strong>{rupiah(stats.total)}</strong>
                    </div>
                    <div>
                      <span>Transaksi</span>
                      <strong>{stats.count}</strong>
                    </div>
                  </div>
                  <h3>Barang terlaris</h3>
                  {stats.top.length ? (
                    <ul>
                      {stats.top.map((i) => (
                        <li key={i.name}>
                          {i.name} · {i.quantity} terjual
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Belum ada penjualan hari ini.</p>
                  )}
                  <p className="meta">
                    Berdasarkan transaksi yang dicatat kasir. Tidak otomatis
                    dimasukkan ke Business Report.
                  </p>
                </>
              )}
              {tab !== "summary" && (
                <div className="iq-pagination">
                  <button
                    disabled={loading || page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Sebelumnya
                  </button>
                  <span>Halaman {page + 1}</span>
                  <button
                    disabled={
                      loading ||
                      (tab === "sales" ? shownSales.length : shown.length) < 25
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </section>
            {tab === "cashier" && (
              <aside className="kasir-cart">
                <h2>
                  <ShoppingCart size={20} />
                  Keranjang
                </h2>
                {cart.length ? (
                  cart.map((i) => (
                    <div className="kasir-cart-line" key={i.product.id}>
                      <div>
                        <strong>{i.product.name}</strong>
                        <small>{rupiah(i.product.price)}</small>
                      </div>
                      <label>
                        Jumlah
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="9999"
                          step="1"
                          disabled={locked}
                          value={i.quantity}
                          onChange={(e) =>
                            setCart((c) =>
                              c.map((x) =>
                                x.product.id === i.product.id
                                  ? {
                                      ...x,
                                      quantity: Math.max(
                                        1,
                                        Math.min(
                                          9999,
                                          Math.floor(
                                            Number(e.target.value) || 1,
                                          ),
                                        ),
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        aria-label={`Hapus ${i.product.name}`}
                        disabled={locked}
                        onClick={() =>
                          setCart((c) =>
                            c.filter((x) => x.product.id !== i.product.id),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p>Pilih barang untuk mulai.</p>
                )}
                <label>
                  Diskon (Rp)
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={Math.min(subtotal, 1e9)}
                    step="1"
                    disabled={locked}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </label>
                <div className="kasir-total">
                  <span>Total</span>
                  <strong>{valid ? rupiah(total) : "—"}</strong>
                </div>
                <label>
                  Metode pembayaran
                  <select
                    disabled={locked}
                    value={method}
                    onChange={(e) =>
                      setMethod(e.target.value as Checkout["method"])
                    }
                  >
                    <option value="cash">Tunai</option>
                    <option value="transfer">Transfer (manual)</option>
                    <option value="qris">QRIS (manual)</option>
                  </select>
                </label>
                {method === "cash" ? (
                  <>
                    <label>
                      Uang diterima (Rp)
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        disabled={locked}
                        value={cash}
                        onChange={(e) => setCash(e.target.value)}
                      />
                    </label>
                    <p>
                      Kembalian:{" "}
                      {valid && Number(cash) >= total
                        ? rupiah(Number(cash) - total)
                        : "—"}
                    </p>
                  </>
                ) : (
                  <p className="meta">
                    Periksa pembayaran di rekening atau aplikasi merchant
                    sebelum mencatat. QR struk bukan QR pembayaran.
                  </p>
                )}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (!pending &&
                      (!valid || (method === "cash" && Number(cash) < total)))
                  }
                  onClick={() => void checkout()}
                >
                  {busy
                    ? "Menyimpan…"
                    : pending
                      ? "Coba kirim ulang"
                      : "Pembayaran diterima · Buat struk"}
                </button>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
