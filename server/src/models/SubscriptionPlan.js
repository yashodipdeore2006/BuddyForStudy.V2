import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "INR", uppercase: true },
  billingInterval: { type: String, enum: ["monthly", "quarterly", "yearly", "one_time"], default: "monthly" },
  features: { type: [String], default: [] },
  limits: { type: Map, of: Number, default: {} },
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  trialDays: { type: Number, default: 0, min: 0, max: 365 },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true, collection: "subscription_plans" });

subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });
export const SubscriptionPlan = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
