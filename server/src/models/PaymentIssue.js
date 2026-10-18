import mongoose from "mongoose";

const paymentIssueSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
  category: {
    type: String,
    enum: ["benefit_not_received", "payment_failed", "duplicate_charge", "incorrect_amount", "refund_help", "other"],
    required: true
  },
  description: { type: String, required: true, minlength: 5, maxlength: 2000 },
  status: { type: String, enum: ["open", "in_review", "resolved", "closed"], default: "open", index: true },
  adminNote: { type: String, default: "", maxlength: 2000 },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "payment_issues" });

paymentIssueSchema.index({ status: 1, createdAt: -1 });
paymentIssueSchema.index({ user: 1, payment: 1, createdAt: -1 });

export const PaymentIssue = mongoose.model("PaymentIssue", paymentIssueSchema);
