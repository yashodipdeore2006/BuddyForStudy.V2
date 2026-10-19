import mongoose from "mongoose";

const refundRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
  // Set only while a payment has an active refund request; sparse uniqueness closes concurrent duplicate-request races.
  activePaymentKey: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  amount: {
    type: Number,
    required: true,
    min: [0.01, "Refund amount must be at least 0.01."],
    validate: {
      validator: value => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      message: "Refund amount must use at most two decimal places."
    }
  },
  reason: { type: String, default: "", maxlength: 2000 },
  providerRefundId: { type: String, default: "", index: true },
  reconciliationToken: { type: String, default: undefined, select: false },
  reconciliationStartedAt: { type: Date, default: undefined, select: false },
  status: { type: String, enum: ["pending", "approved", "rejected", "processed"], default: "pending", index: true },
  adminNote: { type: String, default: "" },
  decisionReason: { type: String, default: "", maxlength: 500 },
  slaDueAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: true },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  processedAt: { type: Date, default: null }
}, { timestamps: true, collection: "refund_requests" });

refundRequestSchema.index({ status: 1, createdAt: -1 });
refundRequestSchema.index({ payment: 1, status: 1 });
refundRequestSchema.index({ activePaymentKey: 1 }, { unique: true, sparse: true, name: "unique_active_refund_per_payment" });
export const RefundRequest = mongoose.model("RefundRequest", refundRequestSchema);
