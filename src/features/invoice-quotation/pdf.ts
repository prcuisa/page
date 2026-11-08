import { PDFDocument, StandardFonts, rgb } from "@/vendor/pdf-lib";
import { money, type Document } from "./domain";
// Vector text, A4, standard PDF fonts. No screenshots or remote resource fetching.
export async function renderPDF(d: Document, options: { demo?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `${d.document_type === "quotation" ? "Penawaran" : "Invoice"} ${d.document_number || "Draft"}`,
  );
  pdf.setAuthor(d.issuer_snapshot.name || "PRCUISA");
  const stamp = new Date(d.created_at);
  if (!Number.isNaN(stamp.getTime())) {
    pdf.setCreationDate(stamp);
    pdf.setModificationDate(stamp);
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.263, 0.259, 0.259),
    teal = rgb(0, 0.604, 0.647);
  let page = pdf.addPage([595.28, 841.89]),
    y = 788;
  const safe = (v: unknown) =>
    String(v ?? "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
  const next = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 788;
  };
  function line(text: unknown, size = 10, strong = false) {
    const f = strong ? bold : font;
    const paragraphs = safe(text).split("\n");
    for (const paragraph of paragraphs) {
      let current = "";
      for (const char of paragraph) {
        if (f.widthOfTextAtSize(current + char, size) > 490) {
          if (y < 70) next();
          page.drawText(current, { x: 48, y, size, font: f, color: ink });
          y -= size + 5;
          current = "";
        }
        current += char;
      }
      if (y < 70) next();
      page.drawText(current, { x: 48, y, size, font: f, color: ink });
      y -= size + 5;
    }
  }
  const rule = () => {
    if (y < 80) next();
    page.drawLine({
      start: { x: 48, y },
      end: { x: 547, y },
      thickness: 1,
      color: teal,
    });
    y -= 18;
  };
  if (options.demo) {
    line("DEMO - contoh dokumen, bukan dokumen resmi", 10, true);
    y -= 10;
  }
  const logo = d.issuer_snapshot.logo;
  if (logo) {
    try {
      const b = Uint8Array.from(atob(logo.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const img = logo.startsWith("data:image/png")
        ? await pdf.embedPng(b)
        : await pdf.embedJpg(b);
      const scale = Math.min(90 / img.width, 55 / img.height);
      page.drawImage(img, {
        x: 48,
        y: y - img.height * scale,
        width: img.width * scale,
        height: img.height * scale,
      });
      y -= 65;
    } catch {
      throw Error("Logo tidak dapat dibaca. Periksa gambar bisnis.");
    }
  }
  line(d.issuer_snapshot.name, 20, true);
  line(d.document_type === "quotation" ? "PENAWARAN" : "INVOICE", 13, true);
  line(d.document_number || "DRAFT - belum diterbitkan", 12, true);
  line(`Tanggal: ${d.issue_date}`);
  if (d.valid_until) line(`Berlaku hingga: ${d.valid_until}`);
  if (d.due_date) line(`Jatuh tempo: ${d.due_date}`);
  rule();
  line("DARI", 10, true);
  for (const k of ["name", "address", "email", "phone"] as const)
    if (d.issuer_snapshot[k]) line(d.issuer_snapshot[k]);
  y -= 10;
  line("UNTUK", 10, true);
  for (const k of [
    "name",
    "company_name",
    "address",
    "email",
    "phone",
    "tax_identifier",
  ] as const)
    if (d.customer_snapshot[k]) line(d.customer_snapshot[k]);
  y -= 10;
  rule();
  for (const [index, i] of d.items.entries()) {
    if (y < 120) next();
    line(`${index + 1}. ${i.description}`, 11, true);
    line(
      `${i.quantity} ${i.unit || ""} x ${money(i.unit_price)}${Number(i.discount_rate) > 0 ? ` | Diskon ${i.discount_rate}%` : ""}`,
    );
    const total = (i as typeof i & { line_total?: number }).line_total;
    line(`Jumlah: ${money(total ?? 0)}`, 10, true);
    y -= 8;
  }
  rule();
  line(`Subtotal: ${money(d.subtotal)}`);
  if (Number(d.discount_total))
    line(`Diskon dokumen (${d.discount_rate}%): -${money(d.discount_total)}`);
  if (Number(d.tax_total))
    line(`Pajak (${d.tax_rate}%): ${money(d.tax_total)}`);
  line(`TOTAL: ${money(d.grand_total)}`, 16, true);
  for (const [label, value] of [
    ["Petunjuk pembayaran", d.payment_instructions],
    ["Catatan", d.notes],
    ["Ketentuan", d.terms],
  ])
    if (value) {
      y -= 16;
      line(label, 11, true);
      line(value);
    }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Dibuat dengan PRCUISA | ${i + 1} / ${pages.length}`, {
      x: 48,
      y: 35,
      size: 8,
      font,
      color: ink,
    }),
  );
  return pdf.save();
}
