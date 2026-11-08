"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BusinessOnboarding from "./business-onboarding";
import NextValue from "./next-value";
import {
  LayoutDashboard,
  Grid2X2,
  Activity,
  Settings,
  ChevronDown,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ChartNoAxesCombined,
  Command,
  ScanLine,
  Workflow,
  Bot,
  X,
  Check,
  LogOut,
  CalendarDays,
  Building2,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import {
  type Snapshot,
  type Workspace,
  type Transaction,
  type Summary,
  money,
  today,
  periodDates,
  insight,
} from "@/lib/domain";
import { browserClient } from "@/lib/supabase/browser";
type View = "dashboard" | "apps" | "activity" | "settings" | "report";
const nav = [
  {
    id: "dashboard",
    name: "Hari Ini",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    id: "report",
    name: "Laporan",
    icon: ChartNoAxesCombined,
    path: "/apps/business-report",
  },
  { id: "activity", name: "Riwayat", icon: Activity, path: "/activity" },
  { id: "settings", name: "Pengaturan", icon: Settings, path: "/settings" },
] as const;
const initial: Workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Bisnis Percobaan",
  currency: "IDR",
  timezone: "Asia/Jakarta",
};
const eventNames: Record<string, string> = {
  workspace_created: "Bisnis dibuat",
  revenue_recorded: "Pemasukan dicatat",
  expense_recorded: "Pengeluaran dicatat",
  workspace_opened: "Bisnis dibuka",
  workspace_updated: "Nama bisnis diperbarui",
  upgrade_intent: "Informasi paket dilihat",
};
const dateLabel = (s: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(s.length === 10 ? s + "T00:00:00+07:00" : s));
function previewSnapshot(
  workspace: Workspace,
  rows: Transaction[],
  period: string,
  page: number,
): Snapshot {
  const d = periodDates(period);
  const filtered = rows.filter((r) => r.date >= d.start && r.date <= d.end);
  const previous = rows.filter(
    (r) => r.date >= d.previousStart && r.date <= d.previousEnd,
  );
  const categories: Record<string, number> = {};
  let revenue = 0,
    expense = 0;
  for (const r of filtered) {
    if (r.kind === "revenue") revenue += r.amount;
    else {
      expense += r.amount;
      categories[r.category] = (categories[r.category] || 0) + r.amount;
    }
  }
  const largest = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const summary: Summary = {
    revenue,
    expense,
    count: filtered.length,
    largest_revenue: Math.max(
      0,
      ...filtered.filter((t) => t.kind === "revenue").map((t) => t.amount),
    ),
    largest_expense: Math.max(
      0,
      ...filtered.filter((t) => t.kind === "expense").map((t) => t.amount),
    ),
    largest_category: largest?.[0] || null,
    largest_amount: largest?.[1] || 0,
    previous_revenue: previous
      .filter((t) => t.kind === "revenue")
      .reduce((a, t) => a + t.amount, 0),
    previous_count: previous.length,
  };
  return {
    workspace,
    summary,
    usage: {
      record_count: rows.filter((t) => t.date <= today()).length,
      active_days: new Set(
        rows.filter((t) => t.date <= today()).map((t) => t.date),
      ).size,
      recent_count: rows.filter(
        (t) =>
          t.date <= today() &&
          t.date >=
            new Date(new Date(today() + "T00:00:00Z").getTime() - 6 * 86400000)
              .toISOString()
              .slice(0, 10),
      ).length,
    },
    transactions: [...filtered]
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.created_at || "").localeCompare(a.created_at || ""),
      )
      .slice(page * 20, page * 20 + 20),
    total: filtered.length,
    page,
    events: rows
      .slice()
      .reverse()
      .map((t) => ({
        id: t.id,
        name: t.kind + "_recorded",
        created_at: t.created_at!,
      }))
      .slice(0, 20),
  };
}
async function request(body: unknown) {
  const res = await fetch("/api/hub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Belum berhasil menyimpan.");
  return data;
}
export default function Hub({
  view: initialView,
  preview = false,
  onboardingPreview = false,
  embedded = false,
  workspaceContext,
  onValue,
}: {
  view: View;
  preview?: boolean;
  onboardingPreview?: boolean;
  embedded?: boolean;
  workspaceContext?: Workspace;
  onValue?: () => void;
}) {
  const [view, setView] = useState(initialView),
    [workspaces, setWorkspaces] = useState<Workspace[]>(
      preview ? [initial] : [],
    ),
    [workspaceId, setWorkspaceId] = useState(workspaceContext?.id || ""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(
      preview
        ? previewSnapshot(workspaceContext || initial, [], "today", 0)
        : null,
    ),
    [rows, setRows] = useState<Transaction[]>([]),
    [previewWorkspace, setPreviewWorkspace] = useState(
      workspaceContext || initial,
    ),
    [period, setPeriod] = useState(
      initialView === "report" ? "month" : "today",
    ),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(!preview),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [sheet, setSheet] = useState<"revenue" | "expense" | null>(null),
    [toast, setToast] = useState(""),
    [onboardingDone, setOnboardingDone] = useState(!onboardingPreview),
    [onboardingActive, setOnboardingActive] = useState(false),
    [settingsBusy, setSettingsBusy] = useState(false),
    [profileBusy, setProfileBusy] = useState(false);
  useEffect(() => {
    if (embedded) setView(initialView);
  }, [embedded, initialView]);
  useEffect(() => {
    if (workspaceContext) {
      setWorkspaceId(workspaceContext.id);
      setPreviewWorkspace(workspaceContext);
    }
  }, [workspaceContext]);
  const effectivePeriod =
    view === "dashboard" ? "today" : view === "activity" ? "all" : period;
  const requestId = useRef(0);
  const eventRecorded = useRef("");
  const load = useCallback(async () => {
    if (preview) return;
    const seq = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/hub?workspace=${workspaceId}&period=${effectivePeriod}&page=${page}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (seq !== requestId.current) return;
      if (!data.snapshot) setOnboardingActive(true);
      setWorkspaces(data.workspaces);
      setSnapshot(data.snapshot);
      setName(data.name);
      setEmail(data.email);
      if (
        data.snapshot &&
        eventRecorded.current !== data.snapshot.workspace.id
      ) {
        eventRecorded.current = data.snapshot.workspace.id;
        void request({
          action: "event",
          workspace_id: data.snapshot.workspace.id,
          name: "workspace_opened",
        }).catch(() => {});
      }
    } catch (e) {
      if (seq === requestId.current)
        setError(
          e instanceof Error ? e.message : "Data belum berhasil dimuat.",
        );
    } finally {
      if (seq === requestId.current) setLoading(false);
    }
  }, [preview, workspaceId, effectivePeriod, page]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (preview)
      setSnapshot(
        previewSnapshot(previewWorkspace, rows, effectivePeriod, page),
      );
  }, [preview, previewWorkspace, rows, effectivePeriod, page]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function createWorkspace(values: {
    name: string;
    business_type: string;
    primary_goal: string;
  }) {
    if (preview) {
      const w = { ...initial, ...values };
      setPreviewWorkspace(w);
      setWorkspaces([w]);
      return;
    }
    const data = await request({ action: "workspace", ...values });
    setWorkspaceId(data.workspace.id);
  }
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileBusy(true);
    setError("");
    const fullName = String(
      new FormData(e.currentTarget).get("full_name"),
    ).trim();
    try {
      if (!preview) await request({ action: "profile", full_name: fullName });
      setName(fullName);
      setToast("Nama kamu diperbarui.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function saveTransaction(tx: Transaction) {
    if (preview) {
      setRows((old) =>
        old.some((r) => r.id === tx.id)
          ? old
          : [...old, { ...tx, created_at: new Date().toISOString() }],
      );
    } else {
      await request({ action: "transaction", transaction: tx });
    }
    onValue?.();
    setSheet(null);
    setToast(
      `${tx.kind === "revenue" ? "Pemasukan" : "Pengeluaran"} ${money(tx.amount)} berhasil dicatat.`,
    );
    setPage(0);
    await load();
  }
  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSettingsBusy(true);
    setError("");
    const newName = String(new FormData(e.currentTarget).get("name")).trim();
    try {
      if (preview) {
        setPreviewWorkspace((w) => ({ ...w, name: newName }));
        setWorkspaces((w) => w.map((x) => ({ ...x, name: newName })));
      } else {
        await request({
          action: "rename",
          id: snapshot!.workspace.id,
          name: newName,
        });
        await load();
      }
      setToast("Nama bisnis diperbarui.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettingsBusy(false);
    }
  }
  async function logout() {
    try {
      const { error } = await browserClient().auth.signOut();
      if (error) throw error;
      location.assign("/login");
    } catch {
      setError("Belum berhasil keluar. Silakan coba lagi.");
    }
  }
  const go = (v: View) => {
    setView(v);
    setPage(0);
  };
  const s = snapshot?.summary;
  const note = s ? insight(s, effectivePeriod) : null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={preview ? "/preview" : "/dashboard"}>
          prcuisa<span>hub</span>
        </Link>
        <div className="sidebar-caption">BISNIS</div>
        <nav aria-label="Navigasi utama">
          {nav.map(({ id, name: label, icon: Icon, path }) =>
            preview ? (
              <button
                key={id}
                className={`nav-link ${view === id || (view === "report" && id === "report") ? "active" : ""} ${id === "settings" ? "settings-link" : ""}`}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                {label}
              </button>
            ) : (
              <Link
                key={id}
                href={path}
                aria-current={view === id ? "page" : undefined}
                className={`nav-link ${view === id || (view === "report" && id === "report") ? "active" : ""} ${id === "settings" ? "settings-link" : ""}`}
              >
                <Icon size={19} />
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="system-mark">
            <Command size={17} /> Satu ruang. Banyak kemungkinan.
          </div>
          <small>Catat. Pahami. Otomatiskan.</small>
          <a href="https://prcuisa.com" target="_blank" rel="noreferrer">
            PRCUISA <ExternalLink size={12} />
          </a>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="workspace-picker">
            <span className="workspace-icon">
              <Building2 size={19} />
            </span>
            <div>
              <span className="meta">Bisnis</span>
              <div className="workspace-name">
                {workspaces.length > 1 ? (
                  <select
                    aria-label="Pilih bisnis"
                    value={snapshot?.workspace.id || ""}
                    onChange={(e) => {
                      setWorkspaceId(e.target.value);
                      setPage(0);
                    }}
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  snapshot?.workspace.name || "Bisnis baru"
                )}
              </div>
            </div>
            {workspaces.length > 1 && <ChevronDown size={14} />}
          </div>
          <div className="topbar-right">
            <span className="workspace-private">
              <LockLabel /> Pribadi
            </span>
            <span className="avatar" aria-label={name || "Akun"}>
              {(name || "P").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        {preview && (
          <div className="preview-banner">
            <span>
              <strong>Preview</strong> · Catatan tidak disimpan.
            </span>
            <Link href="/signup">Buat PRCUISA ID</Link>
          </div>
        )}
        <main
          id={embedded ? "business-main" : "main"}
          className="main-content"
          aria-busy={loading}
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "dashboard"
                  ? `HALO${name ? ", " + name.split(" ")[0].toUpperCase() : ""}`
                  : view === "report"
                    ? "BUSINESS REPORT"
                    : "PRCUISA HUB"}
              </div>
              <h1>
                {view === "dashboard"
                  ? "Hari Ini"
                  : view === "apps"
                    ? "Satu bisnis, banyak kemungkinan."
                    : view === "activity"
                      ? "Aktivitas bisnis"
                      : view === "settings"
                        ? "Pengaturan"
                        : "Catatan usaha"}
              </h1>
              <p>
                {view === "dashboard"
                  ? "Bagaimana kondisi bisnis kamu hari ini?"
                  : view === "report"
                    ? "Pemasukan dan pengeluaran, tercatat dengan rapi."
                    : view === "apps"
                      ? "Mulai dari yang dibutuhkan usahamu sekarang."
                      : view === "activity"
                        ? "Jejak pencatatan dan perubahan terbaru."
                        : "Kelola identitas dan ruang kerja usahamu."}
              </p>
            </div>
            {view === "report" && snapshot && (
              <div className="period-control">
                <CalendarDays size={16} />
                <select
                  aria-label="Periode laporan"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="today">Hari ini</option>
                  <option value="month">Bulan ini</option>
                  <option value="all">Semua catatan</option>
                </select>
              </div>
            )}
          </div>
          {error && (
            <div className="error error-bar" role="alert">
              {error}
              <button className="text-button" onClick={() => void load()}>
                Coba lagi
              </button>
            </div>
          )}
          {loading && !snapshot && !onboardingActive ? (
            <div className="loading-panel" role="status">
              <span className="spinner" />
              Memuat bisnis…
            </div>
          ) : (!snapshot && !error) ||
            (preview && !onboardingDone) ||
            onboardingActive ? (
            <BusinessOnboarding
              onCreate={createWorkspace}
              onComplete={() => {
                setOnboardingDone(true);
                setOnboardingActive(false);
                setView("dashboard");
                setSheet("revenue");
                void load();
              }}
            />
          ) : (
            snapshot && (
              <>
                {(view === "dashboard" || view === "report") && (
                  <>
                    {s!.count > 0 ? (
                      <section
                        className="metrics"
                        aria-label="Ringkasan periode"
                      >
                        <Metric
                          label="Pemasukan"
                          amount={s!.revenue}
                          icon={<ArrowDownLeft size={18} />}
                          detail="Total yang masuk"
                        />
                        <Metric
                          label="Pengeluaran"
                          amount={s!.expense}
                          icon={<ArrowUpRight size={18} />}
                          detail="Total yang keluar"
                        />
                        <Metric
                          label="Selisih"
                          amount={s!.revenue - s!.expense}
                          icon={<Wallet size={18} />}
                          detail="Selisih pemasukan & pengeluaran"
                          accent
                        />
                      </section>
                    ) : (
                      <section className="empty-overview">
                        <div className="empty-symbol">
                          <ReceiptText size={28} />
                        </div>
                        <div>
                          <span className="eyebrow">
                            LANGKAH KECIL, USAHA LEBIH TERATUR
                          </span>
                          <h2>
                            {snapshot.usage.record_count === 0
                              ? "Selamat datang di PRCUISA"
                              : "Belum ada catatan pada periode ini."}
                          </h2>
                          <p>
                            Mulai dari aktivitas bisnis hari ini.
                            <br />
                            Catat pemasukan atau pengeluaran pertama kamu.
                          </p>
                          {preview && snapshot.usage.record_count === 0 && (
                            <button
                              className="text-button demo-sample-button"
                              onClick={() => {
                                const created = new Date().toISOString();
                                setRows([
                                  {
                                    id: crypto.randomUUID(),
                                    workspace_id: previewWorkspace.id,
                                    kind: "revenue",
                                    amount: 250000,
                                    category: "Penjualan",
                                    description: "Contoh pemasukan hari ini",
                                    date: today(),
                                    created_at: created,
                                  },
                                  {
                                    id: crypto.randomUUID(),
                                    workspace_id: previewWorkspace.id,
                                    kind: "expense",
                                    amount: 70000,
                                    category: "Bahan baku",
                                    description: "Contoh pengeluaran hari ini",
                                    date: today(),
                                    created_at: created,
                                  },
                                ]);
                              }}
                            >
                              Lihat contoh dashboard
                            </button>
                          )}
                        </div>
                        <div className="empty-steps">
                          <span>
                            <b>01</b> Catat
                          </span>
                          <span>
                            <b>02</b> Pahami
                          </span>
                          <span>
                            <b>03</b> Ulangi
                          </span>
                        </div>
                      </section>
                    )}
                    <div className="quick-actions">
                      <button
                        className="primary"
                        onClick={() => setSheet("revenue")}
                        disabled={loading}
                      >
                        <Plus size={18} />{" "}
                        {snapshot.usage.record_count
                          ? "Pemasukan"
                          : "Catat Pemasukan"}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setSheet("expense")}
                        disabled={loading}
                      >
                        <Plus size={18} />{" "}
                        {snapshot.usage.record_count
                          ? "Pengeluaran"
                          : "Catat Pengeluaran"}
                      </button>
                      <span className="muted">
                        Satu catatan. Usaha lebih jelas.
                      </span>
                    </div>
                    {view === "dashboard" && (
                      <section className="insight">
                        <div className="insight-icon">
                          <Lightbulb size={21} />
                        </div>
                        <div>
                          <span className="eyebrow">
                            INSIGHT BISNIS{" "}
                            <span className="tag">Ringkasan data</span>
                          </span>
                          <h3>{note!.title}</h3>
                          <p>{note!.text}</p>
                        </div>
                      </section>
                    )}
                    {view === "dashboard" && <NextValue snapshot={snapshot} />}
                    <section className="transactions">
                      <div className="section-heading">
                        <h2>
                          {view === "report"
                            ? "Transaksi"
                            : "Aktivitas Terbaru"}{" "}
                          <span className="count">{snapshot.total}</span>
                        </h2>
                        {view === "dashboard" &&
                          (preview ? (
                            <button
                              className="text-button"
                              onClick={() => go("report")}
                            >
                              Lihat semua
                            </button>
                          ) : (
                            <Link href="/apps/business-report">
                              Lihat semua
                            </Link>
                          ))}
                      </div>
                      {snapshot.transactions.length ? (
                        <>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Transaksi</th>
                                  <th>Kategori</th>
                                  <th>Tanggal</th>
                                  <th className="right">Nominal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {snapshot.transactions
                                  .slice(0, view === "dashboard" ? 5 : 20)
                                  .map((t) => (
                                    <tr key={t.id}>
                                      <td>
                                        <div className="transaction-name">
                                          <span
                                            className={`transaction-icon ${t.kind}`}
                                          >
                                            {t.kind === "revenue" ? (
                                              <ArrowDownLeft size={18} />
                                            ) : (
                                              <ArrowUpRight size={18} />
                                            )}
                                          </span>
                                          <div>
                                            <strong>
                                              {t.description ||
                                                (t.kind === "revenue"
                                                  ? "Pemasukan"
                                                  : "Pengeluaran")}
                                            </strong>
                                            <small>
                                              {t.kind === "revenue"
                                                ? "Pemasukan"
                                                : "Pengeluaran"}
                                            </small>
                                          </div>
                                        </div>
                                      </td>
                                      <td>
                                        <span className="category">
                                          {t.category || "Lainnya"}
                                        </span>
                                      </td>
                                      <td className="muted nowrap">
                                        {dateLabel(t.date)}
                                      </td>
                                      <td className={`right amount ${t.kind}`}>
                                        {t.kind === "revenue" ? "+" : "−"}{" "}
                                        {money(t.amount)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          {view === "report" && snapshot.total > 20 && (
                            <div className="pagination">
                              <button
                                aria-label="Halaman sebelumnya"
                                disabled={!page || loading}
                                onClick={() => setPage((p) => p - 1)}
                              >
                                <ChevronLeft size={18} />
                              </button>
                              <span>
                                Halaman {page + 1} dari{" "}
                                {Math.ceil(snapshot.total / 20)}
                              </span>
                              <button
                                aria-label="Halaman berikutnya"
                                disabled={
                                  (page + 1) * 20 >= snapshot.total || loading
                                }
                                onClick={() => setPage((p) => p + 1)}
                              >
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="empty-table">
                          <ReceiptText size={23} />
                          <strong>Belum ada transaksi.</strong>
                          <p>
                            Pemasukan atau pengeluaran pertama akan muncul di
                            sini.
                          </p>
                        </div>
                      )}
                    </section>
                    <p className="data-note">
                      Selisih pemasukan & pengeluaran dari catatan kamu, bukan
                      laba akuntansi.
                    </p>
                  </>
                )}
                {view === "apps" && (
                  <section className="app-grid">
                    {[
                      {
                        title: "Business Report",
                        text: "Catat pemasukan dan pengeluaran. Pahami hasil usaha setiap hari.",
                        icon: ChartNoAxesCombined,
                        active: true,
                      },
                      {
                        title: "AI Agent",
                        text: "Asisten AI untuk membantu pekerjaan bisnis.",
                        icon: Bot,
                      },
                      {
                        title: "Automation",
                        text: "Hubungkan pekerjaan berulang menjadi alur otomatis.",
                        icon: Workflow,
                      },
                      {
                        title: "QR Tools",
                        text: "Utilitas QR untuk kebutuhan usahamu.",
                        icon: ScanLine,
                      },
                    ].map(({ title, text, icon: Icon, active }) => (
                      <article
                        className={`product-card ${active ? "available" : ""}`}
                        key={title}
                      >
                        <div className="product-top">
                          <span className="icon-tile">
                            <Icon size={26} />
                          </span>
                          <span className={`tag ${active ? "active-tag" : ""}`}>
                            {active ? "Aktif" : "Segera hadir"}
                          </span>
                        </div>
                        <h2>{title}</h2>
                        <p>{text}</p>
                        {active ? (
                          preview ? (
                            <button
                              className="primary"
                              onClick={() => go("report")}
                            >
                              Buka Business Report
                            </button>
                          ) : (
                            <Link
                              className="button primary"
                              href="/apps/business-report"
                            >
                              Buka Business Report
                            </Link>
                          )
                        ) : (
                          <span className="muted">Belum tersedia</span>
                        )}
                      </article>
                    ))}
                  </section>
                )}
                {view === "activity" && (
                  <section className="activity-list">
                    {snapshot.transactions.length ? (
                      snapshot.transactions.map((t) => (
                        <div className="activity-item" key={t.id}>
                          <span className="activity-dot">
                            {t.kind === "revenue" ? (
                              <ArrowDownLeft size={17} />
                            ) : (
                              <ArrowUpRight size={17} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {t.description ||
                                (t.kind === "revenue"
                                  ? "Pemasukan"
                                  : "Pengeluaran")}
                            </strong>
                            <p>
                              {dateLabel(t.date)} · {t.category}
                            </p>
                          </div>
                          <strong className="history-amount">
                            {t.kind === "revenue" ? "+" : "−"} {money(t.amount)}
                          </strong>
                        </div>
                      ))
                    ) : (
                      <div className="empty-table">
                        <ReceiptText />
                        <h3>Belum ada catatan.</h3>
                        <p>Catat aktivitas bisnis hari ini untuk memulai.</p>
                      </div>
                    )}
                    {snapshot.total > 20 && (
                      <div className="pagination">
                        <button
                          disabled={!page || loading}
                          onClick={() => setPage((p) => p - 1)}
                          aria-label="Halaman sebelumnya"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <span>
                          {page + 1} / {Math.ceil(snapshot.total / 20)}
                        </span>
                        <button
                          disabled={
                            (page + 1) * 20 >= snapshot.total || loading
                          }
                          onClick={() => setPage((p) => p + 1)}
                          aria-label="Halaman berikutnya"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {view === "settings" && (
                  <div className="settings-sections">
                    <section>
                      <h2>PRCUISA ID</h2>
                      <form onSubmit={saveProfile}>
                        <label>
                          Nama kamu
                          <input
                            name="full_name"
                            defaultValue={name}
                            required
                            minLength={1}
                            maxLength={80}
                          />
                        </label>
                        <button className="secondary" disabled={profileBusy}>
                          {profileBusy ? "Menyimpan…" : "Simpan nama"}
                        </button>
                      </form>
                      <div className="setting-line">
                        <span>Email</span>
                        <strong>{preview ? "Tidak diperlukan" : email}</strong>
                      </div>
                      {!preview && (
                        <button
                          className="secondary"
                          onClick={() => void logout()}
                        >
                          <LogOut size={16} /> Keluar dari akun
                        </button>
                      )}
                    </section>
                    <section>
                      <h2>Bisnis</h2>
                      <form onSubmit={rename} key={snapshot.workspace.id}>
                        <label>
                          Nama bisnis
                          <input
                            name="name"
                            defaultValue={snapshot.workspace.name}
                            minLength={2}
                            maxLength={80}
                            required
                          />
                        </label>
                        <div className="setting-line">
                          <span>Mata uang</span>
                          <strong>Rupiah (IDR)</strong>
                        </div>
                        <div className="setting-line">
                          <span>Zona waktu</span>
                          <strong>Asia/Jakarta</strong>
                        </div>
                        <button className="primary" disabled={settingsBusy}>
                          {settingsBusy ? "Menyimpan…" : "Simpan perubahan"}
                        </button>
                      </form>
                    </section>
                    <p className="secondary-app-link">
                      {preview ? (
                        <button
                          className="text-button"
                          onClick={() => go("apps")}
                        >
                          Lihat aplikasi PRCUISA
                        </button>
                      ) : (
                        <Link href="/apps">Lihat aplikasi PRCUISA</Link>
                      )}
                    </p>
                  </div>
                )}
              </>
            )
          )}
          <footer className="app-footer">
            <span>PRCUISA HUB</span>
            <span>Build smarter systems that keep working.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigasi mobile">
        {nav.map(({ id, name: label, icon: Icon, path }) =>
          preview ? (
            <button
              className={view === id ? "active" : ""}
              key={id}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ) : (
            <Link className={view === id ? "active" : ""} href={path} key={id}>
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ),
        )}
      </nav>
      {sheet && snapshot && (
        <EntrySheet
          kind={sheet}
          workspace={snapshot.workspace}
          onClose={() => setSheet(null)}
          onSave={saveTransaction}
        />
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function LockLabel() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="6" width="10" height="7" rx="2" stroke="currentColor" />
      <path d="M3 6V4a3 3 0 016 0v2" stroke="currentColor" />
    </svg>
  );
}
function Metric({
  label,
  amount,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  amount: number;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "metric-profit" : ""}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{money(amount)}</strong>
      <small>{detail}</small>
    </article>
  );
}
function EntrySheet({
  kind,
  workspace,
  onClose,
  onSave,
}: {
  kind: "revenue" | "expense";
  workspace: Workspace;
  onClose: () => void;
  onSave: (tx: Transaction) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [amount, setAmount] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    ref.current
      ?.querySelector<HTMLInputElement>('input[name="amount"]')
      ?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const label = kind === "revenue" ? "Pemasukan" : "Pengeluaran";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const n = Number(amount.replace(/\D/g, ""));
    if (!Number.isSafeInteger(n) || n <= 0 || n > 1e12) {
      setError("Masukkan nominal antara Rp 1 dan Rp 1 triliun.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        id: id.current,
        workspace_id: workspace.id,
        kind,
        amount: n,
        category: String(f.get("category") || "Lainnya"),
        description: String(f.get("description") || ""),
        date: String(f.get("date") || today()),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="entry-dialog"
      aria-labelledby="entry-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="sheet-content">
        <div className="sheet-header">
          <span className="icon-tile">
            {kind === "revenue" ? <ArrowDownLeft /> : <ArrowUpRight />}
          </span>
          <button
            className="icon-button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={busy}
          >
            <X size={22} />
          </button>
        </div>
        <h2 id="entry-title">Berapa {label.toLowerCase()}?</h2>
        <p className="muted">Catat di {workspace.name}.</p>
        <form onSubmit={submit}>
          <label>
            Nominal
            <span className="amount-input">
              <span>Rp</span>
              <input
                name="amount"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
                  setAmount(
                    digits ? Number(digits).toLocaleString("id-ID") : "",
                  );
                }}
                required
                aria-describedby="amount-hint"
              />
            </span>
          </label>
          <small id="amount-hint" className="muted">
            Nominal rupiah penuh, tanpa desimal.
          </small>
          <details className="entry-details">
            <summary>
              Tambah kategori, catatan, atau tanggal{" "}
              <span className="optional">opsional</span>
            </summary>{" "}
            <label>
              Kategori <span className="optional">opsional</span>
              <select name="category">
                <option>Lainnya</option>
                {(kind === "revenue"
                  ? ["Penjualan", "Jasa", "Pendapatan lain"]
                  : [
                      "Bahan baku",
                      "Pakan",
                      "Operasional",
                      "Transportasi",
                      "Gaji",
                    ]
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Catatan <span className="optional">opsional</span>
              <input
                name="description"
                placeholder={
                  kind === "revenue"
                    ? "Contoh: Penjualan hari ini"
                    : "Contoh: Belanja bahan baku"
                }
                maxLength={240}
              />
            </label>
            <label>
              Tanggal
              <input name="date" type="date" defaultValue={today()} />
            </label>
          </details>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary save-button" disabled={busy}>
            {busy ? "Menyimpan…" : `Simpan ${label}`}
          </button>
          <small className="muted">
            Ringkasan akan diperbarui setelah catatan tersimpan.
          </small>
        </form>
      </div>
    </dialog>
  );
}
