import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 1000, default: "" },
  moderationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  moderationNote: { type: String, default: "", maxlength: 2000 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  moderatedAt: { type: Date, default: null },
  isHidden: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: "course_reviews" });

reviewSchema.index({ course: 1, createdAt: -1 });
reviewSchema.index({ user: 1, course: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);
