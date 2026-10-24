import mongoose from "mongoose";

const pricingSnapshotSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  title: { type: String, default: "" },
  updatedAt: { type: Date, required: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ["pending", "applied", "skipped", "rolled_back"], default: "pending" },
  note: { type: String, default: "" }
}, { _id: false });

const pricingBatchSchema = new mongoose.Schema({
  kind: { type: String, enum: ["preview", "batch"], required: true, index: true },
  status: { type: String, enum: ["preview", "applying", "applied", "partially_applied", "expired", "rolled_back"], required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reason: { type: String, default: "", maxlength: 500 },
  operation: { type: mongoose.Schema.Types.Mixed, required: true },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  items: { type: [pricingSnapshotSchema], default: [] },
  matchedCount: { type: Number, default: 0 },
  appliedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  appliedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null }
}, { timestamps: true, collection: "course_pricing_batches" });

pricingBatchSchema.index({ status: 1, expiresAt: 1 });
pricingBatchSchema.index({ kind: 1, createdAt: -1 });
export const PricingBatch = mongoose.model("PricingBatch", pricingBatchSchema);
