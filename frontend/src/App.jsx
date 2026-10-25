import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FilePlus2,
  LayoutDashboard,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAuth } from "./auth/AuthContext";
import AuthPage from "./components/AuthPage";
import ReportIssue from "./components/ReportIssue";
import AdminReports from "./components/AdminReports";
import CivicMap from "./components/CivicMap";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import "./App.css";

const API = "http://localhost:5000/api";

const PAGE_TITLES = {
  Dashboard: "Civic overview",
  Reports: "Civic reports",
  Map: "Issue Map",
  ReportIssue: "Report an issue",
  AdminReports: "Admin management",
  Analytics: "Issue Analytics",
};

function App() {
  const [reports, setReports] = useState([]);
  const { user, loading: authLoading, logout } = useAuth();

  const [page, setPage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadReports() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/reports?page=1&limit=50`);

      if (!response.ok) {
        throw new Error("Unable to load reports");
      }

      const data = await response.json();
      setReports(data.reports || []);
    } catch (err) {
      setError(err.message || "Could not connect to CivicLens API");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  // Citizens must not remain on administrator-only pages.
  useEffect(() => {
    if (
      user &&
      user.role !== "admin" &&
      ["AdminReports", "Analytics"].includes(page)
    ) {
      setPage("Dashboard");
    }
  }, [user, page]);

  function navigateTo(nextPage) {
    setPage(nextPage);
    setSidebarOpen(false);
  }

  const stats = useMemo(
    () => ({
      total: reports.length,
      submitted: reports.filter((r) => r.status === "submitted").length,
      progress: reports.filter((r) => r.status === "in_progress").length,
      resolved: reports.filter((r) => r.status === "resolved").length,
    }),
    [reports],
  );

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesCategory =
        category === "all" || report.category === category;

      const matchesSearch =
        !query ||
        report.title?.toLowerCase().includes(query) ||
        report.description?.toLowerCase().includes(query) ||
        report.location?.address?.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [reports, search, category]);

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="brand-mark">
          <Activity size={24} />
        </div>
        <p>Restoring your CivicLens session...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const isAdmin = user.role === "admin";
  const pageTitle = PAGE_TITLES[page] || "Civic overview";

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="brand">
          <div className="brand-mark">
            <Activity size={23} />
          </div>

          <div className="brand-copy">
            <strong>CivicLens</strong>
            <small>CIVIC INTELLIGENCE</small>
          </div>

          <button
            type="button"
            className="icon-button mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          <NavItem
            active={page === "Dashboard"}
            icon={<LayoutDashboard size={19} />}
            onClick={() => navigateTo("Dashboard")}
          >
            Dashboard
          </NavItem>

          <NavItem
            active={page === "Reports"}
            icon={<MapPin size={19} />}
            onClick={() => navigateTo("Reports")}
            count={reports.length}
          >
            Civic reports
          </NavItem>

          <NavItem
            active={page === "Map"}
            icon={<MapPin size={19} />}
            onClick={() => navigateTo("Map")}
          >
            Issue Map
          </NavItem>

          <NavItem
            active={page === "ReportIssue"}
            icon={<FilePlus2 size={19} />}
            onClick={() => navigateTo("ReportIssue")}
          >
            Report an issue
          </NavItem>

          {isAdmin && (
            <>
              <NavItem
                active={page === "AdminReports"}
                icon={<ShieldCheck size={19} />}
                onClick={() => navigateTo("AdminReports")}
              >
                Admin management
              </NavItem>

              <NavItem
                active={page === "Analytics"}
                icon={<Activity size={19} />}
                onClick={() => navigateTo("Analytics")}
              >
                Issue Analytics
              </NavItem>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span />
            API connection active
          </div>

          <div className="profile">
            <div className="avatar">
              {(user.name || "U").slice(0, 1).toUpperCase()}
            </div>

            <div className="profile-details">
              <strong title={user.name}>{user.name || "User"}</strong>
              <small>{isAdmin ? "Administrator" : "Citizen"}</small>

              <button type="button" className="logout-button" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="mobile-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            Workspace <span>/</span> {pageTitle}
          </div>

          <div className="topbar-right">
            <span className="live-indicator">
              <span /> Live API
            </span>
            <div className="avatar" title={user.name || "User"}>
              {(user.name || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="page-content">
          {page === "ReportIssue" ? (
            <ReportIssue
              onBack={() => navigateTo("Dashboard")}
              onCreated={loadReports}
            />
          ) : page === "AdminReports" && isAdmin ? (
            <AdminReports />
          ) : page === "Map" ? (
            <>
              <PageHeading
                eyebrow="GEOSPATIAL INTELLIGENCE"
                title="Issue Map"
                description="Explore reported civic issues by location, category, and status."
                onRefresh={loadReports}
                loading={loading}
              />
              {error && <ErrorBanner error={error} onRetry={loadReports} />}
              <CivicMap reports={reports} />
            </>
          ) : page === "Analytics" && isAdmin ? (
            <AnalyticsDashboard />
          ) : (
            <>
              <PageHeading
                eyebrow="CIVIC ISSUE MONITORING"
                title={
                  page === "Dashboard" ? "Civic overview" : "Civic reports"
                }
                description="Monitor, review, and understand issues reported by your community."
                onRefresh={loadReports}
                loading={loading}
              />

              {error && <ErrorBanner error={error} onRetry={loadReports} />}

              {page === "Dashboard" && (
                <section className="stats-grid">
                  <StatCard
                    icon={<FilePlus2 />}
                    label="Total reports"
                    value={stats.total}
                    detail="Reports received"
                    tone="blue"
                  />
                  <StatCard
                    icon={<Clock3 />}
                    label="Awaiting review"
                    value={stats.submitted}
                    detail="Submitted by citizens"
                    tone="amber"
                  />
                  <StatCard
                    icon={<Activity />}
                    label="In progress"
                    value={stats.progress}
                    detail="Being addressed"
                    tone="violet"
                  />
                  <StatCard
                    icon={<CheckCircle2 />}
                    label="Resolved issues"
                    value={stats.resolved}
                    detail="Marked as resolved"
                    tone="green"
                  />
                </section>
              )}

              <section className="panel reports-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      {page === "Dashboard"
                        ? "Recent civic reports"
                        : "All civic reports"}
                    </h2>
                    <p>
                      Report information fetched from your MongoDB-backed API.
                    </p>
                  </div>

                  <span className="result-count">
                    {filteredReports.length} reports
                  </span>
                </div>

                <div className="filters">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search issues or locations..."
                      aria-label="Search reports"
                    />
                  </div>

                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    aria-label="Filter reports by category"
                  >
                    <option value="all">All categories</option>
                    <option value="pothole">Pothole</option>
                    <option value="streetlight">Streetlight</option>
                    <option value="garbage">Garbage</option>
                    <option value="drainage">Drainage</option>
                    <option value="water_supply">Water supply</option>
                    <option value="road_damage">Road damage</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {loading ? (
                  <div className="empty-state">
                    <RefreshCw className="spin" />
                    Loading reports...
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <MapPin size={25} />
                    </div>
                    <strong>No reports found</strong>
                    <p>
                      {error
                        ? "Check that your backend is running."
                        : "Submit a report or change your search filters."}
                    </p>
                  </div>
                ) : (
                  <div className="report-list">
                    {(page === "Dashboard"
                      ? filteredReports.slice(0, 5)
                      : filteredReports
                    ).map((report) => (
                      <article className="report-row" key={report._id}>
                        <div className="report-icon">
                          <AlertTriangle size={20} />
                        </div>

                        <div className="report-info">
                          <strong>{report.title}</strong>
                          <p>{report.description}</p>

                          <div className="report-meta">
                            <span>
                              <MapPin size={13} />
                              {report.location?.address || "Location provided"}
                            </span>
                            <span>{report.category?.replaceAll("_", " ")}</span>
                            <span>
                              {report.createdAt
                                ? new Date(
                                    report.createdAt,
                                  ).toLocaleDateString()
                                : ""}
                            </span>
                          </div>
                        </div>

                        <StatusPill status={report.status} />
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <footer className="footer">
            <span>
              <ShieldCheck size={15} />
              CivicLens · AI-powered civic intelligence
            </span>
            <span>Live data from your API</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, icon, count, onClick, children }) {
  return (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span className="nav-label">{children}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

function PageHeading({
  eyebrow = "CIVIC ISSUE MONITORING",
  title,
  description,
  onRefresh,
  loading = false,
}) {
  return (
    <section className="welcome-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>
          {description ||
            "Monitor, review, and understand issues reported by your community."}
        </p>
      </div>

      {onRefresh && (
        <button
          type="button"
          className="button-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Refresh data
        </button>
      )}
    </section>
  );
}

function ErrorBanner({ error, onRetry }) {
  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={18} />
      {error}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function StatusPill({ status }) {
  const labels = {
    submitted: "Submitted",
    verified: "Verified",
    in_progress: "In progress",
    resolved: "Resolved",
    rejected: "Rejected",
  };

  return (
    <span className={`status-pill ${status || "submitted"}`}>
      <span />
      {labels[status] || status || "Submitted"}
    </span>
  );
}

export default App;
