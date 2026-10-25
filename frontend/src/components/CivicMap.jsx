import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CATEGORIES = [
  ["all", "All categories"],
  ["pothole", "Pothole"],
  ["streetlight", "Streetlight"],
  ["garbage", "Garbage"],
  ["drainage", "Drainage"],
  ["water_supply", "Water supply"],
  ["road_damage", "Road damage"],
  ["other", "Other"],
];

const STATUSES = [
  ["all", "All statuses"],
  ["submitted", "Submitted"],
  ["verified", "Verified"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
  ["rejected", "Rejected"],
];

const STATUS_LABELS = {
  submitted: "Submitted",
  verified: "Verified",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.filter(([key]) => key !== "all"),
);

function makeMarkerIcon(status) {
  const colors = {
    submitted: "#d97706",
    verified: "#2563eb",
    in_progress: "#7c3aed",
    resolved: "#16a34a",
    rejected: "#dc2626",
  };

  const color = colors[status] || "#64748b";

  return L.divIcon({
    className: "civiclens-marker-wrapper",
    html: `<div class="civiclens-marker" style="--marker-color:${color}"><span></span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function FitMarkers({ reports }) {
  const map = useMap();

  useEffect(() => {
    if (!reports.length) return;

    const bounds = L.latLngBounds(
      reports.map((report) => [
        Number(report.location.latitude),
        Number(report.location.longitude),
      ]),
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15,
      });
    }
  }, [map, reports]);

  return null;
}

function formatLabel(value) {
  return value
    ? value
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "Uncategorized";
}

export default function CivicMap({ reports = [] }) {
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const mappedReports = useMemo(
    () =>
      reports.filter((report) => {
        const latitude = Number(report.location?.latitude);
        const longitude = Number(report.location?.longitude);

        return (
          report.location &&
          report.location.latitude !== "" &&
          report.location.longitude !== "" &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      }),
    [reports],
  );

  const filteredReports = useMemo(
    () =>
      mappedReports.filter(
        (report) =>
          (category === "all" || report.category === category) &&
          (status === "all" || report.status === status),
      ),
    [mappedReports, category, status],
  );

  const mapCenter = filteredReports.length
    ? [
        Number(filteredReports[0].location.latitude),
        Number(filteredReports[0].location.longitude),
      ]
    : [17.385, 78.4867];

  return (
    <section className="civic-map-page">
      <div className="civic-map-heading">
        <div>
          <div className="eyebrow">GEOSPATIAL INTELLIGENCE</div>
          <h2>Community issue map</h2>
          <p>
            Explore reported civic issues by location, category, and status.
          </p>
        </div>

        <div className="map-count">
          <strong>{filteredReports.length}</strong>
          <span>Mapped issues</span>
        </div>
      </div>

      <div className="panel map-filter-panel">
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="map-filter-summary">
          Showing {filteredReports.length} of {mappedReports.length} mapped
          reports
        </div>
      </div>

      <div className="panel civic-map-card">
        {filteredReports.length === 0 ? (
          <div className="empty-state map-empty-state">
            <strong>No mapped reports match these filters</strong>
            <p>
              Try another category or status, or submit a report with a valid
              location.
            </p>
          </div>
        ) : (
          <MapContainer
            key={`${category}-${status}-${filteredReports.length}`}
            center={mapCenter}
            zoom={12}
            scrollWheelZoom
            className="civic-leaflet-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitMarkers reports={filteredReports} />

            {filteredReports.map((report) => (
              <Marker
                key={report._id}
                position={[
                  Number(report.location.latitude),
                  Number(report.location.longitude),
                ]}
                icon={makeMarkerIcon(report.status)}
              >
                <Popup>
                  <div className="civic-map-popup">
                    <strong>{report.title || "Civic issue"}</strong>
                    <p>{report.description || "No description provided."}</p>

                    <div>
                      <b>Category:</b> {formatLabel(report.category)}
                    </div>

                    <div>
                      <b>Status:</b>{" "}
                      {STATUS_LABELS[report.status] ||
                        formatLabel(report.status)}
                    </div>

                    <div>
                      <b>Location:</b>{" "}
                      {report.location.address || "Location provided"}
                    </div>

                    {report.createdAt && (
                      <div>
                        <b>Reported:</b>{" "}
                        {new Date(report.createdAt).toLocaleDateString()}
                      </div>
                    )}

                    {report.imageUrl && (
                      <a
                        href={report.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View issue photo
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      <div className="map-legend">
        <span>
          <i className="legend-dot submitted" /> Submitted
        </span>
        <span>
          <i className="legend-dot verified" /> Verified
        </span>
        <span>
          <i className="legend-dot in-progress" /> In progress
        </span>
        <span>
          <i className="legend-dot resolved" /> Resolved
        </span>
        <span>
          <i className="legend-dot rejected" /> Rejected
        </span>
      </div>

      {reports.length > mappedReports.length && (
        <p className="map-data-note">
          {reports.length - mappedReports.length} report(s) are missing valid
          coordinates and cannot be displayed on the map.
        </p>
      )}
    </section>
  );
}
