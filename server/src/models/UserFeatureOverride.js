import mongoose from "mongoose";

const userFeatureOverrideSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  featureKey: { type: String, required: true, trim: true, maxlength: 100 },
  allowed: { type: Boolean, required: true },
  expiresAt: { type: Date, default: null },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, collection: "user_feature_overrides" });

userFeatureOverrideSchema.index({ user: 1, featureKey: 1 }, { unique: true });
userFeatureOverrideSchema.index({ expiresAt: 1 });

export const UserFeatureOverride = mongoose.model("UserFeatureOverride", userFeatureOverrideSchema);
