import mongoose from "mongoose";

const userSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
  status: { type: String, enum: ["trialing", "active", "past_due", "cancelled", "expired"], default: "active", index: true },
  provider: { type: String, enum: ["razorpay", "stripe", "manual", "other"], default: "manual" },
  providerSubscriptionId: { type: String, default: "" },
  providerEventAt: { type: Date, default: null, select: false },
  currentPeriodStart: { type: Date, default: Date.now },
  currentPeriodEnd: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true, collection: "user_subscriptions" });

userSubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
export const UserSubscription = mongoose.model("UserSubscription", userSubscriptionSchema);
