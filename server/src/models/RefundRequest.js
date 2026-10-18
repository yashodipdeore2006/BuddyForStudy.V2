import mongoose from "mongoose";

const refundRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: "", maxlength: 2000 },
  providerRefundId: { type: String, default: "", index: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "processed"], default: "pending", index: true },
  adminNote: { type: String, default: "" },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  processedAt: { type: Date, default: null }
}, { timestamps: true, collection: "refund_requests" });

refundRequestSchema.index({ status: 1, createdAt: -1 });
export const RefundRequest = mongoose.model("RefundRequest", refundRequestSchema);
