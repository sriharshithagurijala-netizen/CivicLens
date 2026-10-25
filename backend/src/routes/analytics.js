import { Router } from "express";
import Report from "../models/Report.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

const EARTH_RADIUS_KM = 6371;
const MAX_REPORTS_ANALYZED = 5000;

const CATEGORIES = [
  "pothole",
  "streetlight",
  "garbage",
  "drainage",
  "water_supply",
  "road_damage",
  "other",
];

const STATUSES = [
  "submitted",
  "verified",
  "in_progress",
  "resolved",
  "rejected",
];

function distanceKm(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

function validCoordinates(report) {
  const lat = report.location?.latitude;
  const lon = report.location?.longitude;

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function buildFilter(query) {
  const filter = {};

  if (query.category) {
    if (!CATEGORIES.includes(query.category)) {
      return { error: "Invalid category filter" };
    }
    filter.category = query.category;
  }

  if (query.status) {
    if (!STATUSES.includes(query.status)) {
      return { error: "Invalid status filter" };
    }
    filter.status = query.status;
  }

  if (query.from || query.to) {
    const createdAt = {};

    if (query.from) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) {
        return { error: "Invalid from date" };
      }
      createdAt.$gte = from;
    }

    if (query.to) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) {
        return { error: "Invalid to date" };
      }
      createdAt.$lte = to;
    }

    if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
      return { error: "'from' must be before 'to'" };
    }

    filter.createdAt = createdAt;
  }

  return { filter };
}

function createStats(reports) {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, 0]),
  );

  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));

  let priorityTotal = 0;
  let severityTotal = 0;
  let severityCount = 0;

  for (const report of reports) {
    byCategory[report.category] = (byCategory[report.category] || 0) + 1;

    byStatus[report.status] = (byStatus[report.status] || 0) + 1;

    priorityTotal += Number(report.priorityScore) || 0;

    if (Number.isFinite(report.severity)) {
      severityTotal += report.severity;
      severityCount += 1;
    }
  }

  return {
    totalReports: reports.length,
    openReports: reports.filter(
      (r) => !["resolved", "rejected"].includes(r.status),
    ).length,
    resolvedReports: byStatus.resolved,
    rejectedReports: byStatus.rejected,
    highPriorityReports: reports.filter((r) => Number(r.priorityScore) >= 70)
      .length,
    averagePriorityScore: reports.length
      ? Number((priorityTotal / reports.length).toFixed(2))
      : 0,
    averageSeverity: severityCount
      ? Number((severityTotal / severityCount).toFixed(2))
      : 0,
    byCategory,
    byStatus,
  };
}

/*
 * Greedy radius clustering:
 * Each report can belong to one cluster. Reports are grouped when
 * they are within radiusKm of a cluster's evolving center.
 *
 * This is a practical dashboard approximation, not full DBSCAN.
 */
