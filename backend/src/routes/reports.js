import { Router } from "express";
import mongoose from "mongoose";
import Report from "../models/Report.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { refreshPriority } from "../services/priority.js";

const router = Router();

const categories = [
  "pothole",
  "streetlight",
  "garbage",
  "drainage",
  "water_supply",
  "road_damage",
  "other",
];

const statuses = [
  "submitted",
  "verified",
  "in_progress",
  "resolved",
  "rejected",
];

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );

    const filter = {};

    if (req.query.category) {
      if (!categories.includes(req.query.category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      filter.category = req.query.category;
    }

    if (req.query.status) {
      if (!statuses.includes(req.query.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      filter.status = req.query.status;
    }

    const reports = await Report.find(filter)
      .select("-createdBy -statusHistory.changedBy")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { title, description, category, location, imageUrl } = req.body;

    if (
      typeof title !== "string" ||
      title.trim().length < 5 ||
      title.trim().length > 120
    ) {
      return res.status(400).json({
        message: "Title must be between 5 and 120 characters",
      });
    }

    if (
      typeof description !== "string" ||
      description.trim().length < 10 ||
      description.trim().length > 3000
    ) {
      return res.status(400).json({
        message: "Description must be between 10 and 3000 characters",
      });
    }

    if (!categories.includes(category)) {
      return res.status(400).json({
        message: "Select a valid report category",
      });
    }

    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (
      !location ||
      location.latitude === "" ||
      location.longitude === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        message: "Valid latitude and longitude are required",
      });
    }

    if (
      imageUrl !== undefined &&
      (typeof imageUrl !== "string" || imageUrl.length > 1000)
    ) {
      return res.status(400).json({
        message: "Invalid image URL",
      });
    }

    const report = await Report.create({
      title: title.trim(),
      description: description.trim(),
      category,
      location: {
        address:
          typeof location.address === "string"
            ? location.address.trim().slice(0, 300)
            : "",
        latitude,
        longitude,
      },
      imageUrl: imageUrl || "",
      createdBy: req.user._id,
      status: "submitted",
      statusHistory: [
        {
          status: "submitted",
          note: "Report submitted",
          changedBy: req.user._id,
        },
      ],
    });

    const priority = await refreshPriority(report);

    res.status(201).json({
      message: "Civic issue reported successfully",
      report: priority.report,
      priority: {
        score: priority.score,
        breakdown: priority.breakdown,
        nearbyCount: priority.nearbyCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid report ID" });
    }

    const report = await Report.findById(req.params.id).select(
      "-createdBy -statusHistory.changedBy",
    );

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/status",
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const { status, note } = req.body;

      if (!statuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid report status",
        });
      }

      if (note !== undefined && typeof note !== "string") {
        return res.status(400).json({
          message: "Status note must be text",
        });
      }

      if (typeof note === "string" && note.length > 500) {
        return res.status(400).json({
          message: "Status note must be at most 500 characters",
        });
      }

      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      report.status = status;
      report.statusHistory.push({
        status,
        note: typeof note === "string" ? note.trim() : "",
        changedBy: req.user._id,
      });

      await report.save();

      res.json({
        message: "Report status updated",
        report,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
