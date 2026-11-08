"use client";
import { useEffect, useState } from "react";
import { receiptSchema, type Receipt } from "./domain";
import ReceiptView, { PrintReceipt } from "./receipt";
export default function DemoReceipt() {
  const [r, setR] = useState<Receipt | null>(null);
  useEffect(() => {
    try {
      const value = location.hash.slice(1);
      if (value.length > 30000) return;
      setR(receiptSchema.parse(JSON.parse(decodeURIComponent(value))));
    } catch {}
  }, []);
  return (
    <main className="kasir-public">
      <h1>Preview struk digital</h1>
      <p className="notice kasir-no-print">
        Simulasi. Isi struk demo berasal dari tautan dan bisa diubah; bukan
        bukti pembayaran.
      </p>
      {r ? (
        <>
          <ReceiptView receipt={r} demo />
          <PrintReceipt />
        </>
      ) : (
        <p>
          Struk demo tidak tersedia. Buat transaksi dari preview Kasir Pinter.
        </p>
      )}
    </main>
  );
}
