import mongoose from "mongoose";

const adminInvitationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  adminRole: {
    type: String,
    enum: ["super_admin", "platform_admin", "ai_content_manager", "finance_manager", "support_manager", "analyst_auditor"],
    required: true
  },
  tokenHash: { type: String, required: true, unique: true, select: false },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, collection: "admin_invitations" });

adminInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
adminInvitationSchema.index({ email: 1, acceptedAt: 1, revokedAt: 1 });

export const AdminInvitation = mongoose.model("AdminInvitation", adminInvitationSchema);
