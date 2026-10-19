import mongoose from "mongoose";

const courseRevisionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  revisionNumber: { type: Number, required: true, min: 1 },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changeSource: { type: String, enum: ["admin", "system", "rollback"], default: "system" },
  reason: { type: String, default: "", maxlength: 500 },
  summary: { type: String, default: "Course revision", maxlength: 200 }
}, { timestamps: true, collection: "course_revisions" });

courseRevisionSchema.index({ course: 1, revisionNumber: -1 }, { unique: true });
export const CourseRevision = mongoose.model("CourseRevision", courseRevisionSchema);
