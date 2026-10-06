import mongoose from "mongoose";

const platformSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  description: { type: String, default: "" },
  isPublic: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "platform_settings" });

export const PlatformSetting = mongoose.model("PlatformSetting", platformSettingSchema);
