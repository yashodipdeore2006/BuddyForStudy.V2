import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "INR", uppercase: true },
  provider: { type: String, enum: ["razorpay", "stripe", "manual", "other"], default: "manual" },
  providerPaymentId: { type: String, default: "", index: true },
  providerOrderId: { type: String, default: "" },
  status: { type: String, enum: ["created", "pending", "paid", "failed", "refunded", "partially_refunded", "cancelled"], default: "created", index: true },
  purchaseNotificationStatus: { type: String, enum: ["not_applicable", "pending", "queued"], default: "not_applicable", index: true },
  purchaseNotificationQueuedAt: { type: Date, default: null },
  purchaseNotificationLastCheckedAt: { type: Date, default: null },
  subscriptionNotificationStatus: { type: String, enum: ["not_applicable", "pending", "queued"], default: "not_applicable", index: true },
  subscriptionNotificationQueuedAt: { type: Date, default: null },
  subscriptionNotificationLastCheckedAt: { type: Date, default: null },
  metadata: { type: Map, of: String, default: {} },
  paidAt: { type: Date, default: null }
}, { timestamps: true, collection: "payments" });

paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      provider: "razorpay",
      providerPaymentId: { $type: "string", $gt: "" }
    }
  }
);
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, purchaseNotificationStatus: 1, purchaseNotificationLastCheckedAt: 1, _id: 1 });
paymentSchema.index({ status: 1, subscriptionNotificationStatus: 1, subscriptionNotificationLastCheckedAt: 1, _id: 1 });
export const Payment = mongoose.model("Payment", paymentSchema);
