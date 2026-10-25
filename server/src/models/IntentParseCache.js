import mongoose from "mongoose";
const intentParseCacheSchema = new mongoose.Schema({
  normalizedQuery: { type: String, required: true, unique: true, index: true, maxlength: 240 },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false, collection: "intent_parse_cache" });
export const IntentParseCache = mongoose.models.IntentParseCache || mongoose.model("IntentParseCache", intentParseCacheSchema);
