"use client";
import DashboardAuth from "./dashboard-auth";
import MembershipPlans from "./membership-plans";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plug,
  ShoppingCart,
  Home,
  Grid2X2,
  MessageSquarePlus,
  Activity,
  Settings,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Star,
  ReceiptText,
  QrCode,
  FileText,
  Lightbulb,
  LogOut,
  Building2,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
const Hub = dynamic(() => import("./hub"), {
  loading: () => <p role="status">Memuat Business Report…</p>,
});
import TeamSettings from "./team-settings";
import RequestIdeas from "./request-ideas";
import BusinessOnboarding from "./business-onboarding";
import {
  previewTools,
  matchesTool,
  eventLabels,
  statusLabels,
  type Tool,
  type PlatformData,
} from "@/lib/platform";
import { type Workspace } from "@/lib/domain";
const KasirPinter = dynamic(() => import("@/features/kasir/app"), {
  loading: () => <p role="status">Memuat Kasir Pinter…</p>,
});
const QRStudio = dynamic(() => import("./qr-studio"), {
  loading: () => <p role="status">Memuat QR Tools…</p>,
});
const InvoiceQuotation = dynamic(
  () => import("@/features/invoice-quotation/app"),
  {
    loading: () => <p role="status">Memuat Invoice &amp; Quotation…</p>,
  },
);
import { browserClient } from "@/lib/supabase/browser";
const Connect = dynamic(() => import("@/features/connect/app"));
export type PlatformView =
  | "connect"
  | "kasir-pinter"
  | "home"
  | "tools"
  | "requests"
  | "activity"
  | "settings"
  | "billing"
  | "integrations"
  | "business-report"
  | "qr"
  | "invoice"
  | "team"
  | "invoice-quotation";
