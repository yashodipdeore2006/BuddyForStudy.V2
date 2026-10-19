import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  event: { type: String, required: true },
  providerOrderId: { type: String, default: "", index: true },
  providerPaymentId: { type: String, default: "", index: true },
  status: { type: String, enum: ["processing", "processed", "failed"], index: true },
  claimToken: { type: String, default: null },
  claimedAt: { type: Date, index: true },
  processedAt: { type: Date, default: null }
}, { timestamps: true, collection: "webhook_events" });

export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
