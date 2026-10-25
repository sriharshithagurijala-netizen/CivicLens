import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const API = "http://localhost:5000/api";

const CATEGORY_LABELS = {
  pothole: "Potholes",
  streetlight: "Streetlights",
  garbage: "Garbage",
  drainage: "Drainage",
  water_supply: "Water supply",
  road_damage: "Road damage",
  other: "Other",
};

const STATUS_LABELS = {
  submitted: "Submitted",
  verified: "Verified",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

function MetricCard({ label, value, description, icon: Icon }) {
  return (
    <article className="analytics-metric">
      <div className="analytics-metric-top">
        <span>{label}</span>
        <Icon size={20} aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}

function Breakdown({ title, values, labels = {} }) {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="analytics-muted">No data available.</p>
      ) : (
        <div className="analytics-breakdown">
          {entries.map(([key, value]) => (
            <div className="analytics-breakdown-row" key={key}>
              <div className="analytics-breakdown-label">
                <span>{labels[key] || key}</span>
                <strong>{value}</strong>
              </div>
              <div
                className="analytics-bar-track"
                role="img"
                aria-label={`${labels[key] || key}: ${value}`}
              >
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${(value / maximum) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AnalyticsDashboard() {
  const { token } = useAuth();

  const [summary, setSummary] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [radiusKm, setRadiusKm] = useState("0.5");
  const [minReports, setMinReports] = useState("2");

  const loadAnalytics = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setError("Please log in as an administrator to view analytics.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setError("");
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const headers = { Authorization: `Bearer ${token}` };

        const query = new URLSearchParams({
          radiusKm,
          minReports,
        });

        const [summaryResponse, hotspotsResponse] = await Promise.all([
          fetch(`${API}/analytics/summary`, { headers }),
          fetch(`${API}/analytics/hotspots?${query.toString()}`, { headers }),
        ]);

        const [summaryData, hotspotsData] = await Promise.all([
          summaryResponse.json().catch(() => ({})),
          hotspotsResponse.json().catch(() => ({})),
        ]);

        if (!summaryResponse.ok) {
          throw new Error(
            summaryData.message || "Could not load analytics summary.",
          );
        }

        if (!hotspotsResponse.ok) {
          throw new Error(
            hotspotsData.message || "Could not load hotspot data.",
          );
        }

        setSummary(summaryData);
        setHotspots(hotspotsData.hotspots || []);
      } catch (err) {
        setError(err.message || "Unable to load analytics.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, radiusKm, minReports],
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <section className="analytics-page">
        <div className="analytics-loading">
          <RefreshCw size={20} className="analytics-spin" />
          Loading civic analytics...
        </div>
      </section>
    );
  }

  return (
    <section className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="eyebrow">CIVICLENS INTELLIGENCE</div>
          <h1>Issue Analytics</h1>
          <p>
            Monitor civic reports, identify high-priority areas, and review
            geographic hotspots.
          </p>
        </div>

        <button
          type="button"
          className="analytics-refresh"
          onClick={() => loadAnalytics(true)}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? "analytics-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="analytics-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => loadAnalytics(true)}>
            Retry
          </button>
        </div>
      )}

      {!summary ? (
        <div className="analytics-panel">
          Analytics data is unavailable. Check the API and your admin login.
        </div>
      ) : (
        <>
          {summary.truncated && (
            <div className="analytics-warning" role="status">
              Analytics were calculated from the first{" "}
              {summary.maxReportsAnalyzed} matching reports. The dataset exceeds
              the current analysis limit.
            </div>
          )}

          <div className="analytics-metrics">
            <MetricCard
              label="Reports analyzed"
              value={summary.totalReports}
              description="Matching reports in this analysis"
              icon={Activity}
            />
            <MetricCard
              label="Open issues"
              value={summary.openReports}
              description="Not resolved or rejected"
              icon={Clock3}
            />
            <MetricCard
              label="Resolved"
              value={summary.resolvedReports}
              description="Marked as resolved"
              icon={CheckCircle2}
            />
            <MetricCard
              label="High priority"
              value={summary.highPriorityReports}
              description="Priority score of 70 or above"
              icon={TrendingUp}
            />
          </div>

          <div className="analytics-secondary-metrics">
            <div>
              <span>Average priority</span>
              <strong>{summary.averagePriorityScore}/100</strong>
            </div>
            <div>
              <span>Average severity</span>
              <strong>{summary.averageSeverity}/5</strong>
            </div>
          </div>

          <div className="analytics-two-column">
            <Breakdown
              title="Reports by category"
              values={summary.byCategory}
              labels={CATEGORY_LABELS}
            />
            <Breakdown
              title="Reports by status"
              values={summary.byStatus}
              labels={STATUS_LABELS}
            />
          </div>

          <section className="analytics-panel">
            <div className="analytics-section-header">
              <div>
                <h2>Geographic hotspots</h2>
                <p className="analytics-muted">
                  Nearby reports grouped by approximate distance.
                </p>
              </div>

              <div className="analytics-filters">
                <label>
                  Radius
                  <select
                    value={radiusKm}
                    onChange={(event) => setRadiusKm(event.target.value)}
                  >
                    <option value="0.25">250 m</option>
                    <option value="0.5">500 m</option>
                    <option value="1">1 km</option>
                    <option value="2">2 km</option>
                  </select>
                </label>

                <label>
                  Minimum reports
                  <select
                    value={minReports}
                    onChange={(event) => setMinReports(event.target.value)}
                  >
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="5">5+</option>
                  </select>
                </label>
              </div>
            </div>

            {hotspots.length === 0 ? (
              <p className="analytics-muted">
                No hotspots meet these settings yet. Submit reports at nearby
                coordinates or increase the radius.
              </p>
            ) : (
              <div className="analytics-hotspot-list">
                {hotspots.map((hotspot) => (
                  <article className="analytics-hotspot" key={hotspot.id}>
                    <div className="analytics-hotspot-icon">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="analytics-hotspot-content">
                      <div className="analytics-hotspot-title">
                        <h3>
                          Hotspot —{" "}
                          {hotspot.dominantCategory.replaceAll("_", " ")}
                        </h3>
                        <span>{hotspot.reportCount} reports</span>
                      </div>
                      <p>
                        {hotspot.latitude}, {hotspot.longitude}
                      </p>
                      <div className="analytics-hotspot-stats">
                        <span>
                          Priority: {hotspot.averagePriorityScore}/100
                        </span>
                        <span>Severity: {hotspot.averageSeverity}/5</span>
                      </div>
                      <details>
                        <summary>View reports in this hotspot</summary>
                        <ul>
                          {hotspot.reports.map((report) => (
                            <li key={report._id}>
                              <strong>{report.title}</strong>
                              {" — "}
                              {STATUS_LABELS[report.status] || report.status}
                              {" · Priority "}
                              {report.priorityScore}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <p className="analytics-muted analytics-footnote">
              Hotspots are approximate clusters, not confirmed duplicate
              reports. Reports without valid coordinates are excluded from
              hotspot detection.
            </p>
          </section>

          <section className="analytics-panel">
            <h2>Recent reports</h2>
            {!summary.recentReports?.length ? (
              <p className="analytics-muted">No reports found.</p>
            ) : (
              <div className="analytics-table-wrapper">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentReports.map((report) => (
                      <tr key={report._id}>
                        <td>{report.title}</td>
                        <td>
                          {CATEGORY_LABELS[report.category] || report.category}
                        </td>
                        <td>{STATUS_LABELS[report.status] || report.status}</td>
                        <td>{report.priorityScore ?? 0}</td>
                        <td>
                          {report.createdAt
                            ? new Date(report.createdAt).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
