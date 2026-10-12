import mongoose from "mongoose";

const savedCourseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  savedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true, collection: "saved_courses" });

savedCourseSchema.index({ user: 1, course: 1 }, { unique: true });
savedCourseSchema.index({ user: 1, savedAt: -1 });

export const SavedCourse = mongoose.model("SavedCourse", savedCourseSchema);
