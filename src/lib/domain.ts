import { z } from "zod";
export const transactionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  kind: z.enum(["revenue", "expense"]),
  amount: z.number().int().positive().max(1_000_000_000_000),
  category: z.string().trim().max(60).default("Lainnya"),
  description: z.string().trim().max(240).default(""),
  date: z.iso.date(),
});
export type Transaction = z.infer<typeof transactionSchema> & {
  created_at?: string;
};
export type Workspace = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  business_type?: string;
  primary_goal?: string;
};
export type Summary = {
  revenue: number;
  expense: number;
  count: number;
  largest_revenue: number;
  largest_expense: number;
  largest_category: string | null;
  largest_amount: number;
  previous_revenue: number;
  previous_count: number;
};
export type Snapshot = {
  workspace: Workspace;
  usage: Usage;
  summary: Summary;
  transactions: Transaction[];
  total: number;
  page: number;
  events: { id: string; name: string; created_at: string }[];
};
export const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function periodDates(period: string, date = today()) {
  if (period === "all")
    return {
      start: "1900-01-01",
      end: "9999-12-31",
      previousStart: "1899-01-01",
      previousEnd: "1899-12-31",
    };
  const [y, m, d] = date.split("-").map(Number);
  const start =
    period === "month" ? `${y}-${String(m).padStart(2, "0")}-01` : date;
  const days =
    Math.round(
      (Date.UTC(y, m - 1, d) - new Date(start + "T00:00:00Z").getTime()) /
        86400000,
    ) + 1;
  const prevEnd = new Date(new Date(start + "T00:00:00Z").getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return {
    start,
    end: date,
    previousStart: prevStart.toISOString().slice(0, 10),
    previousEnd: prevEnd.toISOString().slice(0, 10),
  };
}

export type Usage = {
  record_count: number;
  active_days: number;
  recent_count: number;
};
export type Reveal = {
  key: string;
  title: string;
  context: string;
  description: string;
};
// Editorial relevance only: these thresholds never unlock features or fabricate insight.
export function nextReveal(u: Usage): Reveal | null {
  if (!u.record_count) return null;
  if (u.active_days >= 30 && u.record_count >= 120)
    return {
      key: "automation",
      title: "Pekerjaan rutin berjalan otomatis",
      context: "Catatan sudah menjadi kebiasaan bisnis kamu.",
      description:
        "Nantinya, PRCUISA dapat membantu mengerjakan rutinitas yang berulang.",
    };
  if (u.active_days >= 14 && u.record_count >= 60)
    return {
      key: "assistant",
      title: "Tanya tentang bisnis kamu",
      context: "Ada banyak cerita di balik catatan kamu.",
      description:
        "Nantinya, cukup tanya “Pengeluaran terbesar minggu ini apa?” untuk memahami catatan bisnis.",
    };
  if (u.active_days >= 7 && u.record_count >= 40)
    return {
      key: "daily-report",
      title: "Ringkasan harian otomatis",
      context: "Kamu sudah rutin mencatat aktivitas bisnis.",
      description:
        "Nantinya, ringkasan akhir hari dapat dikirim otomatis tanpa membuka aplikasi.",
    };
  if (u.recent_count >= 20)
    return {
      key: "chat",
      title: "Catat lewat WhatsApp / Telegram",
      context: "Capek mencatat satu-satu?",
      description:
        "Nantinya, tulis “keluar 150rb beli bahan” di chat. PRCUISA bantu merapikan catatannya.",
    };
  if (u.active_days >= 3)
    return {
      key: "trends",
      title: "Perkembangan Bisnis",
      context: "Catatan bisnis kamu sudah mencakup beberapa hari.",
      description:
        "Nantinya, bandingkan ringkasan 7 dan 30 hari untuk memahami perubahan usaha.",
    };
  if (u.record_count >= 3)
    return {
      key: "insight",
      title: "Insight Bisnis lebih mendalam",
      context: "Data bisnis kamu mulai terbentuk.",
      description:
        "Nantinya, PRCUISA bantu mengenali pola dan perubahan penting dari catatan yang cukup.",
    };
  return {
    key: "close-day",
    title: "Tutup Hari",
    context: "Terus catat aktivitas hari ini.",
    description:
      "Nantinya, lihat ringkasan pemasukan, pengeluaran, dan aktivitas dalam satu tampilan di akhir hari.",
  };
}
export function insight(s: Summary, period = "today") {
  const scope = period === "today" ? "hari ini" : "pada periode ini";
  if (!s.count)
    return {
      title: "Mulai dari satu catatan.",
      text: "Semakin rutin kamu mencatat, semakin jelas PRCUISA dapat membantu kamu memahami kondisi bisnis.",
    };
  if (s.largest_category)
    return {
      title: `${s.largest_category} adalah pengeluaran terbesar ${scope}.`,
      text: `Total ${money(s.largest_amount)} dari pengeluaran yang sudah kamu catat. Apakah sudah sesuai rencana?`,
    };
  return {
    title: `${s.count} aktivitas sudah tercatat ${scope}.`,
    text: `Selisih pemasukan & pengeluaran ${money(s.revenue - s.expense)}. Catatan ini belum menunjukkan laba akuntansi.`,
  };
}