function detectHotspots(reports, radiusKm, minReports) {
  const points = reports
    .filter(validCoordinates)
    .map((report) => ({
      report,
      latitude: report.location.latitude,
      longitude: report.location.longitude,
    }))
    .sort(
      (a, b) =>
        (Number(b.report.priorityScore) || 0) -
        (Number(a.report.priorityScore) || 0),
    );

  const clusters = [];

  for (const point of points) {
    let bestCluster = null;
    let bestDistance = Infinity;

    for (const cluster of clusters) {
      const distance = distanceKm(point, {
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      });

      if (distance <= radiusKm && distance < bestDistance) {
        bestCluster = cluster;
        bestDistance = distance;
      }
    }

    if (!bestCluster) {
      clusters.push({
        latitude: point.latitude,
        longitude: point.longitude,
        points: [point],
      });
      continue;
    }

    bestCluster.points.push(point);

    const count = bestCluster.points.length;
    bestCluster.latitude =
      bestCluster.points.reduce((sum, p) => sum + p.latitude, 0) / count;
    bestCluster.longitude =
      bestCluster.points.reduce((sum, p) => sum + p.longitude, 0) / count;
  }

  return clusters
    .filter((cluster) => cluster.points.length >= minReports)
    .map((cluster, index) => {
      const items = cluster.points.map((p) => p.report);
      const categoryCounts = {};
      const statusCounts = {};

      let priorityTotal = 0;
      let severityTotal = 0;
      let severityCount = 0;

      for (const report of items) {
        categoryCounts[report.category] =
          (categoryCounts[report.category] || 0) + 1;
        statusCounts[report.status] = (statusCounts[report.status] || 0) + 1;
        priorityTotal += Number(report.priorityScore) || 0;

        if (Number.isFinite(report.severity)) {
          severityTotal += report.severity;
          severityCount += 1;
        }
      }

      const dominantCategory =
        Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "other";

      const ids = items.map((r) => String(r._id));

      return {
        id: `hotspot-${index + 1}`,
        latitude: Number(cluster.latitude.toFixed(6)),
        longitude: Number(cluster.longitude.toFixed(6)),
        reportCount: items.length,
        dominantCategory,
        categoryCounts,
        statusCounts,
        averagePriorityScore: Number((priorityTotal / items.length).toFixed(2)),
        averageSeverity: severityCount
          ? Number((severityTotal / severityCount).toFixed(2))
          : 0,
        reports: items.map((report) => ({
          _id: report._id,
          title: report.title,
          category: report.category,
          status: report.status,
          priorityScore: report.priorityScore || 0,
          severity: report.severity ?? 3,
          createdAt: report.createdAt,
          imageUrl: report.imageUrl || "",
          location: report.location,
        })),
        reportIds: ids,
      };
    })
    .sort(
      (a, b) =>
        b.averagePriorityScore * b.reportCount -
        a.averagePriorityScore * a.reportCount,
    );
}

async function loadFilteredReports(filter) {
  // Limit work per request to protect the API on large datasets.
  const reports = await Report.find(filter)
    .select(
      "title category description location status severity priorityScore createdAt imageUrl",
    )
    .sort({ createdAt: -1 })
    .limit(MAX_REPORTS_ANALYZED + 1)
    .lean();

  return {
    reports: reports.slice(0, MAX_REPORTS_ANALYZED),
    truncated: reports.length > MAX_REPORTS_ANALYZED,
  };
}

router.get("/summary", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const result = buildFilter(req.query);

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    const { reports, truncated } = await loadFilteredReports(result.filter);
    const stats = createStats(reports);

    const recentReports = [...reports]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map((report) => ({
        _id: report._id,
        title: report.title,
        category: report.category,
        status: report.status,
        priorityScore: report.priorityScore || 0,
        createdAt: report.createdAt,
        location: report.location,
      }));

    res.json({
      ...stats,
      recentReports,
      reportsAnalyzed: reports.length,
      truncated,
      maxReportsAnalyzed: MAX_REPORTS_ANALYZED,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/hotspots", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const result = buildFilter(req.query);

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    const radiusKm = Number(req.query.radiusKm ?? 0.5);
    const minReports = Number(req.query.minReports ?? 2);

    if (!Number.isFinite(radiusKm) || radiusKm < 0.05 || radiusKm > 10) {
      return res.status(400).json({
        message: "radiusKm must be between 0.05 and 10",
      });
    }

    if (!Number.isInteger(minReports) || minReports < 2 || minReports > 100) {
      return res.status(400).json({
        message: "minReports must be an integer between 2 and 100",
      });
    }

    const { reports, truncated } = await loadFilteredReports(result.filter);
    const validLocationCount = reports.filter(validCoordinates).length;
    const hotspots = detectHotspots(reports, radiusKm, minReports);

    res.json({
      radiusKm,
      minReports,
      totalReportsAnalyzed: reports.length,
      reportsWithValidCoordinates: validLocationCount,
      reportsWithoutValidCoordinates: reports.length - validLocationCount,
      truncated,
      maxReportsAnalyzed: MAX_REPORTS_ANALYZED,
      hotspotCount: hotspots.length,
      hotspots,
      note: "Hotspots are approximate geographic clusters, not confirmed duplicate reports.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
