import mongoose from "mongoose";

const messageTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, maxlength: 100 },
  channel: { type: String, enum: ["notification", "email", "announcement"], required: true, index: true },
  title: { type: String, default: "", trim: true, maxlength: 200 },
  subject: { type: String, default: "", trim: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 10000 },
  messageType: { type: String, enum: ["system", "course", "billing", "promotion", "security"], default: "system" },
  link: { type: String, default: "", trim: true, maxlength: 1000 },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, collection: "message_templates" });

messageTemplateSchema.index({ key: 1 }, { unique: true });
messageTemplateSchema.index({ channel: 1, isActive: 1, name: 1 });

export const MessageTemplate = mongoose.model("MessageTemplate", messageTemplateSchema);
