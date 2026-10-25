import { Router } from "express";
import mongoose from "mongoose";
import { Blob } from "node:buffer";

import Report from "../models/Report.js";
import { authenticate } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { uploadImage } from "../services/cloudinary.js";
import { refreshPriority } from "../services/priority.js";

const router = Router();

router.post(
  "/:id/image",
  authenticate,
  (req, res, next) => {
    upload.single("image")(req, res, (error) => {
      if (error) {
        return res.status(400).json({ message: error.message });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Select an image to upload" });
      }

      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const isOwner = report.createdBy.toString() === req.user._id.toString();
      const isAdmin = req.user.role === "admin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          message: "You can only upload images to your own reports",
        });
      }

      const stored = await uploadImage(req.file.buffer);

      report.imageUrl = stored.url;
      report.imagePublicId = stored.publicId;

      let aiResult = null;

      try {
        const form = new FormData();
        form.append(
          "file",
          new Blob([req.file.buffer], { type: req.file.mimetype }),
          req.file.originalname || "report-image",
        );

        const response = await fetch(
          `${process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"}/classify`,
          { method: "POST", body: form, signal: AbortSignal.timeout(60000) },
        );

        if (response.ok) {
          aiResult = await response.json();

          report.ai = {
            predictedCategory: aiResult.predictedCategory,
            confidence: aiResult.confidence,
            model: aiResult.model,
            reviewed: false,
          };
        }
      } catch (error) {
        console.warn("AI service unavailable:", error.message);
      }

      await report.save();
      const priority = await refreshPriority(report);

      res.json({
        message: "Image uploaded",
        report: priority.report,
        ai: aiResult,
        priority: {
          score: priority.score,
          breakdown: priority.breakdown,
          nearbyCount: priority.nearbyCount,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
