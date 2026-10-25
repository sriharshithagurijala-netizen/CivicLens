import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Upload, ExternalLink } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const API = "http://localhost:5000/api";

const statuses = [
  "submitted",
  "verified",
  "in_progress",
  "resolved",
  "rejected",
];

export default function AdminReports() {
  const { token, user } = useAuth();
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadReports() {
    setError("");
    try {
      const response = await fetch(`${API}/reports?page=1&limit=50`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to load reports");
      setReports(data.reports || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function changeStatus(reportId, status) {
    setBusy(reportId);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API}/reports/${reportId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          note: `Status updated to ${status.replace("_", " ")} by admin`,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Update failed");

      setReports((current) =>
        current.map((report) =>
          report._id === reportId ? data.report : report,
        ),
      );
      setMessage("Report status updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function uploadPhoto(reportId, file) {
    if (!file) return;

    const form = new FormData();
    form.append("image", file);

    setBusy(reportId);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API}/reports/${reportId}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Upload failed");

      setReports((current) =>
        current.map((report) =>
          report._id === reportId ? data.report : report,
        ),
      );
      setMessage("Image uploaded and report analyzed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (user?.role !== "admin") {
    return (
      <div className="panel admin-denied">Administrator access required.</div>
    );
  }

  const visible = reports.filter(
    (report) => filter === "all" || report.status === filter,
  );

  return (
    <section className="admin-page">
      <div className="admin-heading">
        <div>
          <div className="eyebrow">OPERATIONS</div>
          <h1>Report management</h1>
          <p>
            Review civic reports, update status, and analyze uploaded images.
          </p>
        </div>
        <button className="button-secondary" onClick={loadReports}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {message && <div className="admin-message">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="admin-toolbar panel">
        <div>
          <ShieldCheck size={18} />
          <strong>{visible.length} reports</strong>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-report-list">
        {visible.map((report) => (
          <article className="admin-report panel" key={report._id}>
            <div className="admin-report-top">
              <div>
                <div className="admin-category">
                  {report.category?.replace("_", " ")}
                </div>
                <h2>{report.title}</h2>
                <p>{report.description}</p>
                <small>
                  {report.location?.address || "Location not provided"}
                </small>
              </div>
              <span className={`status-pill ${report.status}`}>
                <span />
                {report.status?.replace("_", " ")}
              </span>
            </div>

            <div className="admin-report-data">
              <span>
                Priority <strong>{report.priorityScore ?? 0}/100</strong>
              </span>
              <span>
                Severity <strong>{report.severity ?? 3}/5</strong>
              </span>
              <span>
                AI{" "}
                <strong>
                  {report.ai?.predictedCategory || "Not analyzed"}
                </strong>
              </span>
              {report.imageUrl && (
                <a href={report.imageUrl} target="_blank" rel="noreferrer">
                  View image <ExternalLink size={13} />
                </a>
              )}
            </div>

            <div className="admin-report-actions">
              <select
                value={report.status}
                disabled={busy === report._id}
                onChange={(e) => changeStatus(report._id, e.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("_", " ")}
                  </option>
                ))}
              </select>

              <label className="button-secondary upload-control">
                <Upload size={15} />
                {busy === report._id ? "Processing..." : "Upload photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={busy === report._id}
                  onChange={(e) => {
                    uploadPhoto(report._id, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </article>
        ))}

        {visible.length === 0 && (
          <div className="panel empty-state">No reports match this filter.</div>
        )}
      </div>
    </section>
  );
}
