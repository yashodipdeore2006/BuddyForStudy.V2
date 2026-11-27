import mongoose from "mongoose";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_FOOTER_GROUPS,
  SITE_SETTINGS_KEY,
  SITE_SOCIAL_LINK_FIELDS,
} from "../utils/siteSettings.js";

const footerLinkSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, required: true, trim: true, maxlength: 50 },
  href: { type: String, required: true, trim: true, maxlength: 500 },
  group: { type: String, enum: SITE_FOOTER_GROUPS, required: true },
}, { _id: false });

const socialLinkDefaults = Object.fromEntries(SITE_SOCIAL_LINK_FIELDS.map((field) => [field, ""]));

const siteSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: SITE_SETTINGS_KEY,
    enum: [SITE_SETTINGS_KEY],
  },
  brand: {
    siteName: { type: String, required: true, trim: true, maxlength: 80, default: DEFAULT_SITE_SETTINGS.brand.siteName },
    tagline: { type: String, trim: true, maxlength: 160, default: DEFAULT_SITE_SETTINGS.brand.tagline },
    description: { type: String, trim: true, maxlength: 320, default: DEFAULT_SITE_SETTINGS.brand.description },
    logoUrl: { type: String, trim: true, maxlength: 1000, default: DEFAULT_SITE_SETTINGS.brand.logoUrl },
  },
  contact: {
    supportEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    supportPhone: { type: String, trim: true, maxlength: 40, default: "" },
    officeAddress: { type: String, trim: true, maxlength: 240, default: "" },
    businessHours: { type: String, trim: true, maxlength: 160, default: "" },
  },
  socialLinks: {
    type: new mongoose.Schema(Object.fromEntries(SITE_SOCIAL_LINK_FIELDS.map((field) => [
      field, { type: String, trim: true, maxlength: 500, default: "" }
    ])), { _id: false }),
    default: () => ({ ...socialLinkDefaults }),
  },
  footerLinks: {
    type: [footerLinkSchema],
    default: () => DEFAULT_SITE_SETTINGS.footerLinks.map((item) => ({ ...item })),
    validate: {
      validator: (items) => Array.isArray(items) && items.length <= 30 &&
        new Set(items.map((item) => item.id)).size === items.length,
      message: "Footer links must contain unique IDs and no more than 30 entries.",
    },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, {
  timestamps: true,
  collection: "site_settings",
  minimize: false,
});


export const SiteSettings = mongoose.models.SiteSettings ||
  mongoose.model("SiteSettings", siteSettingsSchema);
