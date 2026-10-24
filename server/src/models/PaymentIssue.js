import mongoose from "mongoose";

const paymentIssueSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
  // Unique while an issue is open or under review to avoid duplicate reports from concurrent requests.
  activePaymentKey: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  category: {
    type: String,
    enum: ["benefit_not_received", "payment_failed", "duplicate_charge", "incorrect_amount", "refund_help", "other"],
    required: true
  },
  description: { type: String, required: true, minlength: 5, maxlength: 2000 },
  status: { type: String, enum: ["open", "in_review", "resolved", "closed"], default: "open", index: true },
  adminNote: { type: String, default: "", maxlength: 2000 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  internalNotes: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, note: { type: String, required: true, maxlength: 2000 }, reason: { type: String, required: true, maxlength: 500 }, createdAt: { type: Date, default: Date.now } }],
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "payment_issues" });

paymentIssueSchema.index({ status: 1, createdAt: -1 });
paymentIssueSchema.index({ user: 1, payment: 1, createdAt: -1 });
paymentIssueSchema.index({ activePaymentKey: 1 }, { unique: true, sparse: true, name: "unique_active_payment_issue_per_payment" });

export const PaymentIssue = mongoose.model("PaymentIssue", paymentIssueSchema);
