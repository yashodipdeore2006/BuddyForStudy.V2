import mongoose from "mongoose";

const checkoutLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
}, { timestamps: true, collection: "checkout_locks" });

export const CheckoutLock = mongoose.model("CheckoutLock", checkoutLockSchema);
