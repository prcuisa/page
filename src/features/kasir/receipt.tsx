"use client";
import type { Receipt } from "./domain";
import { rupiah } from "./domain";
export default function ReceiptView({
  receipt: r,
  demo = false,
}: {
  receipt: Receipt;
  demo?: boolean;
}) {
  return (
    <article className="kasir-receipt">
      <header>
        <small>
          {demo ? "STRUK DEMO · BUKAN TRANSAKSI NYATA" : "STRUK PENJUALAN"}
        </small>
        <h2>{r.business}</h2>
        <p>{r.number}</p>
        <time>
          {new Intl.DateTimeFormat("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Jakarta",
          }).format(new Date(r.date))}{" "}
          WIB
        </time>
      </header>
      <div className="kasir-receipt-lines">
        {r.items.map((i, index) => (
          <div key={index}>
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.quantity} × {rupiah(i.price)}
              </small>
            </span>
            <strong>{rupiah(i.total)}</strong>
          </div>
        ))}
      </div>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{rupiah(r.subtotal)}</dd>
        </div>
        <div>
          <dt>Diskon</dt>
          <dd>−{rupiah(r.discount)}</dd>
        </div>
        <div className="kasir-total">
          <dt>Total</dt>
          <dd>{rupiah(r.total)}</dd>
        </div>
        <div>
          <dt>Metode</dt>
          <dd>
            {{ cash: "Tunai", transfer: "Transfer", qris: "QRIS" }[r.method]}
          </dd>
        </div>
        <div>
          <dt>Diterima</dt>
          <dd>{rupiah(r.tendered)}</dd>
        </div>
        {r.method === "cash" && (
          <div>
            <dt>Kembalian</dt>
            <dd>{rupiah(r.change)}</dd>
          </div>
        )}
      </dl>
      {r.method !== "cash" && (
        <p className="meta">
          Pembayaran dicatat manual oleh kasir. Tidak diverifikasi oleh penyedia
          pembayaran.
        </p>
      )}
      <footer>
        Terima kasih telah berbelanja.
        <small>Dibuat dengan Kasir Pinter · PRCUISA</small>
      </footer>
    </article>
  );
}
export function PrintReceipt() {
  return (
    <button className="secondary kasir-no-print" onClick={() => window.print()}>
      Cetak / simpan PDF
    </button>
  );
}
