import mongoose from "mongoose";

const savedViewSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  page: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  columns: { type: [String], default: [] },
  sort: { type: mongoose.Schema.Types.Mixed, default: {} },
  density: { type: String, enum: ["compact", "comfortable"], default: "comfortable" },
  shared: { type: Boolean, default: false }
}, { timestamps: true, collection: "admin_saved_views" });

savedViewSchema.index({ owner: 1, page: 1, createdAt: -1 });
savedViewSchema.index({ shared: 1, page: 1, createdAt: -1 });

export const SavedView = mongoose.model("SavedView", savedViewSchema);
