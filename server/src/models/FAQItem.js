import mongoose from "mongoose";
import { FAQ_CATEGORIES } from "../utils/faqContent.js";

const faqItemSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true, trim: true, maxlength: 100 },
  question: { type: String, required: true, trim: true, maxlength: 220 },
  answer: { type: String, required: true, trim: true, maxlength: 6000 },
  category: { type: String, enum: FAQ_CATEGORIES, required: true, default: "getting-started" },
  status: { type: String, enum: ["draft", "published", "archived"], required: true, default: "draft", index: true },
  displayOrder: { type: Number, min: 0, max: 10000, default: 100 },
  featured: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, {
  timestamps: true,
  collection: "faq_items",
  minimize: false,
});

faqItemSchema.index({ status: 1, category: 1, displayOrder: 1, createdAt: 1 });

export const FAQItem = mongoose.models.FAQItem ||
  mongoose.model("FAQItem", faqItemSchema);
