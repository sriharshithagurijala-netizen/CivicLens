import { Router } from "express";
import mongoose from "mongoose";
import Report from "../models/Report.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { refreshPriority } from "../services/priority.js";

const router = Router();

function distanceKm(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

router.post(
  "/:id/recalculate-priority",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const report = await Report.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const result = await refreshPriority(report);

      res.json({
        report: result.report,
        priority: {
          score: result.score,
          breakdown: result.breakdown,
          nearbyCount: result.nearbyCount,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/duplicates",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const report = await Report.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const candidates = await Report.find({
        _id: { $ne: report._id },
        category: report.category,
        status: { $nin: ["resolved", "rejected"] },
        createdAt: { $gte: new Date(Date.now() - 180 * 86400000) },
        "location.latitude": {
          $gte: report.location.latitude - 0.02,
          $lte: report.location.latitude + 0.02,
        },
        "location.longitude": {
          $gte: report.location.longitude - 0.02,
          $lte: report.location.longitude + 0.02,
        },
      })
        .select("title category location status createdAt imageUrl")
        .limit(100)
        .lean();

      const duplicates = candidates
        .map((candidate) => ({
          ...candidate,
          distanceKm: distanceKm(report.location, candidate.location),
        }))
        .filter((candidate) => candidate.distanceKm <= 0.5)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      report.possibleDuplicates = duplicates.map((item) => item._id);
      await report.save();

      res.json({
        reportId: report._id,
        possibleDuplicates: duplicates,
        method: "Same category and within 500 metres; requires human review.",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
