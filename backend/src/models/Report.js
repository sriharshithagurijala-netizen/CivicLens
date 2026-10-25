import mongoose from "mongoose";

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["submitted", "verified", "in_progress", "resolved", "rejected"],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reportSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 3000,
    },
    category: {
      type: String,
      enum: [
        "pothole",
        "streetlight",
        "garbage",
        "drainage",
        "water_supply",
        "road_damage",
        "other",
      ],
      required: true,
    },
    location: {
      address: { type: String, trim: true, maxlength: 300, default: "" },
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    imageUrl: { type: String, default: "", maxlength: 1000 },
    imagePublicId: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["submitted", "verified", "in_progress", "resolved", "rejected"],
      default: "submitted",
      index: true,
    },
    severity: { type: Number, min: 1, max: 5, default: 3 },
    priorityScore: { type: Number, min: 0, max: 100, default: 0 },
    priorityBreakdown: {
      severity: { type: Number, default: 0 },
      age: { type: Number, default: 0 },
      recurrence: { type: Number, default: 0 },
    },
    ai: {
      predictedCategory: { type: String, default: "" },
      confidence: { type: Number, min: 0, max: 1, default: null },
      model: { type: String, default: "" },
      reviewed: { type: Boolean, default: false },
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
      default: null,
    },
    possibleDuplicates: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
    ],
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true },
);

reportSchema.index({ createdAt: -1 });
reportSchema.index({ category: 1, status: 1 });
reportSchema.index({ "location.latitude": 1, "location.longitude": 1 });

export default mongoose.model("Report", reportSchema);
