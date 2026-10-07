import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  event: { type: String, required: true },
  processedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "webhook_events" });

export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
