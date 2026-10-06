import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  value: { type: Number, required: true, min: 0 },
  maxDiscount: { type: Number, default: null, min: 0 },
  minOrderAmount: { type: Number, default: 0, min: 0 },
  usageLimit: { type: Number, default: null, min: 1 },
  usedCount: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: "coupons" });

export const Coupon = mongoose.model("Coupon", couponSchema);
