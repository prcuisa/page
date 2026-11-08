import { UsersRound, Building2, CheckCheck, MousePointer2 } from "lucide-react";
import { ideaLabels } from "@/lib/foundation";

export type Analytics = {
  definition: string;
  routine_users_7d: number;
  routine_workspaces_7d: number;
  completed_values_7d: number;
  tool_opens_30d: number;
  requests_30d: number;
  tools: {
    app_id: string;
    name: string;
    opens_30d: number;
    completed_30d: number;
    users_30d: number;
    routine_users_7d: number;
  }[];
  requests_by_status: Record<string, number>;
  daily_values_14d: { date: string; count: number }[];
};
const number = (value: number) => value.toLocaleString("id-ID");

export default function AdminAnalytics({
  analytics: a,
  preview,
}: {
  analytics?: Analytics;
  preview: boolean;
}) {
  if (!a)
    return (
      <div className="admin-empty">
        <h2>Analitik belum tersedia</h2>
        <p>
          Terapkan migration analytics terbaru ke database Hub untuk memuat
          penggunaan nyata.
        </p>
      </div>
    );
  const metrics = [
    {
      label: "Pengguna aktif rutin",
      value: a.routine_users_7d,
      period: "7 hari · minimal 2 hari aktif",
      Icon: UsersRound,
    },
    {
      label: "Bisnis aktif rutin",
      value: a.routine_workspaces_7d,
      period: "7 hari · minimal 2 hari aktif",
      Icon: Building2,
    },
    {
      label: "Aktivitas tool selesai",
      value: a.completed_values_7d,
      period: "7 hari terakhir",
      Icon: CheckCheck,
    },
    {
      label: "Pembukaan tool",
      value: a.tool_opens_30d,
      period: "30 hari · total pembukaan",
      Icon: MousePointer2,
    },
  ];
  const max = Math.max(1, ...a.daily_values_14d.map((day) => day.count));
  return (
    <>
      {preview && (
        <p className="admin-inline-note">
          Simulasi layout. Angka di sini belum berasal dari akun pengguna nyata.
        </p>
      )}
      <div className="analytics-metrics">
        {metrics.map(({ label, value, period, Icon }) => (
          <article className="analytics-metric" key={label}>
            <div className="admin-metric-label">
              <span>{label}</span>
              <Icon size={17} aria-hidden="true" />
            </div>
            <strong>{number(value)}</strong>
            <small>{period}</small>
          </article>
        ))}
      </div>
      <details className="admin-definition">
        <summary>Cara menghitung pengguna aktif</summary>
        <p>{a.definition}</p>
        <p>
          Pembukaan tool hanya dihitung sebagai hit. Semua tanggal menggunakan
          WIB.
        </p>
      </details>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>Performa tools</h2>
            <p>
              Pengguna unik berasal dari aktivitas yang berhasil diselesaikan.
            </p>
          </div>
          <span className="admin-period">7 / 30 hari</span>
        </div>
        {a.tools.length ? (
          <div className="analytics-table-wrap">
            <table className="analytics-table admin-responsive-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Rutin · 7 hari</th>
                  <th>Pengguna · 30 hari</th>
                  <th>Selesai · 30 hari</th>
                  <th>Dibuka · 30 hari</th>
                </tr>
              </thead>
              <tbody>
                {a.tools.map((tool) => (
                  <tr key={tool.app_id}>
                    <td data-label="Tool">
                      <strong>{tool.name}</strong>
                    </td>
                    <td data-label="Aktif rutin · 7 hari">
                      {number(tool.routine_users_7d)}
                    </td>
                    <td data-label="Pengguna · 30 hari">
                      {number(tool.users_30d)}
                    </td>
                    <td data-label="Aktivitas selesai · 30 hari">
                      {number(tool.completed_30d)}
                    </td>
                    <td data-label="Dibuka · 30 hari">
                      {number(tool.opens_30d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty">
            <CheckCheck size={24} />
            <h3>Belum ada aktivitas tool</h3>
            <p>
              Performa akan muncul setelah pengguna menyelesaikan aktivitas pada
              tools.
            </p>
          </div>
        )}
      </section>
      <div className="admin-insights-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Aktivitas harian</h2>
              <p>Aktivitas selesai dalam 14 hari terakhir.</p>
            </div>
          </div>
          {a.daily_values_14d.some((d) => d.count > 0) ? (
            <div className="analytics-day-list">
              {a.daily_values_14d.map((day) => (
                <div className="analytics-day" key={day.date}>
                  <time>
                    {new Date(`${day.date}T12:00:00+07:00`).toLocaleDateString(
                      "id-ID",
                      {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Jakarta",
                      },
                    )}
                  </time>
                  <div className="analytics-day-track" aria-hidden="true">
                    <span style={{ width: `${(day.count / max) * 100}%` }} />
                  </div>
                  <strong>{number(day.count)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <h3>Belum ada aktivitas pada periode ini</h3>
              <p>Grafik akan mengikuti aktivitas yang tercatat.</p>
            </div>
          )}
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Permintaan tools</h2>
              <p>Masuk dalam 30 hari terakhir.</p>
            </div>
            <span className="admin-count">{number(a.requests_30d)}</span>
          </div>
          {Object.keys(a.requests_by_status).length ? (
            <dl className="admin-status-list">
              {Object.entries(a.requests_by_status).map(([status, total]) => (
                <div key={status}>
                  <dt>{ideaLabels[status] || status}</dt>
                  <dd>{number(total)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="admin-empty">
              <h3>Belum ada permintaan</h3>
              <p>Kebutuhan pengguna yang masuk akan dirangkum di sini.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
