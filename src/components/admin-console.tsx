"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Boxes,
  MessageSquarePlus,
  CreditCard,
  History,
  ArrowLeft,
  RefreshCw,
  Search,
  ChevronDown,
} from "lucide-react";
import AdminAnalytics, { type Analytics } from "./admin-analytics";
import { previewTools, type Tool } from "@/lib/platform";
import { ideaLabels } from "@/lib/foundation";
type Group = {
  id: string;
  title: string;
  description: string;
  status: string;
  is_public: boolean;
  app_id: string | null;
  requests: number;
  votes: number;
};
type AdminData = {
  apps: Tool[];
  groups: Group[];
  requests: {
    id: string;
    problem: string;
    workflow: string;
    frequency: string;
    status: string;
    group_id: string | null;
    created_at: string;
  }[];
  entitlements: {
    plan_id: string;
    capability: string;
    enabled: boolean;
    monthly_limit: number | null;
  }[];
  billing: {
    plan_id: string;
    amount_idr: number | null;
    period_days: number;
    active: boolean;
  }[];
  audit: {
    action: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
  analytics?: Analytics;
};
const emptyAnalytics: Analytics = {
  definition:
    "Rutin aktif = minimal satu hasil tool selesai pada dua tanggal WIB berbeda dalam 7 hari terakhir. Pembukaan tool dan page hit dilaporkan terpisah.",
  routine_users_7d: 0,
  routine_workspaces_7d: 0,
  completed_values_7d: 0,
  tool_opens_30d: 0,
  requests_30d: 0,
  tools: [],
  requests_by_status: {},
  daily_values_14d: [],
};
const previewData = (): AdminData => ({
  apps: previewTools.map((a) => ({ ...a })),
  groups: [],
  requests: [],
  entitlements: ["free", "pro", "business"].flatMap((plan_id) =>
    previewTools
      .filter((a) => a.status === "active")
      .map((a) => ({
        plan_id,
        capability: a.slug,
        enabled: true,
        monthly_limit: null,
      })),
  ),
  billing: [
    { plan_id: "pro", amount_idr: null, period_days: 30, active: false },
    { plan_id: "business", amount_idr: null, period_days: 30, active: false },
  ],
  audit: [],
  analytics: emptyAnalytics,
});
const toolStatusLabels: Record<string, string> = {
  active: "Aktif",
  beta: "Uji coba",
  coming_soon: "Segera hadir",
  deprecated: "Dihentikan",
  private: "Privat",
};
const statusOptions = [
  "reviewing",
  "planned",
  "building",
  "beta",
  "released",
  "declined",
];
export default function AdminConsole({
  preview = false,
}: {
  preview?: boolean;
}) {
  const [data, setData] = useState<AdminData | null>(
      preview ? previewData : null,
    ),
    [tab, setTab] = useState("analytics"),
    [loading, setLoading] = useState(!preview),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const [toolStatus, setToolStatus] = useState("all");
  async function load() {
    if (preview) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [preview]);
  async function command(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (preview) {
        if (
          action === "app" &&
          ["active", "beta"].includes(String(payload.status)) &&
          ![
            "invoice",
            "qr",
            "business-report",
            "invoice-quotation",
            "kasir-pinter",
            "connect",
          ].includes(String(payload.slug))
        )
          throw Error("Tool harus terhubung sebelum diaktifkan.");
        if (
          action === "group" &&
          payload.status === "released" &&
          !data?.apps.some(
            (a) =>
              a.slug === payload.app_id &&
              ["active", "beta"].includes(a.status),
          )
        )
          throw Error("Pilih tool aktif sebelum menandai tersedia.");
        setData((old) => {
          if (!old) return old;
          const next = {
            ...old,
            audit: [
              {
                action,
                details: payload,
                created_at: new Date().toISOString(),
              },
              ...old.audit,
            ],
          };
          if (action === "app")
            next.apps = old.apps.some((a) => a.slug === payload.slug)
              ? old.apps.map((a) =>
                  a.slug === payload.slug ? ({ ...a, ...payload } as Tool) : a,
                )
              : [
                  ...old.apps,
                  {
                    ...payload,
                    icon: "assistant",
                    launch_url: null,
                    access_type: "included",
                    minimum_plan: null,
                    is_featured: false,
                  } as Tool,
                ];
          if (action === "group") {
            const g = {
              ...payload,
              id: payload.id || crypto.randomUUID(),
              votes: 0,
              requests: 0,
            } as Group;
            next.groups = old.groups.some((x) => x.id === g.id)
              ? old.groups.map((x) => (x.id === g.id ? { ...x, ...g } : x))
              : [g, ...old.groups];
          }
          if (action === "entitlement")
            next.entitlements = [
              ...old.entitlements.filter(
                (e) =>
                  !(
                    e.plan_id === payload.plan_id &&
                    e.capability === payload.capability
                  ),
              ),
              payload as AdminData["entitlements"][number],
            ];
          if (action === "billing")
            next.billing = old.billing.map((p) =>
              p.plan_id === payload.plan_id
                ? (payload as AdminData["billing"][number])
                : p,
            );
          if (action === "request") next.requests = old.requests.map(request => request.id === payload.id ? { ...request, status: String(payload.status), group_id: payload.group_id as string | null } : request);
          return next;
        });
        setNotice(
          "Perubahan simulasi tersimpan hanya selama halaman ini terbuka.",
        );
      } else {
        const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload }),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        await load();
        setNotice("Perubahan disimpan dan tercatat di audit.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function appForm(app?: Tool) {
    return (
      <form
        key={app?.slug || "new"}
        className="operational-form admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void command("app", {
            slug: f.get("slug"),
            name: f.get("name"),
            description: f.get("description"),
            category: f.get("category"),
            status: f.get("status"),
            is_public: f.get("is_public") === "on",
            keywords: f.get("keywords") || "",
          });
        }}
      >
        <label>
          Kode tool
          <input
            name="slug"
            defaultValue={app?.slug}
            readOnly={!!app}
            required
            pattern="[a-z][a-z0-9-]{1,59}"
            placeholder="nama-tool"
          />
        </label>
        <label>
          Nama
          <input name="name" defaultValue={app?.name} required maxLength={80} />
        </label>
        <label>
          Kegunaan
          <textarea
            name="description"
            defaultValue={app?.description}
            required
            maxLength={300}
          />
        </label>
        <div className="foundation-columns">
          <label>
            Kategori
            <select name="category" defaultValue={app?.category || "Bisnis"}>
              {["Bisnis", "Utilitas", "AI"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={app?.status || "coming_soon"}>
              {["active", "beta", "coming_soon", "deprecated", "private"].map(
                (v) => (
                  <option key={v} value={v}>
                    {
                      {
                        active: "Aktif",
                        beta: "Uji coba",
                        coming_soon: "Segera hadir",
                        deprecated: "Dihentikan",
                        private: "Privat",
                      }[v]
                    }
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <label>
          Kata pencarian
          <input name="keywords" defaultValue={app?.keywords} maxLength={500} />
        </label>
        <label className="foundation-check">
          <input
            name="is_public"
            type="checkbox"
            defaultChecked={app?.is_public}
          />{" "}
          Tampilkan di katalog
        </label>
        <p className="meta">
          Tool baru bisa diumumkan sebagai Segera Hadir. Status aktif memerlukan
          integrasi yang bekerja.
        </p>
        <button disabled={busy} className="primary">
          Simpan tool
        </button>
      </form>
    );
  }
  function groupForm(g?: Group) {
    return (
      <form
        key={g?.id || "new-group"}
        className="operational-form admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void command("group", {
            ...(g ? { id: g.id } : {}),
            title: f.get("title"),
            description: f.get("description"),
            status: f.get("status"),
            is_public: f.get("is_public") === "on",
            app_id: f.get("app_id") || null,
          });
        }}
      >
        <label>
          Judul kebutuhan
          <input
            name="title"
            defaultValue={g?.title}
            minLength={3}
            maxLength={120}
            required
          />
        </label>
        <label>
          Ringkasan untuk pengguna
          <textarea
            name="description"
            defaultValue={g?.description}
            maxLength={1000}
            required
          />
        </label>
        <p className="meta">
          Tulis ringkasan tanpa nama, kontak, atau informasi privat dari
          permintaan pelanggan.
        </p>
        <label>
          Status
          <select name="status" defaultValue={g?.status || "reviewing"}>
            {statusOptions.map((s) => (
              <option value={s} key={s}>
                {ideaLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tool hasil rilis
          <select name="app_id" defaultValue={g?.app_id || ""}>
            <option value="">Belum ada</option>
            {data?.apps
              .filter((a) => ["active", "beta"].includes(a.status))
              .map((a) => (
                <option value={a.slug} key={a.slug}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="foundation-check">
          <input
            name="is_public"
            type="checkbox"
            defaultChecked={g?.is_public}
          />{" "}
          Publikasikan ide dan buka dukungan pengguna
        </label>
        <button disabled={busy} className="primary">
          Simpan ide
        </button>
      </form>
    );
  }
  const navigation = [
    {
      id: "analytics",
      label: "Ringkasan",
      description:
        "Pahami aktivitas pengguna, performa tools, dan kebutuhan yang masuk.",
      Icon: LayoutDashboard,
    },
    {
      id: "tools",
      label: "Tools",
      description: "Kelola katalog, ketersediaan, dan informasi setiap tool.",
      Icon: Boxes,
    },
    {
      id: "requests",
      label: "Permintaan & ide",
      description:
        "Tinjau masalah pengguna dan kelompokkan kebutuhan yang serupa.",
      Icon: MessageSquarePlus,
    },
    {
      id: "access",
      label: "Paket & akses",
      description: "Atur akses, batas penggunaan, dan harga membership.",
      Icon: CreditCard,
    },
    {
      id: "audit",
      label: "Riwayat perubahan",
      description: "Lihat perubahan pengaturan yang dilakukan oleh admin.",
      Icon: History,
    },
  ];
  const activeSection = navigation.find((item) => item.id === tab)!;
  const visibleTools =
    data?.apps.filter(
      (app) =>
        (toolStatus === "all" || app.status === toolStatus) &&
        `${app.name} ${app.description} ${app.category}`
          .toLocaleLowerCase("id")
          .includes(toolQuery.toLocaleLowerCase("id")),
    ) || [];
  return (
    <main className="standalone-console admin-console">
      <header className="admin-topbar">
        <Link href={preview ? "/preview" : "/dashboard"}>
          <ArrowLeft size={17} />
          Kembali ke Hub
        </Link>
        <span className="admin-environment">
          {preview ? "Preview admin" : "Akses admin"}
        </span>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <ShieldCheck size={24} />
            <div>
              <strong>PRCUISA</strong>
              <span>Admin Console</span>
            </div>
          </div>
          <nav aria-label="Bagian admin">
            {navigation.map(({ id, label, Icon }) => (
              <button
                key={id}
                aria-pressed={tab === id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <p>Kelola ekosistem PRCUISA dari satu tempat.</p>
        </aside>
        <section className="admin-content">
          <label className="admin-mobile-navigation">
            Admin Console
            <select
              aria-label="Bagian Admin Console"
              value={tab}
              onChange={(e) => setTab(e.target.value)}
            >
              {navigation.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-page-heading">
            <div>
              <span className="eyebrow">PRCUISA · ADMIN CONSOLE</span>
              <h1>{activeSection.label}</h1>
              <p>{activeSection.description}</p>
            </div>
            {!preview && (
              <button
                onClick={() => void load()}
                disabled={loading || busy}
                aria-label="Muat ulang data admin"
              >
                <RefreshCw size={17} />
                Muat ulang
              </button>
            )}
          </div>
          {preview && (
            <div className="admin-preview-note">
              <strong>Mode preview</strong>
              <p>
                Perubahan hanya selama sesi ini. Katalog, akun, dan pembayaran
                nyata tidak berubah.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="foundation-note">
              {notice}
            </p>
          )}
          {loading ? (
            <p role="status">Memuat panel admin…</p>
          ) : data ? (
            <>
              {tab === "tools" && (
                <>
                  <details className="admin-disclosure">
                    <summary>Daftarkan tool berikutnya</summary>
                    {appForm()}
                  </details>
                  <div className="admin-tool-filters">
                    <label>
                      <Search size={17} />
                      <input
                        type="search"
                        aria-label="Cari tool admin"
                        placeholder="Cari nama atau kegunaan tool"
                        value={toolQuery}
                        onChange={(e) => setToolQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Status tool admin"
                      value={toolStatus}
                      onChange={(e) => setToolStatus(e.target.value)}
                    >
                      <option value="all">Semua status</option>
                      {Object.entries(toolStatusLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <p className="admin-results">{visibleTools.length} tool</p>
                  {!visibleTools.length && (
                    <div className="admin-empty">
                      <h3>Tool tidak ditemukan</h3>
                      <p>Coba kata lain atau ubah filter status.</p>
                    </div>
                  )}
                  {visibleTools.map((a) => (
                    <details className="admin-disclosure" key={a.slug}>
                      <summary>
                        <span className="admin-tool-summary">
                          <span className="admin-tool-icon">
                            <Boxes size={20} />
                          </span>
                          <span>
                            <strong>{a.name}</strong>
                            <small>
                              {a.category} · {a.description}
                            </small>
                          </span>
                          <span
                            className={`admin-badge admin-badge-${a.status}`}
                          >
                            {toolStatusLabels[a.status] || a.status}
                          </span>
                          <ChevronDown size={17} />
                        </span>
                      </summary>
                      {appForm(a)}
                    </details>
                  ))}
                </>
              )}
              {tab === "requests" && (
                <div className="admin-columns">
                  <section>
                    <h2>Permintaan pelanggan</h2>
                    <p className="meta">
                      100 permintaan terbaru. Detail pelanggan hanya terlihat
                      oleh admin.
                    </p>
                    {data.requests.length ? (
                      data.requests.map((r) => (
                        <form
                          className="admin-request operational-form"
                          key={r.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void command("request", {
                              id: r.id,
                              status: f.get("status"),
                              group_id: f.get("group_id") || null,
                            });
                          }}
                        >
                          <h3>{r.problem}</h3>
                          <p>{r.workflow}</p>
                          <small>{r.frequency}</small>
                          <label>
                            Status
                            <select name="status" defaultValue={r.status}>
                              {["submitted", ...statusOptions].map((v) => (
                                <option key={v} value={v}>
                                  {ideaLabels[v]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Kelompok kebutuhan
                            <select
                              name="group_id"
                              defaultValue={r.group_id || ""}
                            >
                              <option value="">Belum dikelompokkan</option>
                              {data.groups.map((g) => (
                                <option value={g.id} key={g.id}>
                                  {g.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button disabled={busy}>Simpan peninjauan</button>
                        </form>
                      ))
                    ) : (
                      <p className="quiet-empty">
                        Belum ada permintaan pelanggan.
                      </p>
                    )}
                  </section>
                  <section>
                    <h2>Ide yang dikelompokkan</h2>
                    <details className="admin-disclosure">
                      <summary>Buat kelompok kebutuhan</summary>
                      {groupForm()}
                    </details>
                    {data.groups.map((g) => (
                      <details key={g.id} className="admin-disclosure">
                        <summary>
                          {g.title}
                          <span className="meta">
                            {g.requests} permintaan · {g.votes} dukungan
                          </span>
                        </summary>
                        {groupForm(g)}
                      </details>
                    ))}
                  </section>
                </div>
              )}
              {tab === "analytics" && (
                <AdminAnalytics analytics={data.analytics} preview={preview} />
              )}
              {tab === "access" && (
                <>
                  <h2>Akses per paket</h2>
                  <p className="meta">
                    Batas penggunaan berlaku per PRCUISA ID, per bulan WIB.
                    Kosongkan batas untuk tanpa batas.
                  </p>
                  {["free", "pro", "business"].map((plan) => (
                    <details className="admin-disclosure" key={plan}>
                      <summary>{plan.toUpperCase()}</summary>
                      {data.apps
                        .filter((a) => ["active", "beta"].includes(a.status))
                        .map((a) => {
                          const ent = data.entitlements.find(
                            (e) =>
                              e.plan_id === plan && e.capability === a.slug,
                          );
                          return (
                            <form
                              key={a.slug}
                              className="entitlement-row"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void command("entitlement", {
                                  plan_id: plan,
                                  capability: a.slug,
                                  enabled: f.get("enabled") === "on",
                                  monthly_limit:
                                    f.get("limit") === ""
                                      ? null
                                      : Number(f.get("limit")),
                                });
                              }}
                            >
                              <strong>{a.name}</strong>
                              <label className="foundation-check">
                                <input
                                  type="checkbox"
                                  name="enabled"
                                  defaultChecked={ent?.enabled}
                                />{" "}
                                Bisa diakses
                              </label>
                              <label>
                                Batas bulanan
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  name="limit"
                                  defaultValue={ent?.monthly_limit ?? ""}
                                  placeholder="Tanpa batas"
                                />
                              </label>
                              <button disabled={busy}>Simpan akses</button>
                            </form>
                          );
                        })}
                    </details>
                  ))}
                  <h2>Harga membership</h2>
                  <p className="meta">
                    Harga baru dipakai untuk pesanan berikutnya. Pesanan yang
                    sudah dibuat menyimpan harga awalnya.
                  </p>
                  <div className="admin-columns">
                    {data.billing
                      .filter((p) => p.plan_id !== "free")
                      .map((p) => (
                        <form
                          key={p.plan_id}
                          className="operational-form admin-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            if (
                              confirm(
                                "Simpan harga dan status paket untuk pesanan berikutnya?",
                              )
                            )
                              void command("billing", {
                                plan_id: p.plan_id,
                                amount_idr: Number(f.get("amount")),
                                period_days: Number(f.get("days")),
                                active: f.get("active") === "on",
                              });
                          }}
                        >
                          <h3>{p.plan_id.toUpperCase()}</h3>
                          <label>
                            Harga (Rp)
                            <input
                              name="amount"
                              type="number"
                              min={1}
                              max={100000000}
                              defaultValue={p.amount_idr ?? ""}
                              required
                            />
                          </label>
                          <label>
                            Masa akses (hari)
                            <input
                              name="days"
                              type="number"
                              min={1}
                              max={366}
                              defaultValue={p.period_days}
                              required
                            />
                          </label>
                          <label className="foundation-check">
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={p.active}
                            />{" "}
                            Buka pembelian paket
                          </label>
                          <button disabled={busy}>Simpan harga</button>
                        </form>
                      ))}
                  </div>
                </>
              )}
              {tab === "audit" && (
                <section>
                  <h2>Perubahan terakhir</h2>
                  {data.audit.length ? (
                    data.audit.map((a, i) => (
                      <article className="foundation-row" key={i}>
                        <div>
                          <strong>
                            {{
                              app: "Tool diperbarui",
                              group: "Ide diperbarui",
                              request: "Permintaan ditinjau",
                              entitlement: "Akses paket diperbarui",
                              billing: "Harga paket diperbarui",
                            }[a.action] || a.action}
                          </strong>
                          <p>
                            {String(
                              a.details.name ||
                                a.details.title ||
                                a.details.capability ||
                                a.details.plan_id ||
                                "",
                            )}
                          </p>
                        </div>
                        <time>
                          {new Date(a.created_at).toLocaleString("id-ID", {
                            timeZone: "Asia/Jakarta",
                          })}{" "}
                          WIB
                        </time>
                      </article>
                    ))
                  ) : (
                    <p className="quiet-empty">Belum ada perubahan admin.</p>
                  )}
                </section>
              )}
            </>
          ) : (
            <button onClick={() => void load()}>Coba lagi</button>
          )}
        </section>
      </div>
    </main>
  );
}
