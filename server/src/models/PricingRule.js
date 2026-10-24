import mongoose from "mongoose";

const pricingRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  enabled: { type: Boolean, default: false, index: true },
  autoApply: { type: Boolean, default: false },
  priority: { type: Number, default: 100, min: 1, max: 10000 },
  filters: { type: mongoose.Schema.Types.Mixed, required: true },
  operation: { type: mongoose.Schema.Types.Mixed, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "course_pricing_rules" });

pricingRuleSchema.index({ enabled: 1, priority: 1, createdAt: 1 });
export const PricingRule = mongoose.model("PricingRule", pricingRuleSchema);
