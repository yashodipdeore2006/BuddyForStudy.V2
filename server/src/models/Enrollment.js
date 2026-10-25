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
  // Learning progress is independent of access status: an active enrollment can
  // be not-started, in-progress, or completed without changing access permissions.
  learningStatus: {
    type: String,
    enum: ["not-started", "in-progress", "completed"],
    default: "not-started",
    required: true
  },
  accessSource: { type: String, enum: ["self", "admin", "subscription"], default: "self", required: true },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  accessReason: { type: String, default: "", maxlength: 500 },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, collection: "enrollments" });

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ user: 1, status: 1 });

export const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
