import mongoose from "mongoose";

const notificationPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  emailCourseUpdates: { type: Boolean, default: true },
  inAppCourseUpdates: { type: Boolean, default: true },
  emailProjectUpdates: { type: Boolean, default: true },
  inAppProjectUpdates: { type: Boolean, default: true },
  emailAnnouncements: { type: Boolean, default: true },
  inAppAnnouncements: { type: Boolean, default: true },
  emailLearningReminders: { type: Boolean, default: true },
  inAppLearningReminders: { type: Boolean, default: true },
  learningRemindersEnabled: { type: Boolean, default: true },
  pushEnabled: { type: Boolean, default: false },
  timezone: { type: String, default: "Asia/Kolkata", maxlength: 64 },
  reminderHour: { type: Number, default: 18, min: 0, max: 23 }
}, { timestamps: true, collection: "notification_preferences" });

export const NotificationPreference = mongoose.model("NotificationPreference", notificationPreferenceSchema);
