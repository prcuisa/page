"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Search,
  FileText,
  Users,
  Package,
  Settings as SettingsIcon,
  Download,
  CheckCircle2,
  RefreshCw,
  ReceiptText,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
} from "lucide-react";
import Editor from "./editor";
import RecordForm from "./record-form";
import DocumentShare from "./document-share";
import { demoAction, emptyDemo, type DemoStore } from "./demo";
import {
  calculate,
  localDate,
  money,
  statusLabels,
  type Customer,
  type CatalogItem,
  type Settings,
  type Document,
  type Draft,
} from "./domain";
type Section =
  "overview" | "quotations" | "invoices" | "customers" | "items" | "settings";
const sections: Section[] = [
  "overview",
  "quotations",
  "invoices",
  "customers",
  "items",
  "settings",
];
const labels: Record<Section, string> = {
  overview: "Ringkasan",
  quotations: "Penawaran",
  invoices: "Invoice",
  customers: "Pelanggan",
  items: "Barang & jasa",
  settings: "Pengaturan",
};
const emptyPath: string[] = [];
const emptySettings = (name: string): Settings => ({
  ...emptyDemo(name).settings,
});
export default function InvoiceQuotation({
  workspaceId,
  workspaceName,
  preview = false,
  initialPath = emptyPath,
}: {
  workspaceId: string;
  workspaceName: string;
  preview?: boolean;
  initialPath?: string[];
}) {
  const [section, setSection] = useState<Section>("overview"),
    [summary, setSummary] = useState({
      draft_quotations: 0,
      open_quotations: 0,
      unpaid_invoices: 0,
      paid_invoices: 0,
    }),
    [rows, setRows] = useState<any[]>([]),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [customers, setCustomers] = useState<Customer[]>([]),
    [items, setItems] = useState<CatalogItem[]>([]),
    [settings, setSettings] = useState<Settings>(emptySettings(workspaceName)),
    [doc, setDoc] = useState<Document | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!preview),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [editor, setEditor] = useState<"quotation" | "invoice" | null>(null),
    [editing, setEditing] = useState<Document | undefined>(),
    [record, setRecord] = useState<"customer" | "item" | "settings" | null>(
      null,
    ),
    [recordData, setRecordData] =
      useState<Partial<Customer & CatalogItem & Settings>>(),
    [dialogDoc, setDialogDoc] = useState<Document | null>(null),
    [modal, setModal] = useState<"payment" | "reverse" | null>(null),
    [paymentToReverse, setPaymentToReverse] = useState<string | null>(null),
    [paymentKey, setPaymentKey] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const requestVersions = useRef<Record<string, number>>({});
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilter("all");
    setPage(0);
  };
  const [navCollapsed, setNavCollapsed] = useState(false);
  const navIcons = {
    overview: LayoutDashboard,
    quotations: FileText,
    invoices: ReceiptText,
    customers: Users,
    items: Package,
    settings: SettingsIcon,
  };
  const dialogRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>(".active");
    if (!nav || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < nav.scrollLeft)
      nav.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" });
    else if (right > nav.scrollLeft + nav.clientWidth)
      nav.scrollTo({ left: right - nav.clientWidth + 12, behavior: "smooth" });
  }, [section]);
  const [demo, setDemo] = useState<DemoStore>(() => emptyDemo(workspaceName));
  const demoRef = useRef(demo);
  useEffect(() => {
    const route = initialPath;
    const candidate = route[0];
    const initialSection = sections.includes(candidate as Section)
      ? (candidate as Section)
      : "overview";
    setSection(initialSection);
    if (route[1] && /^[0-9a-f-]{36}$/i.test(route[1])) void loadDoc(route[1]);
    const pop = () => {
      const parts = location.pathname.split("/").filter(Boolean).slice(2);
      const target = sections.includes(parts[0] as Section)
        ? (parts[0] as Section)
        : "overview";
      setSection(target);
      if (parts[1] && /^[0-9a-f-]{36}$/i.test(parts[1])) void loadDoc(parts[1]);
      else setDialogDoc(null);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [initialPath.join("/")]);
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = ["settings", "customers", "items"].map((section) =>
          fetch(`/api/iq?workspace=${workspaceId}&section=${section}`, {
            cache: "no-store",
          }).then((r) => r.json()),
        );
        const [st, cs, it] = await Promise.all(qs);
        if (cancelled) return;
        if (st.settings) setSettings(st.settings);
        if (Array.isArray(cs.rows)) setCustomers(cs.rows);
        if (Array.isArray(it.rows)) setItems(it.rows);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, preview]);
  const pathFor = (s: Section, id?: string) =>
    "/tools/invoice-quotation" +
    (s === "overview" ? "" : "/" + s) +
    (id ? "/" + id : "") +
    (preview ? "" : "?workspace=" + workspaceId);
  const dismissDocument = () => {
    if (!preview) history.pushState({}, "", pathFor(section));
    setDialogDoc(null);
    setShareOpen(false);
    setModal(null);
  };
  const go = (s: Section) => {
    setSection(s);
    setPage(0);
    setSearch("");
    setDebouncedSearch("");
    setFilter("all");
    setEditor(null);
    setDoc(null);
    setRecord(null);
    setShareOpen(false);
    if (!preview) history.pushState({}, "", pathFor(s));
  };
  const request = useCallback(
    async (sec = section, pg = page, q = debouncedSearch, f = filter) => {
      if (preview) {
        setLoading(false);
        return;
      }
      const version = (requestVersions.current[sec] || 0) + 1;
      requestVersions.current[sec] = version;
      setLoading(true);
      setError("");
      try {
        const p = new URLSearchParams({
          workspace: workspaceId,
          section: sec,
          page: String(pg),
          q,
          filter: f,
        });
        const r = await fetch("/api/iq?" + p, { cache: "no-store" });
        const d = await r.json();
        if (requestVersions.current[sec] !== version) return;
        if (!r.ok) throw Error(d.error);
        setSummary(
          d.overview || {
            draft_quotations: 0,
            open_quotations: 0,
            unpaid_invoices: 0,
            paid_invoices: 0,
          },
        );
        if (sec === "settings") {
          setSettings(d.settings as Settings);
          setRows([]);
        } else if (sec === "customers") setCustomers(d.rows);
        else if (sec === "items") setItems(d.rows);
        else setRows(d.rows);
      } catch (e) {
        if (requestVersions.current[sec] === version)
          setError((e as Error).message);
      } finally {
        if (requestVersions.current[sec] === version) setLoading(false);
      }
    },
    [workspaceId, preview, section, page, debouncedSearch, filter],
  );
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLookup = (kind: "customers" | "items", value: string) => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(
      () => void request(kind, 0, value.trim(), "all"),
      250,
    );
  };
  useEffect(
    () => () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    },
    [],
  );
  useEffect(() => {
    void request(section, page, debouncedSearch, filter);
    return () => {
      requestVersions.current[section] =
        (requestVersions.current[section] || 0) + 1;
    };
  }, [section, page, debouncedSearch, filter, workspaceId, preview, request]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!dialogDoc) return;
    const node = dialogRef.current;
    if (!node) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[href]",
        ),
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDialogDoc(null);
        setModal(null);
      }
      if (e.key === "Tab") {
        const all = focusable();
        if (!all.length) return;
        const first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [!!dialogDoc]);
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      let result: any;
      if (preview) {
        const r = demoAction(demo, action, payload);
        demoRef.current = r.store;
        setDemo(r.store);
        result = r.result;
      } else {
        const r = await fetch("/api/iq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: workspaceId, action, payload }),
        });
        result = await r.json();
        if (!r.ok) throw Error(result.error || "Belum berhasil.");
      }
      setToast(
        (
          {
            draft: "Draft tersimpan.",
            issue: "Dokumen diterbitkan.",
            accept: "Penawaran dicatat diterima.",
            reject: "Penawaran dicatat ditolak.",
            convert: "Draft invoice dibuat.",
            payment: "Pembayaran dicatat.",
            reverse: "Pembayaran dikoreksi.",
            settings: "Pengaturan tersimpan.",
            customer: "Data pelanggan tersimpan.",
            item: "Data barang/jasa tersimpan.",
          } as Record<string, string>
        )[action] || "Perubahan disimpan.",
      );
      await request(section, page, search, filter);
      if (result?.id && action === "draft") {
        const fresh = preview
          ? result
          : await fetch(
              `/api/iq?workspace=${workspaceId}&section=overview&id=${result.id}`,
            ).then((r) => r.json());
        setEditing(fresh);
        setEditor(fresh.document_type);
        setDoc(fresh);
      }
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const allDocuments = preview ? demo.documents : (rows as Document[]);
  const paid =
    dialogDoc?.payments
      ?.filter((p) => !p.reversed_at)
      .reduce((n, p) => n + Number(p.amount), 0) || 0;
  async function loadDoc(id: string) {
    if (preview) {
      setDialogDoc(demoRef.current.documents.find((d) => d.id === id) || null);
      return;
    }
    const r = await fetch(
      `/api/iq?workspace=${workspaceId}&section=overview&id=${id}`,
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setDialogDoc({
      ...d,
      items: d.items || [],
      payments: d.payments || [],
      events: d.events || [],
    });
  }
  async function create(kind: "quotation" | "invoice", existing?: Document) {
    setEditing(existing);
    setEditor(kind);
    setDoc(existing || null);
    setDialogDoc(null);
    if (!preview)
      history.pushState(
        {},
        "",
        pathFor(kind === "quotation" ? "quotations" : "invoices"),
      );
    setSection(kind === "quotation" ? "quotations" : "invoices");
  }
  async function saveDraft(p: Draft) {
    const saved = await act("draft", p as unknown as Record<string, unknown>);
    if (!preview && saved?.id) {
      const r = await fetch(
        `/api/iq?workspace=${workspaceId}&section=overview&id=${saved.id}`,
      );
      const d = await r.json();
      setEditing(d);
      setDoc(d);
    } else if (preview) setEditing(saved);
  }
  async function saveCustomer(p: Record<string, unknown>) {
    const result = await act("customer", p);
    await request("customers", 0, "", "all");
    return result?.id as string | undefined;
  }
  const includesQuery = (values: unknown[]) =>
    values
      .join(" ")
      .toLocaleLowerCase("id")
      .includes(debouncedSearch.toLocaleLowerCase("id"));
  const matchingCustomers = demo.customers.filter((c) =>
    includesQuery([c.name, c.company_name, c.email, c.phone]),
  );
  const matchingItems = demo.items.filter((i) =>
    includesQuery([i.name, i.description]),
  );
  const customerRecords = preview
      ? editor
        ? demo.customers
        : matchingCustomers.slice(page * 25, (page + 1) * 25)
      : customers,
    catalogRecords = preview
      ? editor
        ? demo.items
        : matchingItems.slice(page * 25, (page + 1) * 25)
      : items;
  const demoDocuments = demo.documents.map((d) => {
    const paid = d.payments
      .filter((p) => !p.reversed_at)
      .reduce((n, p) => n + Number(p.amount), 0);
    const display_status =
      d.lifecycle_status === "issued" && d.document_type === "invoice"
        ? paid >= Number(d.grand_total)
          ? "paid"
          : d.due_date && d.due_date < localDate()
            ? "overdue"
            : paid > 0
              ? "partially_paid"
              : "unpaid"
        : d.lifecycle_status === "issued" &&
            d.document_type === "quotation" &&
            d.valid_until &&
            d.valid_until < localDate()
          ? "expired"
          : d.lifecycle_status;
    return { ...d, display_status };
  });
  const matching = demoDocuments.filter(
    (d) =>
      (section === "quotations"
        ? d.document_type === "quotation"
        : section === "invoices"
          ? d.document_type === "invoice"
          : true) &&
      (filter === "all" ||
        d.display_status === filter ||
        (filter === "issued" && d.lifecycle_status === "issued")) &&
      [
        d.document_number,
        d.customer_snapshot?.name,
        d.customer_snapshot?.company_name,
        ...d.items.map((i) => i.description),
      ]
        .join(" ")
        .toLocaleLowerCase("id")
        .includes(debouncedSearch.toLocaleLowerCase("id")),
  );
  const displayed = preview
    ? matching.slice(page * 25, (page + 1) * 25)
    : (allDocuments as Document[]);
  const draftDoc = (d: Document) => d.lifecycle_status === "draft";
  const nav = (
    <nav
      ref={navRef}
      className={`iq-nav ${navCollapsed ? "iq-nav-collapsed" : ""}`}
      aria-label="Navigasi Invoice & Quotation"
    >
      <label className="iq-mobile-section">
        Bagian dokumen
        <select
          aria-label="Bagian Invoice & Quotation"
          value={section}
          onChange={(e) => go(e.target.value as Section)}
        >
          {sections.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="iq-nav-heading">
        <span>Dokumen bisnis</span>
        <button
          onClick={() => setNavCollapsed((v) => !v)}
          aria-expanded={!navCollapsed}
          aria-label={
            navCollapsed ? "Perluas menu dokumen" : "Kecilkan menu dokumen"
          }
          title={
            navCollapsed ? "Perluas menu dokumen" : "Kecilkan menu dokumen"
          }
        >
          {navCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>
      {sections.map((s) => {
        const Icon = navIcons[s];
        return (
          <button
            key={s}
            title={labels[s]}
            aria-label={labels[s]}
            className={section === s ? "active" : ""}
            onClick={() => go(s)}
            aria-current={section === s ? "page" : undefined}
          >
            <Icon size={18} />
            <span>{labels[s]}</span>
          </button>
        );
      })}
      <Link
        href={preview ? "/preview" : "/dashboard"}
        className="iq-back"
        title="Kembali ke Hub"
      >
        <ArrowLeft size={16} />
        <span>Kembali ke Hub</span>
      </Link>
    </nav>
  );
  const actions = (d: Document) => (
    <div className="iq-doc-actions">
      <button
        onClick={() => {
          setShareOpen(false);
          void loadDoc(d.id)
            .then(() => setModal(null))
            .catch((e) => setError(e.message));
        }}
      >
        Lihat
      </button>
      {draftDoc(d) && (
        <button onClick={() => void create(d.document_type, d)}>
          Edit draft
        </button>
      )}
      {d.lifecycle_status === "issued" && d.document_type === "quotation" && (
        <>
          <button onClick={() => void actFor(d, "accept")}>
            Catat diterima
          </button>
        </>
      )}
      {d.lifecycle_status === "accepted" &&
        d.document_type === "quotation" &&
        !d.linked_invoice && (
          <button onClick={() => void convert(d)}>Buat invoice</button>
        )}
      {d.lifecycle_status !== "draft" && (
        <button
          onClick={() =>
            void loadDoc(d.id)
              .then(() => setShareOpen(true))
              .catch((e) => setError(e.message))
          }
        >
          PDF / Bagikan
        </button>
      )}
    </div>
  );
  async function actFor(d: Document, a: string) {
    try {
      await act(a, { id: d.id });
      await loadDoc(d.id);
    } catch {}
  }
  async function convert(d: Document) {
    try {
      const out = await act("convert", { id: d.id });
      if (out?.id) await create("invoice", out);
    } catch {}
  }
  const title = (
    <div className="page-heading iq-title">
      <div>
        <span className="eyebrow">PRCUISA TOOLS · BISNIS</span>
        <h1>Invoice & Quotation</h1>
        <p>Buat penawaran, kirim invoice, dan pantau pembayarannya.</p>
      </div>
      <span className="meta">{workspaceName}</span>
    </div>
  );
  return (
    <main className="iq-app">
      {title}
      {preview && (
        <p className="foundation-note">
          Mode demo: perubahan hanya tersimpan sementara di halaman ini. Nomor
          bertanda DEMO bukan dokumen resmi.
        </p>
      )}
      <div className={`iq-layout ${navCollapsed ? "iq-layout-compact" : ""}`}>
        {nav}
        <div className="iq-main">
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void request();
                }}
              >
                Coba lagi
              </button>
            </div>
          )}
          {toast && (
            <p role="status" className="foundation-note">
              {toast}
            </p>
          )}
          {editor && (
            <Editor
              key={editing?.id || editor}
              kind={editor}
              document={editing}
              settings={
                preview
                  ? demo.settings
                  : settings.name
                    ? settings
                    : emptySettings(workspaceName)
              }
              customers={customerRecords}
              items={catalogRecords}
              busy={busy}
              onSearch={searchLookup}
              onCustomer={saveCustomer}
              onSave={saveDraft}
              onClose={() => {
                setEditor(null);
                setEditing(undefined);
                void request();
              }}
            />
          )}
          {editor && editing?.id && (
            <div className="iq-saved-actions">
              <CheckCircle2 size={18} />
              <span>Draft tersimpan. Periksa dokumen sebelum diterbitkan.</span>
              <button
                className="secondary"
                onClick={() => {
                  setEditor(null);
                  void loadDoc(editing.id);
                }}
              >
                Lihat & terbitkan
              </button>
            </div>
          )}
          {!editor && record && (
            <section className="iq-record-panel">
              <div className="section-head">
                <h2>
                  {record === "settings"
                    ? "Profil dokumen"
                    : record === "customer"
                      ? "Tambah pelanggan"
                      : "Tambah barang / jasa"}
                </h2>
                <button
                  onClick={() => {
                    setRecord(null);
                    setRecordData(undefined);
                  }}
                >
                  Tutup
                </button>
              </div>
              <RecordForm
                kind={record}
                record={record === "settings" ? settings : recordData}
                busy={busy}
                onCancel={() => setRecord(null)}
                onSave={async (p) => {
                  await act(record, p);
                  setRecord(null);
                  setRecordData(undefined);
                  if (record === "settings")
                    setSettings({ ...settings, ...p } as Settings);
                  await request();
                }}
              />
            </section>
          )}
          {!editor && !record && section === "overview" && (
            <>
              <div className="iq-quick-actions">
                <button
                  className="primary"
                  onClick={() => void create("quotation")}
                >
                  <Plus size={17} /> Buat penawaran
                </button>
                <button
                  className="secondary"
                  onClick={() => void create("invoice")}
                >
                  <Plus size={17} /> Buat invoice
                </button>
              </div>
              <div className="iq-counts">
                <button onClick={() => go("quotations")}>
                  <span>Draft penawaran</span>
                  <strong>
                    {preview
                      ? displayed.filter(
                          (d) =>
                            d.document_type === "quotation" &&
                            d.lifecycle_status === "draft",
                        ).length
                      : summary.draft_quotations}
                  </strong>
                </button>
                <button onClick={() => go("quotations")}>
                  <span>Penawaran aktif</span>
                  <strong>
                    {preview
                      ? displayed.filter(
                          (d) =>
                            d.document_type === "quotation" &&
                            d.lifecycle_status === "issued",
                        ).length
                      : summary.open_quotations}
                  </strong>
                </button>
                <button onClick={() => go("invoices")}>
                  <span>Invoice belum lunas</span>
                  <strong>
                    {preview
                      ? displayed.filter(
                          (d) =>
                            d.document_type === "invoice" &&
                            ["unpaid", "partially_paid", "overdue"].includes(
                              d.display_status || "",
                            ),
                        ).length
                      : summary.unpaid_invoices}
                  </strong>
                </button>
                <button onClick={() => go("invoices")}>
                  <span>Invoice lunas</span>
                  <strong>
                    {preview
                      ? displayed.filter((d) => d.display_status === "paid")
                          .length
                      : summary.paid_invoices}
                  </strong>
                </button>
              </div>
              <div className="section-head">
                <h2>Dokumen terbaru</h2>
                <button onClick={() => go("invoices")}>Lihat semua</button>
              </div>
              <Documents
                rows={displayed.slice(0, 8)}
                loading={loading}
                actions={actions}
                open={(d) =>
                  void loadDoc(d.id).then(() => {
                    if (!preview)
                      history.pushState(
                        {},
                        "",
                        pathFor(
                          d.document_type === "quotation"
                            ? "quotations"
                            : "invoices",
                          d.id,
                        ),
                      );
                  })
                }
                empty="Belum ada dokumen. Buat penawaran atau invoice pertamamu."
              />
            </>
          )}
          {!editor &&
            !record &&
            (section === "quotations" || section === "invoices") && (
              <>
                <div className="iq-quick-actions">
                  <button
                    className="primary"
                    onClick={() =>
                      void create(
                        section === "quotations" ? "quotation" : "invoice",
                      )
                    }
                  >
                    <Plus size={17} /> Buat{" "}
                    {section === "quotations" ? "penawaran" : "invoice"}
                  </button>
                </div>
                <div className="iq-list-controls">
                  <label>
                    <Search size={16} />
                    <input
                      type="search"
                      maxLength={120}
                      aria-label="Cari dokumen"
                      placeholder="Cari nomor, pelanggan, atau item"
                      value={search}
                      onChange={(e) => {
                        setPage(0);
                        setSearch(e.target.value);
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filter status"
                    value={filter}
                    onChange={(e) => {
                      setPage(0);
                      setFilter(e.target.value);
                    }}
                  >
                    {(section === "quotations"
                      ? [
                          "all",
                          "draft",
                          "issued",
                          "accepted",
                          "rejected",
                          "expired",
                          "cancelled",
                        ]
                      : [
                          "all",
                          "draft",
                          "unpaid",
                          "partially_paid",
                          "paid",
                          "overdue",
                          "void",
                        ]
                    ).map((x) => (
                      <option value={x} key={x}>
                        {x === "all" ? "Semua status" : statusLabels[x] || x}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  className="iq-filter-summary"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    {loading || search.trim() !== debouncedSearch
                      ? "Mencari dokumen…"
                      : `${displayed.length} dokumen di halaman ini`}
                    {filter !== "all"
                      ? ` · ${statusLabels[filter] || filter}`
                      : ""}
                  </span>
                  {(search || filter !== "all") && (
                    <button className="text-button" onClick={resetFilters}>
                      Reset pencarian & filter
                    </button>
                  )}
                </div>
                <Documents
                  rows={displayed}
                  loading={loading}
                  actions={actions}
                  open={(d) =>
                    void loadDoc(d.id).then(() => {
                      if (!preview)
                        history.pushState(
                          {},
                          "",
                          pathFor(
                            d.document_type === "quotation"
                              ? "quotations"
                              : "invoices",
                            d.id,
                          ),
                        );
                    })
                  }
                  empty={
                    search || filter !== "all"
                      ? "Tidak ada dokumen yang cocok. Ubah kata pencarian atau reset filter."
                      : section === "quotations"
                        ? "Belum ada penawaran."
                        : "Belum ada invoice."
                  }
                />
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
                      (preview
                        ? (page + 1) * 25 >= matching.length
                        : displayed.length < 25)
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              </>
            )}
          {!editor &&
            !record &&
            (section === "customers" || section === "items") && (
              <>
                <div className="section-head">
                  <div>
                    <h2>{labels[section]}</h2>
                    <p className="meta">
                      Simpan data sekali untuk dipakai lagi di dokumen
                      berikutnya.
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => {
                      setRecord(section === "customers" ? "customer" : "item");
                      setRecordData(undefined);
                    }}
                  >
                    <Plus size={16} /> Tambah
                  </button>
                </div>
                <div className="iq-list-controls">
                  <label>
                    <Search size={16} />
                    <input
                      type="search"
                      maxLength={120}
                      aria-label="Cari pelanggan atau barang"
                      value={search}
                      placeholder="Cari nama"
                      onChange={(e) => {
                        setPage(0);
                        setSearch(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <div className="iq-record-list">
                  {loading ? (
                    <p role="status">Memuat…</p>
                  ) : section === "customers" ? (
                    customerRecords.map((c) => (
                      <article key={c.id}>
                        <div>
                          <strong>{c.company_name || c.name}</strong>
                          <p>
                            {c.email ||
                              c.phone ||
                              c.address ||
                              "Belum ada detail tambahan"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setRecord("customer");
                            setRecordData(c);
                          }}
                        >
                          Ubah
                        </button>
                      </article>
                    ))
                  ) : (
                    catalogRecords.map((i) => (
                      <article key={i.id}>
                        <div>
                          <strong>{i.name}</strong>
                          <p>
                            {i.type === "service" ? "Jasa" : "Barang"} ·{" "}
                            {money(i.default_price)} {i.unit && " / " + i.unit}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setRecord("item");
                            setRecordData(i);
                          }}
                        >
                          Ubah
                        </button>
                      </article>
                    ))
                  )}
                </div>
                {section === "customers" &&
                  !customerRecords.length &&
                  !loading && (
                    <p className="quiet-empty">
                      Belum ada pelanggan tersimpan.
                    </p>
                  )}
                {section === "items" && !catalogRecords.length && !loading && (
                  <p className="quiet-empty">
                    Belum ada barang atau jasa tersimpan.
                  </p>
                )}
                <div className="iq-pagination">
                  <button
                    disabled={loading || !page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Sebelumnya
                  </button>
                  <span>Halaman {page + 1}</span>
                  <button
                    disabled={
                      loading ||
                      (preview
                        ? (page + 1) * 25 >=
                          (section === "customers"
                            ? matchingCustomers.length
                            : matchingItems.length)
                        : (section === "customers"
                            ? customerRecords.length
                            : catalogRecords.length) < 25)
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              </>
            )}
          {!editor && !record && section === "settings" && (
            <>
              <div className="section-head">
                <div>
                  <h2>Profil untuk dokumen</h2>
                  <p>Detail ini tampil pada penawaran dan invoice bisnismu.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => setRecord("settings")}
                >
                  <SettingsIcon size={16} /> Ubah profil
                </button>
              </div>
              <div className="iq-settings-summary">
                <strong>{settings.name || workspaceName}</strong>
                <p>{settings.address}</p>
                <p>
                  {settings.email} {settings.phone && " · " + settings.phone}
                </p>
                <p>
                  Nomor penawaran: {settings.quotation_prefix || "QT"} ·
                  Invoice: {settings.invoice_prefix || "INV"}
                </p>
                <p>
                  Jatuh tempo: {settings.due_days || 14} hari · Pajak tidak
                  diaktifkan otomatis
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {dialogDoc && (
        <div
          className="iq-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dismissDocument();
          }}
        >
          <section
            className="iq-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="iq-document-title"
            tabIndex={-1}
            ref={dialogRef as React.RefObject<HTMLElement>}
          >
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  {dialogDoc.document_type === "quotation"
                    ? "PENAWARAN"
                    : "INVOICE"}
                </span>
                <h2 id="iq-document-title">
                  {dialogDoc.document_number || "Draft"}
                </h2>
              </div>
              <button onClick={dismissDocument}>Tutup</button>
            </div>
            <p>
              {dialogDoc.customer_snapshot?.company_name ||
                dialogDoc.customer_snapshot?.name}
            </p>
            <p>
              Status:{" "}
              <strong>
                {statusLabels[
                  dialogDoc.display_status || dialogDoc.lifecycle_status
                ] || dialogDoc.lifecycle_status}
              </strong>
            </p>
            <div className="iq-review-lines">
              {dialogDoc.items.map((item, index) => (
                <div key={index}>
                  <span>
                    <strong>{item.description}</strong>
                    <small>
                      {item.quantity} {item.unit} × {money(item.unit_price)}
                    </small>
                  </span>
                  <strong>{money(calculate([item]).grand_total)}</strong>
                </div>
              ))}
            </div>
            <p>
              Total <strong>{money(dialogDoc.grand_total)}</strong>
            </p>
            {dialogDoc.notes && <p className="meta">{dialogDoc.notes}</p>}
            {dialogDoc.document_type === "invoice" && (
              <>
                <p>
                  Terbayar {money(paid)} · Sisa{" "}
                  {money(Number(dialogDoc.grand_total) - paid)}
                </p>
                {dialogDoc.payments?.map((p) => (
                  <p key={p.id}>
                    {money(p.amount)} · {p.payment_date} · {p.method}
                    {p.reversed_at
                      ? " · dikoreksi"
                      : !preview && (
                          <button
                            onClick={() => {
                              setPaymentToReverse(p.id);
                              setModal("reverse");
                            }}
                          >
                            Koreksi
                          </button>
                        )}
                  </p>
                ))}
              </>
            )}
            <div className="iq-actions">
              {dialogDoc.lifecycle_status === "draft" && (
                <>
                  <button
                    onClick={() =>
                      void create(dialogDoc.document_type, dialogDoc)
                    }
                  >
                    Edit
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      const result = await act("issue", {
                        id: dialogDoc.id,
                        version: dialogDoc.version,
                      });
                      if (result) await loadDoc(dialogDoc.id);
                    }}
                  >
                    Terbitkan
                  </button>
                </>
              )}
              {dialogDoc.lifecycle_status === "issued" &&
                dialogDoc.document_type === "quotation" && (
                  <>
                    <button onClick={() => void actFor(dialogDoc, "accept")}>
                      Catat diterima
                    </button>
                    <button onClick={() => void actFor(dialogDoc, "reject")}>
                      Catat ditolak
                    </button>
                  </>
                )}
              {dialogDoc.lifecycle_status === "accepted" &&
                dialogDoc.document_type === "quotation" &&
                !dialogDoc.linked_invoice && (
                  <button onClick={() => void convert(dialogDoc)}>
                    Buat invoice
                  </button>
                )}
              {dialogDoc.linked_invoice && (
                <p className="foundation-note">
                  Draft invoice dari penawaran ini sudah dibuat.
                </p>
              )}
              {dialogDoc.lifecycle_status === "issued" &&
                dialogDoc.document_type === "invoice" && (
                  <button
                    onClick={() => {
                      setPaymentKey(crypto.randomUUID());
                      setModal("payment");
                    }}
                  >
                    Catat pembayaran
                  </button>
                )}
              {dialogDoc.lifecycle_status !== "draft" && (
                <button
                  onClick={() => setShareOpen(true)}
                  aria-expanded={shareOpen}
                >
                  <Download size={16} />
                  PDF & bagikan
                </button>
              )}
            </div>
            {shareOpen && dialogDoc.lifecycle_status !== "draft" && (
              <DocumentShare
                document={dialogDoc}
                workspaceId={workspaceId}
                preview={preview}
              />
            )}
            {modal === "payment" && (
              <form
                className="operational-form iq-payment-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    const out = await act("payment", {
                      id: dialogDoc.id,
                      amount: f.get("amount"),
                      payment_date: f.get("payment_date"),
                      method: f.get("method"),
                      reference: f.get("reference"),
                      idempotency_key: paymentKey,
                    });
                    if (out) await loadDoc(dialogDoc.id);
                    setModal(null);
                  } catch {}
                }}
              >
                <h3>Catat pembayaran manual</h3>
                <label>
                  Jumlah (Rp)
                  <input
                    type="number"
                    name="amount"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    max={Number(dialogDoc.grand_total) - paid}
                    required
                  />
                </label>
                <label>
                  Tanggal
                  <input
                    type="date"
                    name="payment_date"
                    max={localDate()}
                    defaultValue={localDate()}
                    required
                  />
                </label>
                <label>
                  Metode
                  <select name="method">
                    <option value="bank">Transfer bank</option>
                    <option value="cash">Tunai</option>
                    <option value="qris">QRIS (dicatat manual)</option>
                    <option value="wallet">Dompet digital</option>
                    <option value="other">Lainnya</option>
                  </select>
                </label>
                <label>
                  Referensi (opsional)
                  <input name="reference" maxLength={120} />
                </label>
                <button className="primary" disabled={busy}>
                  Simpan pembayaran
                </button>
                <p className="meta">
                  PRCUISA mencatat pembayaran ini, tetapi tidak memverifikasi
                  penyelesaian transaksi.
                </p>
              </form>
            )}
            {modal === "reverse" && (
              <form
                className="operational-form iq-payment-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const pay = dialogDoc.payments.find(
                    (p) => p.id === paymentToReverse,
                  );
                  if (!pay) return;
                  try {
                    await act("reverse", {
                      id: dialogDoc.id,
                      payment_id: pay.id,
                      reason: f.get("reason"),
                    });
                    await loadDoc(dialogDoc.id);
                    setModal(null);
                  } catch {}
                }}
              >
                <h3>Koreksi pencatatan pembayaran</h3>
                <label>
                  Alasan koreksi
                  <textarea
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <p className="meta">
                  Riwayat perubahan pembayaran tetap tercatat.
                </p>
                <button className="primary" disabled={busy}>
                  Simpan koreksi
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
function Documents({
  rows,
  loading,
  open,
  actions,
  empty,
}: {
  rows: Document[];
  loading: boolean;
  open: (d: Document) => void;
  actions: (d: Document) => React.ReactNode;
  empty: string;
}) {
  return (
    <div className="iq-document-list">
      {loading ? (
        <p role="status">Memuat dokumen…</p>
      ) : rows.length ? (
        rows.map((d) => (
          <article key={d.id} className="iq-document-row">
            <button className="iq-doc-main" onClick={() => open(d)}>
              <ReceiptText size={20} />
              <span>
                <strong>{d.document_number || "Draft belum terbit"}</strong>
                <small>
                  {d.customer_snapshot?.company_name ||
                    d.customer_snapshot?.name ||
                    "Pelanggan"}{" "}
                  · {new Date(d.created_at).toLocaleDateString("id-ID")}
                </small>
              </span>
            </button>
            <span
              className={
                "iq-status status-" + (d.display_status || d.lifecycle_status)
              }
            >
              {statusLabels[d.display_status || d.lifecycle_status] ||
                d.lifecycle_status}
            </span>
            <strong>{money(d.grand_total)}</strong>
            <div>{actions(d)}</div>
          </article>
        ))
      ) : (
        <div className="quiet-empty">
          <FileText size={24} />
          <p>{empty}</p>
        </div>
      )}
    </div>
  );
}