const paths: Record<PlatformView, string> = {
  connect: "/connect",
  "kasir-pinter": "/tools/kasir-pinter",
  team: "/settings/team",
  "invoice-quotation": "/tools/invoice-quotation",
  home: "/dashboard",
  tools: "/tools",
  requests: "/requests",
  activity: "/activity",
  settings: "/settings",
  billing: "/settings/billing",
  integrations: "/settings/integrations",
  "business-report": "/tools/business-report",
  qr: "/tools/qr",
  invoice: "/tools/invoice",
};
const navigation = [
  { id: "home", label: "Home", icon: Home },
  { id: "tools", label: "Tools", icon: Grid2X2 },
  { id: "connect", label: "Connect", icon: Plug },
  { id: "requests", label: "Permintaan", icon: MessageSquarePlus },
  { id: "activity", label: "Aktivitas", icon: Activity },
  { id: "settings", label: "Akun", icon: Settings },
] as const;
const initialWorkspace: Workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Bisnis Percobaan",
  currency: "IDR",
  timezone: "Asia/Jakarta",
};
function emptyData(): PlatformData {
  return {
    name: "",
    email: "",
    tools: previewTools,
    states: [],
    requests: [],
    events: [],
    plan: "free",
    access: [
      { capability: "business-report", enabled: true, monthly_limit: null },
      { capability: "qr", enabled: true, monthly_limit: null },
      { capability: "kasir-pinter", enabled: true, monthly_limit: null },
      { capability: "connect", enabled: true, monthly_limit: null },
      { capability: "invoice-quotation", enabled: true, monthly_limit: null },
    ],
    usage: [],
  };
}
async function send(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Belum berhasil diproses.");
  return data;
}
const time = (s: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(s));
export default function Platform({
  view: initialView = "home",
  preview = false,
  onboardingPreview = false,
  iqPath,
}: {
  view?: PlatformView;
  preview?: boolean;
  onboardingPreview?: boolean;
  iqPath?: string[];
}) {
  const [view, setView] = useState<PlatformView>(initialView),
    [data, setData] = useState<PlatformData>(emptyData),
    [workspaces, setWorkspaces] = useState<Workspace[]>(
      preview ? [initialWorkspace] : [],
    ),
    [workspace, setWorkspace] = useState<Workspace | null>(
      preview ? initialWorkspace : null,
    ),
    [loading, setLoading] = useState(!preview),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Semua"),
    [onboarding, setOnboarding] = useState(onboardingPreview),
    [businessMounted, setBusinessMounted] = useState(
      initialView === "business-report",
    ),
    [businessView, setBusinessView] = useState<
      "dashboard" | "report" | "activity"
    >("dashboard"),
    [qrMounted, setQrMounted] = useState(initialView === "qr"),
    [iqMounted, setIqMounted] = useState(initialView === "invoice-quotation"),
    [future, setFuture] = useState<Tool | null>(null);
  const [billing, setBilling] = useState<{
    plans: {
      plan_id: string;
      amount_idr: number | null;
      period_days: number;
      active: boolean;
    }[];
    subscription: {
      plan_id: string;
      status: string;
      current_period_end: string | null;
    } | null;
    payments: {
      order_id: string;
      plan_id: string;
      amount_idr: number;
      status: string;
      created_at: string;
    }[];
    paymentConfigured: boolean;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      setSidebarCollapsed(
        localStorage.getItem("prcuisa.sidebar.collapsed") === "true",
      );
    } catch {}
  }, []);
  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      try {
        localStorage.setItem("prcuisa.sidebar.collapsed", String(!value));
      } catch {}
      return !value;
    });
  }
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const sequence = useRef(0),
    previewDialog = useRef<HTMLDialogElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    initialLogged = useRef("");
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        ["home", "tools"].includes(view)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [view]);
  const load = useCallback(
    async (id?: string) => {
      if (preview) return;
      const seq = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `/api/platform?context=1${id ? "&workspace=" + id : ""}`,
          { cache: "no-store" },
        );
        const base = await r.json();
        if (!r.ok) throw new Error(base.error);
        if (seq !== sequence.current) return;
        setWorkspaces(base.workspaces);
        if (!base.snapshot) {
          setOnboarding(true);
          return;
        }
        const w = base.snapshot.workspace;
        const response = await fetch("/api/platform?workspace=" + w.id, {
          cache: "no-store",
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        if (seq !== sequence.current) return;
        setWorkspace(w);
        setData(value);
      } catch (e) {
        if (seq === sequence.current) setError((e as Error).message);
      } finally {
        if (seq === sequence.current) setLoading(false);
      }
    },
    [preview],
  );
  useEffect(() => {
    void load(
      new URLSearchParams(location.search).get("workspace") || undefined,
    );
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const back = () => {
      const v = location.pathname.startsWith("/tools/invoice-quotation")
        ? "invoice-quotation"
        : (Object.keys(paths) as PlatformView[]).find(
            (key) => paths[key] === location.pathname,
          ) || "home";
      setView(v);
      if (v === "business-report") setBusinessMounted(true);
      if (v === "invoice-quotation") setIqMounted(true);
      if (v === "invoice") {
        setView("invoice-quotation");
        setIqMounted(true);
      }
      if (v === "invoice-quotation") setIqMounted(true);
      if (!preview) {
        setWorkspace(null);
        setData(emptyData());
        setQrMounted(v === "qr");
        void load(
          new URLSearchParams(location.search).get("workspace") || undefined,
        );
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [preview, load]);
  useEffect(() => {
    if (future) previewDialog.current?.showModal();
  }, [future]);
  const refreshBilling = useCallback(async () => {
    if (preview || !workspace) return;
    setBillingBusy(true);
    setBillingError("");
    try {
      const response = await fetch(
        `/api/billing?workspace=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Informasi paket belum berhasil dimuat.",
        );
      setBilling(result);
    } catch (e) {
      setBillingError((e as Error).message);
    } finally {
      setBillingBusy(false);
    }
  }, [preview, workspace]);
  async function checkPayment(orderId: string) {
    if (!workspace) return;
    setBillingBusy(true);
    setBillingError("");
    try {
      const response = await fetch("/api/billing/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: workspace.id, order_id: orderId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Status belum berhasil diperiksa.");
      await refreshBilling();
    } catch (e) {
      setBillingError((e as Error).message);
    } finally {
      setBillingBusy(false);
    }
  }
  useEffect(() => {
    if (view === "billing" && !preview && workspace) void refreshBilling();
  }, [view, preview, workspace, refreshBilling]);
  useEffect(() => {
    if (!workspace || preview || initialLogged.current === workspace.id) return;
    initialLogged.current = workspace.id;
    if (
      [
        "business-report",
        "qr",
        "invoice",
        "invoice-quotation",
        "kasir-pinter",
        "connect",
      ].includes(initialView)
    ) {
      void send("/api/platform", {
        workspace: workspace.id,
        action: "open",
        app: initialView,
      })
        .then(() => {
          setData((d) => ({
            ...d,
            states: [
              ...d.states.filter((s) => s.app_id !== initialView),
              {
                app_id: initialView,
                favorite:
                  d.states.find((s) => s.app_id === initialView)?.favorite ||
                  false,
                last_opened_at: new Date().toISOString(),
              },
            ],
          }));
        })
        .catch((e) => setError((e as Error).message));
    }
    void send("/api/platform", {
      workspace: workspace.id,
      action: "hub_viewed",
    }).catch(() => {});
  }, [workspace, preview, initialView]);
  function navigate(v: PlatformView) {
    setView(v);
    setError("");
    setQuery("");
    setCategory("Semua");
    if (!preview)
      window.history.pushState(
        {},
        "",
        paths[v] + (workspace ? "?workspace=" + workspace.id : ""),
      );
    if (v === "billing") void action("upgrade_viewed").catch(() => {});
    window.scrollTo({ top: 0 });
  }
  function localEvent(name: string, app_id: string | null = null) {
    setData((d) => ({
      ...d,
      events: [
        {
          id: crypto.randomUUID(),
          name,
          app_id,
          created_at: new Date().toISOString(),
        },
        ...d.events,
      ].slice(0, 50),
    }));
  }
  async function action(
    action: string,
    app?: string,
    payload: Record<string, unknown> = {},
  ) {
    if (!workspace) throw new Error("Buat bisnis kamu dulu.");
    if (!preview)
      return send("/api/platform", {
        workspace: workspace.id,
        action,
        app,
        payload,
      });
    return { ok: true };
  }
  async function openTool(tool: Tool) {
    if (tool.status !== "active" && tool.status !== "beta") {
      setFuture(tool);
      return;
    }
    if (
      ![
        "business-report",
        "qr",
        "invoice",
        "invoice-quotation",
        "kasir-pinter",
        "connect",
      ].includes(tool.slug)
    ) {
      setError("Tool ini belum terhubung ke Hub.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action("open", tool.slug);
      setData((d) => {
        const old = d.states.find((s) => s.app_id === tool.slug);
        return {
          ...d,
          states: [
            ...d.states.filter((s) => s.app_id !== tool.slug),
            {
              app_id: tool.slug,
              favorite: old?.favorite || false,
              last_opened_at: new Date().toISOString(),
            },
          ],
        };
      });
      localEvent("tool_opened", tool.slug);
      if (tool.slug === "business-report") setBusinessMounted(true);
      if (tool.slug === "qr") setQrMounted(true);

      if (tool.slug === "invoice-quotation") setIqMounted(true);
      navigate(tool.slug as PlatformView);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function favorite(tool: Tool) {
    const selected = !data.states.find((s) => s.app_id === tool.slug)?.favorite;
    setBusy(true);
    setError("");
    try {
      await action("favorite", tool.slug, { favorite: selected });
      setData((d) => {
        const old = d.states.find((s) => s.app_id === tool.slug);
        return {
          ...d,
          states: [
            ...d.states.filter((s) => s.app_id !== tool.slug),
            {
              app_id: tool.slug,
              favorite: selected,
              last_opened_at: old?.last_opened_at || null,
            },
          ],
        };
      });
      setToast(selected ? "Ditambahkan ke favorit." : "Dihapus dari favorit.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const payload = {
      problem: String(f.get("problem")).trim(),
      workflow: String(f.get("workflow") || "").trim(),
      frequency: String(f.get("frequency") || ""),
    };
    if (payload.problem.length < 10) {
      setError(
        "Ceritakan masalahmu sedikit lebih lengkap, minimal 10 karakter.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await action("request", undefined, payload);
      setData((d) => ({
        ...d,
        requests: [
          {
            ...payload,
            id: result.id || crypto.randomUUID(),
            status: "submitted",
            created_at: new Date().toISOString(),
          },
          ...d.requests,
        ],
      }));
      localEvent("tool_request_submitted");
      form.reset();
      setToast(
        preview
          ? "Permintaan dicoba. Preview tidak mengirim atau menyimpan permintaan."
          : "Permintaan diterima. Kamu bisa melihat statusnya di sini.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createBusiness(values: {
    name: string;
    business_type: string;
    primary_goal: string;
  }) {
    if (preview) {
      const w = { ...initialWorkspace, ...values };
      setWorkspace(w);
      setWorkspaces([w]);
    } else {
      const res = await send("/api/hub", { action: "workspace", ...values });
      await load(res.workspace.id);
    }
  }
  async function updateSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("full_name")).trim(),
      business = String(f.get("name")).trim();
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        await send("/api/hub", { action: "profile", full_name: name });
        if (data.workspace_role === "owner")
          await send("/api/hub", {
            action: "rename",
            id: workspace?.id,
            name: business,
          });
      }
      setData((d) => ({ ...d, name }));
      setWorkspace((w) => (w ? { ...w, name: business } : w));
      setWorkspaces((ws) =>
        ws.map((w) => (w.id === workspace?.id ? { ...w, name: business } : w)),
      );
      setToast("Pengaturan diperbarui.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await browserClient()
        .auth.signOut()
        .then(({ error }) => {
          if (error) throw error;
        });
      location.assign("/login");
    } catch {
      setError("Belum berhasil keluar. Coba lagi.");
      setBusy(false);
    }
  }
  const visibleTools = data.tools.filter((t) => t.slug !== "invoice");
  const active = visibleTools.filter((t) =>
    ["active", "beta"].includes(t.status),
  );
  const filtered = visibleTools.filter(
    (t) =>
      matchesTool(t, query) &&
      (category === "Semua" || t.category === category),
  );
  const recent = data.states
    .filter((s) => s.last_opened_at)
    .sort((a, b) => b.last_opened_at!.localeCompare(a.last_opened_at!))
    .map((s) => visibleTools.find((t) => t.slug === s.app_id))
    .filter((t): t is Tool => Boolean(t));
  const favorites = active.filter((t) =>
    data.states.some((s) => s.app_id === t.slug && s.favorite),
  );
  const search = (
    <form
      className="tool-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        void action("tool_searched").catch(() => {});
      }}
    >
      <Search size={20} aria-hidden="true" />
      <input
        ref={searchRef}
        type="search"
        aria-label="Cari PRCUISA Tools"
        aria-keyshortcuts="Control+K Meta+K"
        placeholder="Cari tools, misalnya invoice atau QR"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query && <kbd className="tool-search-shortcut">Ctrl K</kbd>}
      {query && (
        <button
          type="button"
          className="tool-search-clear"
          aria-label="Hapus kata pencarian"
          onClick={() => setQuery("")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </form>
  );
  function card(t: Tool, compact = false) {
    const isActive = ["active", "beta"].includes(t.status);
    const isFavorite = data.states.some(
      (s) => s.app_id === t.slug && s.favorite,
    );
    const Icon =
      t.slug === "connect"
        ? Plug
        : t.icon === "kasir"
          ? ShoppingCart
          : t.icon === "report"
            ? ReceiptText
            : t.icon === "qr"
              ? QrCode
              : t.icon === "invoice"
                ? FileText
                : Lightbulb;
    const last = data.states.find((s) => s.app_id === t.slug)?.last_opened_at;
    return (
      <article key={t.slug} className={`tool-card ${compact ? "compact" : ""}`}>
        <div className="tool-card-top">
          <span className="icon-tile">
            <Icon size={22} />
          </span>
          <span className="tag">
            {isActive
              ? {
                  free: "Free",
                  included: "Termasuk paket",
                  limited: "Akses terbatas",
                  business: "Business",
                  internal: "Internal",
                }[
                  t.access_type as
                    "free" | "included" | "limited" | "business" | "internal"
                ] || "Lihat akses"
              : "Segera Hadir"}
          </span>
          {isActive && (
            <button
              disabled={busy}
              className={`favorite ${isFavorite ? "chosen" : ""}`}
              aria-label={`${isFavorite ? "Hapus" : "Tambah"} favorit ${t.name}`}
              aria-pressed={isFavorite}
              onClick={() => void favorite(t)}
            >
              <Star size={18} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          )}
        </div>
        <h3>{t.name}</h3>
        <p>
          {compact && last ? "Terakhir dibuka " + time(last) : t.description}
        </p>
        <button
          disabled={busy}
          className="tool-open"
          onClick={() => void openTool(t)}
          aria-label={`${isActive ? "Buka" : "Preview"} ${t.name}`}
        >
          {isActive ? "Buka Tool" : "Lihat Preview"}
          <ArrowUpRight size={17} />
        </button>
      </article>
    );
  }
  const settingsView = ["settings", "billing", "integrations", "team"].includes(
    view,
  );
  return (
    <div
      className={`app-shell platform-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar" id="hub-sidebar">
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-controls="hub-sidebar"
          aria-expanded={!sidebarCollapsed}
          aria-label={
            sidebarCollapsed ? "Perluas navigasi" : "Kecilkan navigasi"
          }
          title={sidebarCollapsed ? "Perluas navigasi" : "Kecilkan navigasi"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={20} />
          ) : (
            <PanelLeftClose size={20} />
          )}
        </button>
        <Link className="brand" href={preview ? "/preview" : "/dashboard"}>
          prcuisa<span>hub</span>
        </Link>
        <span className="sidebar-caption">SATU ID. BANYAK TOOLS.</span>
        <nav aria-label="Navigasi Hub">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              className={`nav-link ${view === id || (id === "tools" && ["qr", "business-report", "invoice", "invoice-quotation", "kasir-pinter"].includes(view)) || (id === "settings" && settingsView) ? "active" : ""} ${id === "settings" ? "settings-link" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>PRCUISA ID</strong>
          <p>
            Satu akun untuk tools
            <br />
            yang bisnis kamu butuhkan.
          </p>
          <button className="text-button" onClick={() => navigate("billing")}>
            Paket {data.plan.toUpperCase()} <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="workspace-picker">
            <span className="workspace-icon">
              <Building2 size={19} />
            </span>
            <label>
              <span className="meta">Bisnis aktif</span>
              {workspaces.length > 1 ? (
                <select
                  aria-label="Pilih bisnis"
                  value={workspace?.id || ""}
                  onChange={(e) => {
                    setWorkspace(null);
                    setData(emptyData());
                    setBusinessMounted(false);
                    setQrMounted(false);

                    setView("home");
                    window.history.pushState(
                      {},
                      "",
                      "/dashboard?workspace=" + e.target.value,
                    );
                    void load(e.target.value);
                  }}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <strong className="workspace-name">
                  {workspace?.name || "Bisnis baru"}
                </strong>
              )}
            </label>
          </div>
          <button
            className="account-button"
            onClick={() => navigate("settings")}
            aria-label="Pengaturan PRCUISA ID"
          >
            <span>PRCUISA ID</span>
            <span className="avatar">
              {(data.name || "P").slice(0, 1).toUpperCase()}
            </span>
          </button>
        </header>
        {preview && (
          <div className="preview-banner">
            <span>
              <strong>Preview</strong> · Data hanya selama sesi ini.
            </span>
            <DashboardAuth />
          </div>
        )}
        <main
          className="main-content platform-content"
          id="main"
          aria-busy={loading}
        >
          {error && (
            <div role="alert" className="error error-bar">
              {error}
              <button
                className="text-button"
                onClick={() => void load(workspace?.id)}
              >
                Coba muat lagi
              </button>
            </div>
          )}
          {loading && !workspace ? (
            <p role="status">Menyiapkan Hub…</p>
          ) : onboarding ? (
            <BusinessOnboarding
              onCreate={createBusiness}
              onComplete={() => {
                setOnboarding(false);
                navigate("home");
              }}
            />
          ) : workspace ? (
            <>
              {(view === "home" || view === "tools") && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {view === "home"
                          ? `HALO${data.name ? ", " + data.name.split(" ")[0].toUpperCase() : ""}`
                          : "KATALOG PRCUISA"}
                      </span>
                      <h1>
                        {view === "home"
                          ? "Mau permudah apa hari ini?"
                          : "Temukan tool yang kamu butuhkan."}
                      </h1>
                      <p>
                        {view === "home"
                          ? "Satu PRCUISA ID. Tools praktis untuk menjalankan bisnis."
                          : "Mulai dari kebutuhanmu. Semua tool memakai akun yang sama."}
                      </p>
                    </div>
                  </div>
                  {search}
                  {view === "tools" && (
                    <div
                      className="filter-tabs"
                      role="group"
                      aria-label="Filter kategori tools"
                    >
                      {["Semua", ...new Set(active.map((t) => t.category))].map(
                        (c) => (
                          <button
                            key={c}
                            className={category === c ? "selected" : ""}
                            aria-pressed={category === c}
                            onClick={() => setCategory(c)}
                          >
                            {c}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                  {query || view === "tools" ? (
                    <section
                      className="platform-section search-results-section"
                      aria-live="polite"
                    >
                      <div className="search-results-heading">
                        <h2>
                          {query
                            ? `Hasil pencarian${filtered.length ? ` · ${filtered.length}` : ""}`
                            : "PRCUISA Tools"}
                        </h2>
                        {query && (
                          <span>
                            {filtered.length
                              ? "tools ditemukan"
                              : "Coba kata lain atau lihat semua tools"}
                          </span>
                        )}
                      </div>
                      {filtered.length ? (
                        <div className="tool-grid">
                          {filtered.map((t) => card(t))}
                        </div>
                      ) : (
                        <div className="quiet-empty">
                          <h3>Tool yang kamu cari belum tersedia.</h3>
                          <p>
                            Ceritakan apa yang ingin kamu permudah. Permintaanmu
                            membantu kami memilih tool berikutnya.
                          </p>
                          <div className="search-empty-actions">
                            <button
                              className="secondary"
                              onClick={() => {
                                setQuery("");
                                setCategory("Semua");
                              }}
                            >
                              Lihat semua tools
                            </button>
                            <button
                              className="text-button"
                              onClick={() => navigate("requests")}
                            >
                              Minta Tool
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  ) : (
                    <>
                      {recent.length > 0 ? (
                        <section className="platform-section">
                          <div className="section-heading">
                            <h2>Lanjutkan aktivitasmu</h2>
                            <span className="meta">Baru kamu buka</span>
                          </div>
                          <div className="tool-grid">
                            {recent.slice(0, 3).map((t) => card(t, true))}
                          </div>
                        </section>
                      ) : (
                        <div className="welcome-line">
                          <strong>Bisnis kamu siap.</strong>
                          <span>
                            Pilih satu tool untuk mulai. Akun dan bisnis kamu
                            sudah terhubung.
                          </span>
                        </div>
                      )}
                      {favorites.length > 0 && (
                        <section className="platform-section">
                          <h2>Tools favorit</h2>
                          <div className="tool-grid">
                            {favorites.map((t) => card(t))}
                          </div>
                        </section>
                      )}
                      <section className="platform-section">
                        <div className="section-heading">
                          <h2>
                            {recent.length
                              ? "Tools untuk bisnismu"
                              : "Mulai dari sini"}
                          </h2>
                          <button
                            className="text-button"
                            onClick={() => navigate("tools")}
                          >
                            Semua tools <ArrowUpRight size={15} />
                          </button>
                        </div>
                        <div className="tool-grid">
                          {active.map((t) => card(t))}
                        </div>
                      </section>
                      <section className="next-tool">
                        <div>
                          <span className="eyebrow">KENALI TOOL KEDUA</span>
                          <h2>
                            {recent[0]?.slug === "qr"
                              ? "Pahami uang masuk dan keluar."
                              : "Satu tautan, lebih mudah dibagikan."}
                          </h2>
                          <p>
                            {recent[0]?.slug === "qr"
                              ? "Business Report merangkum catatan usahamu tanpa hitung manual."
                              : "QR Tools mengubah tautan menu atau katalog menjadi QR siap unduh."}
                          </p>
                        </div>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            const t = active.find(
                              (t) =>
                                t.slug ===
                                (recent[0]?.slug === "qr"
                                  ? "business-report"
                                  : "qr"),
                            );
                            if (t) void openTool(t);
                          }}
                        >
                          Coba Tool <ArrowUpRight size={16} />
                        </button>
                      </section>
                      {recent.length > 0 &&
                        visibleTools.find(
                          (t) => t.status === "coming_soon",
                        ) && (
                          <section className="future-strip">
                            <span className="tag">Segera Hadir</span>
                            <div>
                              <strong>Asisten Bisnis</strong>
                              <p>
                                Tanya kondisi bisnis dari data yang kamu
                                izinkan.
                              </p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() =>
                                setFuture(
                                  visibleTools.find(
                                    (t) => t.status === "coming_soon",
                                  )!,
                                )
                              }
                            >
                              Preview
                            </button>
                          </section>
                        )}
                      <section className="request-invitation">
                        <div>
                          <h2>Masih ada pekerjaan yang bikin repot?</h2>
                          <p>
                            Ceritakan masalahnya. Bantu tentukan tool PRCUISA
                            berikutnya.
                          </p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => navigate("requests")}
                        >
                          <MessageSquarePlus size={18} />
                          Minta Tool
                        </button>
                      </section>
                      <div className="plan-line">
                        <span>
                          Paket {data.plan.toUpperCase()} · Satu akun untuk
                          tools yang tersedia.
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("billing")}
                        >
                          Lihat akses saya →
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              <section hidden={view !== "business-report"}>
                {businessMounted && (
                  <>
                    <button
                      className="text-button back-hub"
                      onClick={() => navigate("home")}
                    >
                      <ArrowLeft size={16} />
                      Kembali ke Hub
                    </button>
                    <div className="tool-context">
                      <strong>
                        <ReceiptText size={18} />
                        Business Report
                      </strong>
                      <span className="meta">{workspace.name}</span>
                    </div>
                    <div className="filter-tabs">
                      {[
                        { id: "dashboard", label: "Hari Ini" },
                        { id: "report", label: "Ringkasan" },
                        { id: "activity", label: "Catatan" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          aria-pressed={businessView === t.id}
                          className={businessView === t.id ? "selected" : ""}
                          onClick={() =>
                            setBusinessView(t.id as typeof businessView)
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="embedded-tool">
                      <Hub
                        key={workspace.id}
                        view={businessView}
                        preview={preview}
                        embedded
                        workspaceContext={workspace}
                        onValue={() =>
                          localEvent("tool_value_completed", "business-report")
                        }
                      />
                    </div>
                  </>
                )}
              </section>
              <section hidden={view !== "qr"}>
                {qrMounted && (
                  <>
                    <button
                      className="text-button back-hub"
                      onClick={() => navigate("home")}
                    >
                      <ArrowLeft size={16} />
                      Kembali ke Hub
                    </button>
                    <QRStudio
                      key={workspace.id}
                      workspaceId={workspace.id}
                      preview={preview}
                      onValue={() => localEvent("tool_value_completed", "qr")}
                    />
                  </>
                )}
              </section>
              {view === "connect" && (
                <Connect
                  key={workspace.id}
                  workspaceId={workspace.id}
                  preview={preview}
                />
              )}
              {view === "kasir-pinter" && (
                <section>
                  <button
                    className="text-button back-hub"
                    onClick={() => navigate("home")}
                  >
                    <ArrowLeft size={16} />
                    Kembali ke Hub
                  </button>
                  <KasirPinter
                    key={workspace.id}
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                    preview={preview}
                  />
                </section>
              )}
              <section hidden={view !== "invoice-quotation"}>
                {iqMounted && (
                  <InvoiceQuotation
                    key={workspace.id}
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                    preview={preview}
                    initialPath={iqPath}
                  />
                )}
              </section>
              {view === "requests" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MINTA TOOL</span>
                      <h1>Apa yang ingin kamu permudah?</h1>
                      <p>
                        Ceritakan masalahnya. Tidak perlu menulis spesifikasi
                        teknis.
                      </p>
                    </div>
                  </div>
                  <RequestIdeas
                    key={workspace.id}
                    workspaceId={workspace.id}
                    preview={preview}
                  />
                  <div className="request-layout">
                    <form onSubmit={submitRequest} className="operational-form">
                      <label>
                        Pekerjaan atau masalah yang ingin dibantu
                        <textarea
                          name="problem"
                          required
                          minLength={10}
                          maxLength={2000}
                          rows={4}
                          placeholder="Contoh: Saya mengingatkan pelanggan soal pembayaran satu per satu."
                        />
                      </label>
                      <details>
                        <summary>Tambahkan konteks (opsional)</summary>
                        <label>
                          Bagaimana kamu mengerjakannya sekarang?
                          <textarea name="workflow" rows={3} maxLength={2000} />
                        </label>
                        <label>
                          Seberapa sering?
                          <select name="frequency">
                            <option value="">Pilih frekuensi</option>
                            <option>Setiap hari</option>
                            <option>Setiap minggu</option>
                            <option>Setiap bulan</option>
                            <option>Sesekali</option>
                          </select>
                        </label>
                      </details>
                      <button className="primary" disabled={busy}>
                        {busy ? "Mengirim…" : "Kirim Permintaan"}
                      </button>
                      <p className="meta">
                        Kami meninjau kebutuhan yang masuk. Permintaan bukan
                        janji jadwal rilis.
                      </p>
                    </form>
                    <section>
                      <h2>Permintaan kamu</h2>
                      {data.requests.length ? (
                        data.requests.map((r) => (
                          <article className="request-row" key={r.id}>
                            <span className="tag">
                              {statusLabels[r.status]}
                            </span>
                            <p>{r.problem}</p>
                            <small>{time(r.created_at)}</small>
                          </article>
                        ))
                      ) : (
                        <div className="quiet-empty">
                          <p>Belum ada permintaan.</p>
                          <span className="meta">
                            Setelah dikirim, permintaan dan statusnya muncul di
                            sini.
                          </span>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {view === "activity" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">PRCUISA HUB</span>
                      <h1>Aktivitas terbaru</h1>
                      <p>
                        Jejak penggunaan tools dan permintaan kamu di{" "}
                        {workspace.name}.
                      </p>
                    </div>
                  </div>
                  {data.events.filter(
                    (e) => !["hub_viewed", "tool_searched"].includes(e.name),
                  ).length ? (
                    <ol className="platform-activity">
                      {data.events
                        .filter(
                          (e) =>
                            !["hub_viewed", "tool_searched"].includes(e.name),
                        )
                        .map((e) => (
                          <li key={e.id}>
                            <span className="activity-dot" />
                            <div>
                              <strong>
                                {eventLabels[e.name] || "Aktivitas Hub"}
                                {e.app_id
                                  ? " · " +
                                    (visibleTools.find(
                                      (t) => t.slug === e.app_id,
                                    )?.name || e.app_id)
                                  : ""}
                              </strong>
                              <p className="meta">{time(e.created_at)} WIB</p>
                            </div>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <div className="quiet-empty">
                      <h2>Belum ada aktivitas.</h2>
                      <p>Buka tool atau kirim permintaan untuk mulai.</p>
                      <button
                        className="secondary"
                        onClick={() => navigate("tools")}
                      >
                        Jelajahi Tools
                      </button>
                    </div>
                  )}
                </>
              )}
              {settingsView && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">PRCUISA ID</span>
                      <h1>Pengaturan</h1>
                      {(data.is_admin || preview) && (
                        <Link href={preview ? "/preview/admin" : "/admin"}>
                          Kelola platform{preview ? " (simulasi)" : ""}
                        </Link>
                      )}
                      {!preview && (
                        <Link href="/invitations">Undangan saya</Link>
                      )}
                      <p>
                        Satu identitas, satu bisnis aktif, akses ke seluruh
                        tools yang tersedia.
                      </p>
                    </div>
                  </div>
                  <div className="filter-tabs">
                    {[
                      { id: "settings", label: "Profil & bisnis" },
                      { id: "team", label: "Anggota" },
                      { id: "billing", label: "Paket & akses" },
                      { id: "integrations", label: "Koneksi" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        className={view === t.id ? "selected" : ""}
                        aria-pressed={view === t.id}
                        onClick={() => navigate(t.id as PlatformView)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {view === "team" ? (
                    <TeamSettings
                      key={workspace.id}
                      workspaceId={workspace.id}
                      preview={preview}
                    />
                  ) : view === "settings" ? (
                    <form
                      key={workspace.id + data.email}
                      onSubmit={updateSettings}
                      className="operational-form settings-form"
                    >
                      <label>
                        Nama kamu
                        <input
                          name="full_name"
                          defaultValue={data.name}
                          required
                          minLength={1}
                          maxLength={80}
                        />
                      </label>
                      <label>
                        Email
                        <input
                          readOnly
                          value={data.email || (preview ? "Mode preview" : "")}
                          aria-describedby="identity-note"
                        />
                      </label>
                      <p id="identity-note" className="meta">
                        PRCUISA ID yang sama digunakan di Business Report dan QR
                        Tools.
                      </p>
                      <label>
                        Nama bisnis
                        <input
                          name="name"
                          readOnly={!preview && data.workspace_role !== "owner"}
                          defaultValue={workspace.name}
                          required
                          minLength={2}
                          maxLength={80}
                        />
                      </label>
                      <p className="meta">
                        Rupiah (IDR) · Asia/Jakarta · Bahasa Indonesia
                      </p>
                      <button className="primary" disabled={busy}>
                        {busy ? "Menyimpan…" : "Simpan Pengaturan"}
                      </button>
                      {!preview && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-button"
                          onClick={() => void logout()}
                        >
                          <LogOut size={16} />
                          Keluar dari PRCUISA ID
                        </button>
                      )}
                    </form>
                  ) : view === "integrations" ? (
                    <div className="quiet-empty">
                      <span className="tag">Belum tersedia</span>
                      <h2>Koneksi bisnis, satu tempat.</h2>
                      <p>
                        WhatsApp, Telegram, dan layanan lain akan terhubung dari
                        sini saat integrasi tersedia. Saat ini belum ada layanan
                        yang dapat dihubungkan.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="plan-summary">
                        <span className="eyebrow">PAKET SAAT INI</span>
                        <h2>PRCUISA {data.plan.toUpperCase()}</h2>
                        <p>
                          {data.plan === "free"
                            ? "Business Report dan QR Tools tersedia dengan akun Free."
                            : "Akses mengikuti kemampuan yang tersedia dalam paketmu."}
                        </p>
                        <ul>
                          {data.access
                            .filter((a) => a.enabled)
                            .map((a) => (
                              <li key={a.capability}>
                                {visibleTools.find(
                                  (t) => t.slug === a.capability,
                                )?.name || a.capability}
                                <span>
                                  {a.monthly_limit === null
                                    ? "Tersedia"
                                    : `${data.usage.find((u) => u.app_id === a.capability)?.quantity || 0} / ${a.monthly_limit} bulan ini`}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                      {billingError && (
                        <p className="error" role="alert">
                          {billingError}
                        </p>
                      )}
                      {typeof window !== "undefined" &&
                        new URLSearchParams(window.location.search).get(
                          "payment",
                        ) === "checking" && (
                          <div className="notice" role="status">
                            <strong>
                              {billing?.payments[0]?.status === "paid"
                                ? "Pembayaran terverifikasi."
                                : "Pembayaran sedang diperiksa."}
                            </strong>
                            <p>
                              {billing?.payments[0]?.status === "paid"
                                ? "Paket kamu sudah diperbarui."
                                : "Akses paket akan diperbarui setelah Midtrans mengonfirmasi pembayaran."}
                            </p>
                            <button
                              className="text-button"
                              disabled={billingBusy || !billing?.payments[0]}
                              onClick={() =>
                                billing?.payments[0] &&
                                void checkPayment(billing.payments[0].order_id)
                              }
                            >
                              {billingBusy ? "Memeriksa…" : "Periksa status"}
                            </button>
                          </div>
                        )}
                      <MembershipPlans
                        plans={billing?.plans || []}
                        currentPlan={
                          billing?.subscription?.status === "active"
                            ? billing.subscription.plan_id
                            : "free"
                        }
                        configured={!!billing?.paymentConfigured}
                        preview={preview}
                        workspace={workspace?.id}
                      />
                      <p className="billing-note">
                        {preview
                          ? "Mode preview tidak memulai pembayaran."
                          : billing?.paymentConfigured
                            ? "Pembayaran diproses oleh Midtrans. Paket hanya aktif setelah pembayaran diverifikasi."
                            : "Pembayaran Midtrans belum diaktifkan. Harga paket dan konfigurasi merchant perlu disiapkan terlebih dahulu."}
                      </p>
                      {!!billing?.payments.length && (
                        <section className="platform-section">
                          <h2>Riwayat pembayaran</h2>
                          {billing.payments.map((payment) => (
                            <article
                              className="request-row"
                              key={payment.order_id}
                            >
                              <strong>
                                PRCUISA {payment.plan_id.toUpperCase()}
                              </strong>
                              <span className="tag">
                                {{
                                  paid: "Berhasil",
                                  pending: "Menunggu pembayaran",
                                  failed: "Gagal",
                                  expired: "Kedaluwarsa",
                                  cancelled: "Dibatalkan",
                                }[payment.status] || "Diproses"}
                              </span>
                              <p>
                                {new Intl.NumberFormat("id-ID", {
                                  style: "currency",
                                  currency: "IDR",
                                  maximumFractionDigits: 0,
                                }).format(payment.amount_idr)}
                              </p>
                              {payment.status === "pending" && (
                                <button
                                  className="text-button"
                                  disabled={billingBusy}
                                  onClick={() =>
                                    void checkPayment(payment.order_id)
                                  }
                                >
                                  {billingBusy
                                    ? "Memeriksa…"
                                    : "Periksa status pembayaran"}
                                </button>
                              )}
                            </article>
                          ))}
                        </section>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            !loading && (
              <div className="quiet-empty">
                <p>Hub belum tersedia.</p>
                <button className="secondary" onClick={() => void load()}>
                  Coba lagi
                </button>
              </div>
            )
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigasi Hub mobile">
        {navigation
          .filter((n) => n.id !== "requests")
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={
                view === id ||
                (id === "tools" &&
                  [
                    "qr",
                    "business-report",
                    "invoice",
                    "invoice-quotation",
                  ].includes(view)) ||
                (id === "settings" && settingsView)
                  ? "active"
                  : ""
              }
              onClick={() => navigate(id)}
            >
              <Icon size={20} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {future && (
        <dialog
          ref={previewDialog}
          className="preview-dialog"
          onCancel={() => setFuture(null)}
        >
          <span className="tag">Segera Hadir · Preview</span>
          <h2>{future.name}</h2>
          <p>{future.description}</p>
          <p>
            Fitur ini belum dapat digunakan. Belum ada jadwal rilis atau paket
            final.
          </p>
          <button
            className="secondary"
            onClick={() => {
              previewDialog.current?.close();
              setFuture(null);
            }}
          >
            Tutup Preview
          </button>
        </dialog>
      )}
    </div>
  );
}
