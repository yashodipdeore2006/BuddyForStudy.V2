import mongoose from "mongoose";

const cookiePreferencesSchema = new mongoose.Schema({
  necessary: { type: Boolean, default: true, required: true },
  analytics: { type: Boolean, default: false, required: true },
  marketing: { type: Boolean, default: false, required: true }
}, { _id: false });

const userConsentEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  type: {
    type: String,
    enum: ["terms", "privacy", "marketing_email", "cookie_preferences", "push_notifications", "profile_details"],
    required: true,
    immutable: true
  },
  version: { type: String, default: "", maxlength: 160, immutable: true },
  accepted: { type: Boolean, default: null, immutable: true },
  preferences: { type: cookiePreferencesSchema, default: undefined, immutable: true },
  source: {
    type: String,
    enum: ["registration", "account_gate", "cookie_banner", "settings", "google_onboarding", "profile_settings"],
    required: true,
    immutable: true
  },
  changedFields: { type: [String], default: [], maxlength: 20, immutable: true }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: "user_consent_events",
  versionKey: false
});

userConsentEventSchema.index({ user: 1, type: 1, createdAt: -1 });

export const UserConsentEvent = mongoose.model("UserConsentEvent", userConsentEventSchema);
