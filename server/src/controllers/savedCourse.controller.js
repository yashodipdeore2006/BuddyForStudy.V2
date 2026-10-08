import { SavedCourse } from "../models/SavedCourse.js";
import { Course } from "../models/Course.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

const courseSelect = "title slug description category level duration thumbnail isPublished pricing";

export async function mine(req, res, next) {
  try {
    const savedCourses = await SavedCourse.find({ user: req.user.userId })
      .populate({ path: "course", select: courseSelect })
      .sort({ savedAt: -1 })
      .lean();
    return success(res, { savedCourses });
  } catch (e) {
    next(e);
  }
}

export async function save(req, res, next) {
  try {
    const courseId = String(req.body.courseId || "");
    if (!isValidObjectId(courseId)) return failure(res, "Invalid courseId", 400);

    const course = await Course.findOne({ _id: courseId, isPublished: true }).select("_id");
    if (!course) return failure(res, "Published course not found", 404);

    const savedCourse = await SavedCourse.findOneAndUpdate(
      { user: req.user.userId, course: course._id },
      { $setOnInsert: { user: req.user.userId, course: course._id, savedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate({ path: "course", select: courseSelect });

    return success(res, { savedCourse }, "Course saved");
  } catch (e) {
    if (e?.code === 11000) {
      const savedCourse = await SavedCourse.findOne({
        user: req.user.userId,
        course: req.body.courseId
      }).populate({ path: "course", select: courseSelect });
      return success(res, { savedCourse }, "Course saved");
    }
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    const courseId = String(req.params.courseId || "");
    if (!isValidObjectId(courseId)) return failure(res, "Invalid courseId", 400);

    const deleted = await SavedCourse.findOneAndDelete({
      user: req.user.userId,
      course: courseId
    });

    if (!deleted) return failure(res, "Saved course not found", 404);
    return success(res, { courseId }, "Course removed from saved");
  } catch (e) {
    next(e);
  }
}