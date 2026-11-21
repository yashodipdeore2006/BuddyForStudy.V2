import mongoose from "mongoose";

const trialGrantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
  campaignName: { type: String, required: true, trim: true, maxlength: 120 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  source: { type: String, enum: ["admin", "campaign"], default: "admin", required: true, index: true },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    required: function requireAdminGrantActor() { return this.source === "admin"; }
  },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: "TrialCampaign", default: null, index: true },
  campaignClaim: { type: mongoose.Schema.Types.ObjectId, ref: "TrialCampaignClaim", default: null },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["trialing", "converted", "expired", "revoked"], default: "trialing", index: true },
  conversionPlan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
  conversionConsentStatus: { type: String, enum: ["not_requested", "pending_user_consent", "authorized", "declined", "cancelled"], default: "not_requested" },
  providerSubscriptionId: { type: String, default: "" },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: true, collection: "trial_grants" });

trialGrantSchema.pre("validate", function validateGrantSource() {
  if (this.source === "campaign") {
    if (!this.campaign) this.invalidate("campaign", "A self-serve trial grant must reference its campaign.");
    if (!this.campaignClaim) this.invalidate("campaignClaim", "A self-serve trial grant must reference its claim.");
    if (!this.claimedBy) this.invalidate("claimedBy", "A self-serve trial grant must record the claiming learner.");
    if (this.grantedBy) this.invalidate("grantedBy", "A self-serve trial grant cannot be attributed to an administrator grant action.");
  } else if (this.campaign || this.campaignClaim || this.claimedBy) {
    this.invalidate("campaign", "Administrator grants cannot contain self-serve campaign provenance.");
  }
});

trialGrantSchema.index({ user: 1, campaignName: 1 }, { unique: true });
trialGrantSchema.index({ status: 1, endsAt: 1 });
trialGrantSchema.index(
  { campaignClaim: 1 },
  { unique: true, partialFilterExpression: { campaignClaim: { $type: "objectId" } }, name: "trial_grant_unique_campaign_claim" }
);
export const TrialGrant = mongoose.model("TrialGrant", trialGrantSchema);
