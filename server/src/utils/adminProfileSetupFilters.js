export function isProfileSetupComplete(user) {
  return Boolean(
    user &&
    !user.profileSetupSkippedAt &&
    String(user.city || "").trim() &&
    String(user.learningGoal || "").trim()
  );
}

export function matchesProfileSetupFilter(user, filter = "any") {
  const skipped = Boolean(user?.profileSetupSkippedAt);
  const complete = isProfileSetupComplete(user);

  if (filter === "complete") return complete;
  if (filter === "skipped") return skipped;
  if (filter === "incomplete") return !skipped && !complete;
  return true;
}
