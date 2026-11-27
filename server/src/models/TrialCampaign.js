import mongoose from "mongoose";

const { Schema } = mongoose;

const campaignEligibilitySchema = new Schema({
  requireActiveAccount: { type: Boolean, default: true },
  requireVerifiedEmail: { type: Boolean, default: true },
  requireNoActiveSubscription: {
    type: Boolean,
    default: true,
    validate: {
      validator: value => value === true,
      message: "Trial campaigns must exclude learners with an active subscription or trial"
    }
  },
  requireNoPreviousTrial: { type: Boolean, default: true }
}, { _id: false, strict: "throw" });

const trialCampaignSchema = new Schema({
  internalName: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 120
  },
  internalReason: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 500
  },
  offerTitle: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 120
  },
  offerDescription: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  trialPlan: {
    type: Schema.Types.ObjectId,
    ref: "SubscriptionPlan",
    required: true,
    index: true
  },
  trialDays: {
    type: Number,
    required: true,
    min: 1,
    max: 30,
    validate: {
      validator: Number.isInteger,
      message: "Trial duration must be a whole number of days"
    }
  },
  status: {
    type: String,
    enum: ["draft", "published", "paused", "ended"],
    default: "draft",
    required: true
  },
  startsAt: { type: Date, required: true, default: Date.now },
  endsAt: { type: Date, default: null },
  maxClaims: {
    type: Number,
    required: true,
    default: 100,
    min: 1,
    max: 1_000_000,
    validate: {
      validator: Number.isInteger,
      message: "Maximum claims must be a whole number"
    }
  },
  claimedCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "Claim count must be a non-negative whole number"
    }
  },
  eligibility: {
    type: campaignEligibilitySchema,
    default: () => ({})
  },
  conversionMode: {
    type: String,
    enum: ["none", "consent_required"],
    default: "none",
    required: true
  },
  conversionPlan: {
    type: Schema.Types.ObjectId,
    ref: "SubscriptionPlan",
    default: null
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  publishedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  publishedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null }
}, {
  timestamps: true,
  collection: "trial_campaigns",
  strict: "throw",
  minimize: false
});

trialCampaignSchema.pre("validate", function validateCampaignInvariants() {
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate("endsAt", "Campaign end must be later than its start");
  }

  if (this.conversionMode === "consent_required" && !this.conversionPlan) {
    this.invalidate("conversionPlan", "A paid conversion plan is required when consent-based conversion is enabled");
  }

  if (this.conversionMode === "none" && this.conversionPlan) {
    this.invalidate("conversionPlan", "A conversion plan cannot be set when conversion is disabled");
  }

  if (this.status === "published" && (!this.publishedAt || !this.publishedBy)) {
    this.invalidate("publishedAt", "A published campaign must record its publisher and publication time");
  }

  if (this.status === "paused" && !this.pausedAt) {
    this.invalidate("pausedAt", "A paused campaign must record when it was paused");
  }

  if (this.status === "ended" && !this.endedAt) {
    this.invalidate("endedAt", "An ended campaign must record when it ended");
  }
});

// Learner offer discovery is status/date bounded. The claim service must still
// use a conditional atomic update against claimedCount < maxClaims at write time.
trialCampaignSchema.index(
  { status: 1, startsAt: 1, endsAt: 1, claimedCount: 1, maxClaims: 1 },
  { name: "trial_campaign_learner_offer_lookup" }
);
trialCampaignSchema.index(
  { status: 1, updatedAt: -1 },
  { name: "trial_campaign_admin_list" }
);
trialCampaignSchema.index(
  { conversionPlan: 1, status: 1 },
  { name: "trial_campaign_conversion_plan" }
);

export const TrialCampaign = mongoose.model("TrialCampaign", trialCampaignSchema);
