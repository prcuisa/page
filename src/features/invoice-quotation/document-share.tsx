"use client";

import { useEffect, useState } from "react";
import {
  Download,
  Share2,
  Mail,
  MessageCircle,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { Document } from "./domain";

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** PDF is prepared before the share gesture, preserving browser user activation. */
export default function DocumentShare({
  document: doc,
  workspaceId,
  preview,
}: {
  document: Document;
  workspaceId: string;
  preview: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [native, setNative] = useState(false);
  const label = doc.document_type === "quotation" ? "penawaran" : "invoice";
  const business = doc.issuer_snapshot.name || "Bisnis";
  const message = `Halo, berikut ${label} dari ${business} nomor ${doc.document_number || "Draft"}. Terima kasih.`;
  const subject = `${label === "penawaran" ? "Penawaran" : "Invoice"} ${doc.document_number || ""} — ${business}`;
  const email = doc.customer_snapshot.email || "";
  const rawPhone = (doc.customer_snapshot.phone || "").replace(/[^0-9]/g, "");
  const phone = rawPhone.startsWith("0") ? "62" + rawPhone.slice(1) : rawPhone;
  const whatsapp = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message + "\n\nLampiran: " + (file?.name || "dokumen.pdf"))}`;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFile(null);
    setError("");
    setNotice("");
    (async () => {
      let blob: Blob;
      if (preview) {
        const { renderPDF } = await import("./pdf");
        const bytes = await renderPDF(doc, { demo: true });
        blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      } else {
        const response = await fetch(
          `/api/iq/pdf?workspace=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(doc.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw Error(body.error || "PDF belum berhasil dibuat. Coba lagi.");
        }
        blob = await response.blob();
      }
      const name =
        String(doc.document_number || "dokumen")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 80) + ".pdf";
      const prepared = new File([blob], name, { type: "application/pdf" });
      if (live) {
        setFile(prepared);
        try {
          setNative(
            !!navigator.share && !!navigator.canShare?.({ files: [prepared] }),
          );
        } catch {
          setNative(false);
        }
      }
    })()
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // Issued document snapshots are immutable; prepare once per document/version/retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.version, workspaceId, preview, attempt]);

  function sharePDF() {
    if (!file) return;
    setError("");
    setNotice("");
    setSharing(true);
    // Call synchronously from the button gesture; no PDF fetch before navigator.share.
    navigator
      .share({ files: [file], title: subject, text: message })
      .then(() => setNotice("PDF diserahkan ke aplikasi yang kamu pilih."))
      .catch((e: Error) => {
        if (e.name !== "AbortError")
          setError(
            "Menu berbagi belum bisa dibuka. Unduh PDF atau gunakan pilihan WhatsApp/email di bawah.",
          );
      })
      .finally(() => setSharing(false));
  }

  return (
    <section className="iq-share-panel" aria-labelledby="iq-share-title">
      <div className="iq-share-heading">
        <FileText size={19} />
        <div>
          <h3 id="iq-share-title">PDF & bagikan</h3>
          <p>
            {preview
              ? "PDF contoh bertanda DEMO."
              : "Bagikan salinan dokumen kepada pelanggan."}
          </p>
        </div>
      </div>
      {loading && (
        <p role="status" className="iq-share-feedback">
          Menyiapkan PDF…
        </p>
      )}
      {error && (
        <div role="alert" className="iq-share-error">
          <p>{error}</p>
          {!file && (
            <button onClick={() => setAttempt((v) => v + 1)}>
              <RefreshCw size={16} />
              Coba lagi
            </button>
          )}
        </div>
      )}
      {file && (
        <>
          <div className="iq-share-file">
            <FileText size={20} />
            <span>
              <strong>{file.name}</strong>
              <small>PDF · {Math.max(1, Math.ceil(file.size / 1024))} KB</small>
            </span>
          </div>
          <div className="iq-share-buttons">
            <button
              className="primary"
              onClick={() => {
                saveFile(file);
                setNotice("PDF diunduh.");
              }}
            >
              <Download size={17} />
              Unduh PDF
            </button>
            {native && (
              <button disabled={sharing} onClick={sharePDF}>
                <Share2 size={17} />
                {sharing ? "Membuka…" : "Bagikan PDF"}
              </button>
            )}
          </div>
          {native && (
            <p className="iq-share-help">
              Pilih WhatsApp, email, atau aplikasi lain di menu berbagi. PDF
              ikut dilampirkan.
            </p>
          )}
          <details className="iq-share-alternatives" open={!native}>
            <summary>Lewat WhatsApp atau aplikasi email</summary>
            <p>
              PDF akan diunduh, lalu pesan baru dibuka. Lampirkan PDF tersebut
              sebelum mengirim.
            </p>
            <div className="iq-share-buttons">
              <a
                className="button"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  saveFile(file);
                  setNotice("Lampirkan PDF yang baru diunduh di WhatsApp.");
                }}
              >
                <MessageCircle size={17} />
                Buka WhatsApp
              </a>
              <a
                className="button"
                href={mailto}
                onClick={() => {
                  saveFile(file);
                  setNotice(
                    "Lampirkan PDF yang baru diunduh di aplikasi email.",
                  );
                }}
              >
                <Mail size={17} />
                Buka email
              </a>
            </div>
          </details>
        </>
      )}
      {notice && (
        <p role="status" className="iq-share-feedback">
          {notice}
        </p>
      )}
    </section>
  );
}
