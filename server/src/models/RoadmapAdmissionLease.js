import mongoose from "mongoose";

export const roadmapAdmissionLeaseSchema = new mongoose.Schema({
  draftId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  globalSlot: { type: Number, required: true, min: 0 },
  userSlot: { type: Number, required: true, min: 0 },
  leaseToken: { type: String, required: true },
  heartbeatAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false, collection: "roadmap_admission_leases" });

roadmapAdmissionLeaseSchema.index({ globalSlot: 1 }, { unique: true, name: "roadmap_admission_global_slot_unique" });
roadmapAdmissionLeaseSchema.index({ userId: 1, userSlot: 1 }, { unique: true, name: "roadmap_admission_user_slot_unique" });
roadmapAdmissionLeaseSchema.index({ draftId: 1 }, { unique: true, name: "roadmap_admission_draft_unique" });
roadmapAdmissionLeaseSchema.index({ expiresAt: 1 }, { name: "roadmap_admission_expiry_lookup" });

export const RoadmapAdmissionLease = mongoose.models.RoadmapAdmissionLease
  || mongoose.model("RoadmapAdmissionLease", roadmapAdmissionLeaseSchema);
