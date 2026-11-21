import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema({
  campaign: { type: Schema.Types.ObjectId, ref: "TrialCampaign", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  activeClaimKey: { type: String, default: undefined, maxlength: 64 },
  idempotencyKey: { type: String, required: true, trim: true, minlength: 16, maxlength: 120 },
  status: { type: String, enum: ["reserved", "active", "failed", "revoked"], default: "reserved", required: true },
  claimedAt: { type: Date, required: true, default: Date.now },
  trialPlan: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
  trialDays: {
    type: Number, required: true, min: 1, max: 30,
    validate: { validator: Number.isInteger, message: "Trial duration must be a whole number of days" }
  },
  conversionMode: { type: String, enum: ["none", "consent_required"], default: "none", required: true },
  conversionPlan: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
  trialGrant: { type: Schema.Types.ObjectId, ref: "TrialGrant", default: null },
  userSubscription: { type: Schema.Types.ObjectId, ref: "UserSubscription", default: null },
  activatedAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  failureCode: { type: String, default: "", maxlength: 80 }
}, { timestamps: true, collection: "trial_campaign_claims", strict: "throw", minimize: false });
schema.pre("validate", function validateClaimSnapshot() {
  if (this.conversionMode === "consent_required" && !this.conversionPlan) {
    this.invalidate("conversionPlan", "A conversion plan is required for consent-based conversion.");
  }
  if (this.conversionMode === "none" && this.conversionPlan) {
    this.invalidate("conversionPlan", "A conversion plan cannot be stored when conversion is disabled.");
  }
});
schema.index({ campaign: 1, user: 1 }, { unique: true, name: "trial_campaign_claim_unique_learner" });
schema.index({ user: 1, idempotencyKey: 1 }, { unique: true, name: "trial_campaign_claim_idempotency" });
schema.index({ activeClaimKey: 1 }, { unique: true, partialFilterExpression: { activeClaimKey: { $type: "string" } }, name: "trial_campaign_claim_single_live_user" });
schema.index({ campaign: 1, claimedAt: -1 }, { name: "trial_campaign_claim_campaign_history" });
schema.index({ user: 1, status: 1 }, { name: "trial_campaign_claim_user_status" });
export const TrialCampaignClaim = mongoose.model("TrialCampaignClaim", schema);
