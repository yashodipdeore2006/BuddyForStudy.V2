import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 512 },
    auth: { type: String, required: true, maxlength: 512 }
  },
  expirationTime: { type: Number, default: null },
  userAgent: { type: String, default: "", maxlength: 500 },
  active: { type: Boolean, default: true, index: true },
  lastSuccessAt: { type: Date, default: null },
  lastFailureAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 500 },
  deactivatedAt: { type: Date, default: null }
}, { timestamps: true, collection: "push_subscriptions" });

pushSubscriptionSchema.index({ user: 1, active: 1 });

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
