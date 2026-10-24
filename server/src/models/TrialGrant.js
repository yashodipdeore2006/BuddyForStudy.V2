import mongoose from "mongoose";

const trialGrantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
  campaignName: { type: String, required: true, trim: true, maxlength: 120 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["trialing", "converted", "expired", "revoked"], default: "trialing", index: true },
  conversionPlan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
  conversionConsentStatus: { type: String, enum: ["not_requested", "pending_user_consent", "authorized", "declined", "cancelled"], default: "not_requested" },
  providerSubscriptionId: { type: String, default: "" },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: true, collection: "trial_grants" });

trialGrantSchema.index({ user: 1, campaignName: 1 }, { unique: true });
trialGrantSchema.index({ status: 1, endsAt: 1 });
export const TrialGrant = mongoose.model("TrialGrant", trialGrantSchema);
