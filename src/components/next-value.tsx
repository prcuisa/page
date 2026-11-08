"use client";
import { useEffect, useRef, useState } from "react";
import { ReceiptText, X } from "lucide-react";
import { nextReveal, money, type Snapshot, type Reveal } from "@/lib/domain";
export default function NextValue({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  const reveal = nextReveal(snapshot.usage);
  if (!reveal) return null;
  return (
    <>
      <section
        className="next-value"
        aria-label="Selanjutnya untuk bisnis kamu"
      >
        <ReceiptText size={21} />
        <div>
          <span className="tag">Segera Hadir</span>
          <h2>{reveal.title}</h2>
          <p>
            {reveal.context} {reveal.description}
          </p>
          <button className="text-button" onClick={() => setOpen(true)}>
            Lihat Preview
          </button>
        </div>
      </section>
      {open && (
        <FuturePreview
          snapshot={snapshot}
          reveal={reveal}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function FuturePreview({
  snapshot,
  reveal,
  onClose,
}: {
  snapshot: Snapshot;
  reveal: Reveal;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      prior?.focus({ preventScroll: true });
    };
  }, []);
  const { summary: s } = snapshot;
  return (
    <dialog
      ref={ref}
      className="future-dialog"
      aria-labelledby="future-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="future-content">
        <div className="sheet-header">
          <span className="tag">Preview · Belum tersedia</span>
          <button
            className="icon-button"
            aria-label="Tutup preview"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <h2 id="future-title">
          {reveal.key === "close-day" ? "Ringkasan Hari Ini" : reveal.title}
        </h2>
        <p>{reveal.description}</p>
        {reveal.key === "close-day" ? (
          <>
            <dl className="preview-summary">
              <div>
                <dt>Pemasukan</dt>
                <dd>{money(s.revenue)}</dd>
              </div>
              <div>
                <dt>Pengeluaran</dt>
                <dd>{money(s.expense)}</dd>
              </div>
              <div>
                <dt>Selisih</dt>
                <dd>{money(s.revenue - s.expense)}</dd>
              </div>
              <div>
                <dt>Aktivitas hari ini</dt>
                <dd>{s.count}</dd>
              </div>
              <div>
                <dt>Pemasukan terbesar</dt>
                <dd>
                  {s.largest_revenue ? money(s.largest_revenue) : "Belum ada"}
                </dd>
              </div>
              <div>
                <dt>Pengeluaran terbesar</dt>
                <dd>
                  {s.largest_expense ? money(s.largest_expense) : "Belum ada"}
                </dd>
              </div>
            </dl>
            <small>
              Angka di atas berasal dari catatan hari ini. Preview ini tidak
              menutup hari, menyimpan laporan, atau menjadwalkan pengiriman.
            </small>
          </>
        ) : (
          <div className="future-explanation">
            {reveal.key === "chat" ? (
              <>
                <span className="eyebrow">
                  CONTOH PESAN, BUKAN CATATAN BARU
                </span>
                <blockquote>keluar 150rb beli bahan</blockquote>
                <p>
                  Nantinya, kamu dapat memeriksa nominal dan kategori sebelum
                  menyimpan. WhatsApp dan Telegram belum terhubung.
                </p>
              </>
            ) : reveal.key === "assistant" ? (
              <>
                <span className="eyebrow">CONTOH PERTANYAAN</span>
                <blockquote>Pengeluaran terbesar minggu ini apa?</blockquote>
                <p>
                  Asisten nantinya menjawab memakai catatan bisnis kamu. Belum
                  ada jawaban otomatis pada preview ini.
                </p>
              </>
            ) : (
              <p>
                {reveal.key === "trends"
                  ? "Perbandingan 7 dan 30 hari akan membantu melihat kapan pemasukan dan pengeluaran berubah."
                  : reveal.key === "insight"
                    ? "Ringkasan dasar sudah memakai catatan asli. Analisis pola lintas hari dan rekomendasi masih dalam rencana pengembangan."
                    : reveal.key === "daily-report"
                      ? "Nantinya, pilih waktu menerima rekap. Pengiriman laporan otomatis belum aktif."
                      : "Nantinya, pilih pekerjaan berulang yang ingin dibantu. Belum ada pekerjaan yang dijalankan otomatis."}
              </p>
            )}
          </div>
        )}
        <p className="preview-disclaimer">
          {reveal.title} akan hadir bertahap. Belum ada jadwal rilis yang
          ditetapkan.
        </p>
        <button className="secondary" onClick={onClose}>
          Kembali mencatat
        </button>
      </div>
    </dialog>
  );
}
