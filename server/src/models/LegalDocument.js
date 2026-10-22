import mongoose from "mongoose";

const versionSchema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1 },
  slug: { type: String, required: true, maxlength: 100 },
  category: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 180 },
  summary: { type: String, default: "", maxlength: 500 },
  body: { type: String, required: true, maxlength: 50000 },
  documentUrl: { type: String, default: "", maxlength: 2048 },
  effectiveAt: { type: Date, default: null },
  publishedAt: { type: Date, required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  revisionNote: { type: String, default: "", maxlength: 500 }
}, { _id: false });

const legalDocumentSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  publishedSlug: { type: String, default: "", lowercase: true, trim: true, maxlength: 100 },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, default: "policy", trim: true, maxlength: 80 },
  summary: { type: String, default: "", maxlength: 500 },
  body: { type: String, required: true, maxlength: 50000 },
  documentUrl: { type: String, default: "", maxlength: 2048 },
  effectiveAt: { type: Date, default: null },
  isPublished: { type: Boolean, default: false, index: true },
  isArchived: { type: Boolean, default: false, index: true },
  currentVersion: { type: Number, default: 0, min: 0 },
  versions: { type: [versionSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revisionNote: { type: String, default: "", maxlength: 500 }
}, { timestamps: true, collection: "legal_documents" });

legalDocumentSchema.index({ isPublished: 1, isArchived: 1, publishedSlug: 1 }, { unique: true, partialFilterExpression: { isPublished: true, isArchived: false, publishedSlug: { $type: "string", $gt: "" } } });
legalDocumentSchema.index({ updatedAt: -1 });

export const LegalDocument = mongoose.model("LegalDocument", legalDocumentSchema);
