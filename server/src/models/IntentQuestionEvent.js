import mongoose from "mongoose";

const intentQuestionEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  questionId: { type: String, required: true, maxlength: 80 },
  packId: { type: String, default: "core", maxlength: 60 },
  event: { type: String, enum: ["shown", "answered", "skipped", "abandoned"], required: true },
  position: { type: Number, min: 0, max: 20, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 }
}, { versionKey: false, collection: "intent_question_events" });

intentQuestionEventSchema.index({ questionId: 1, event: 1, createdAt: -1 });

export const IntentQuestionEvent = mongoose.models.IntentQuestionEvent ||
  mongoose.model("IntentQuestionEvent", intentQuestionEventSchema);
