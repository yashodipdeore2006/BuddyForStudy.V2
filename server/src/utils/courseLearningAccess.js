export async function checkCourseLearningAccess({ user, courseId, findEnrollment, canAccessCourse }) {
  if (user?.role === "admin" && user?.accessType === "admin") {
    return { allowed: true };
  }

  const userId = user?.userId;
  if (!userId) {
    return { allowed: false, status: 401, message: "Authentication required" };
  }

  const enrollment = await findEnrollment({
    user: userId,
    course: courseId,
    status: { $in: ["active", "completed"] },
    revokedBy: null
  });
  if (!enrollment) {
    return { allowed: false, status: 403, message: "Active or completed enrollment required" };
  }

  if (!await canAccessCourse(userId, courseId)) {
    return {
      allowed: false,
      status: 403,
      message: "Your current plan does not include access to this course or its individual purchase is no longer valid. Upgrade your plan or purchase the course to continue."
    };
  }

  return { allowed: true };
}
