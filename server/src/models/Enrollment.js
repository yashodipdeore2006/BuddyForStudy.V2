import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  enrolledAt: { type: Date, default: Date.now, required: true },
  status: {
    type: String,
    enum: ["active", "completed", "cancelled"],
    default: "active",
    required: true
  },
  accessSource: { type: String, enum: ["self", "admin"], default: "self", required: true },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  accessReason: { type: String, default: "", maxlength: 500 },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, collection: "enrollments" });

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ user: 1, status: 1 });

export const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
