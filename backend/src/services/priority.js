import Report from "../models/Report.js";

const EARTH_RADIUS_KM = 6371;

function distanceKm(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

export async function calculatePriority(report) {
  const severity = Math.max(1, Math.min(5, report.severity || 3));
  const severityPoints = severity * 12;

  const ageDays = Math.max(
    0,
    (Date.now() - new Date(report.createdAt).getTime()) / 86400000,
  );
  const agePoints = Math.min(20, ageDays * 2);

  const nearby = await Report.find({
    _id: { $ne: report._id },
    category: report.category,
    status: { $nin: ["resolved", "rejected"] },
    createdAt: { $gte: new Date(Date.now() - 90 * 86400000) },
    "location.latitude": {
      $gte: report.location.latitude - 0.01,
      $lte: report.location.latitude + 0.01,
    },
    "location.longitude": {
      $gte: report.location.longitude - 0.01,
      $lte: report.location.longitude + 0.01,
    },
  }).select("location createdAt");

  const recurrenceCount = nearby.filter(
    (item) => distanceKm(report.location, item.location) <= 0.5,
  ).length;

  const recurrencePoints = Math.min(20, recurrenceCount * 5);
  const score = Math.min(100, severityPoints + agePoints + recurrencePoints);

  return {
    score: Math.round(score),
    breakdown: {
      severity: severityPoints,
      age: Math.round(agePoints * 10) / 10,
      recurrence: recurrencePoints,
    },
    nearbyCount: recurrenceCount,
  };
}

export async function refreshPriority(report) {
  const result = await calculatePriority(report);
  report.priorityScore = result.score;
  report.priorityBreakdown = result.breakdown;
  await report.save();
  return { report, ...result };
}
