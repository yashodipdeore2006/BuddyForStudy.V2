import { canAccessCourse, getEntitlement } from "../services/subscriptionEntitlement.service.js";
import { failure } from "../utils/response.js";

export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === "admin" && req.user?.accessType === "admin") return next();

      const entitlement = await getEntitlement(req.user.userId, feature);
      if (!entitlement.allowed) {
        return failure(
          res,
          `This feature is not included in your current plan. Upgrade to use ${entitlement.feature?.label || "this feature"}.`,
          403,
          {
            feature: entitlement.feature?.key || feature,
            plan: entitlement.plan?.name || "Free"
          }
        );
      }

      req.subscriptionEntitlement = entitlement;
      next();
    } catch (error) {
      next(error);
    }
  };
}


export function requireFeatureIfAuthenticated(feature) {
  return async (req, res, next) => {
    if (!req.user) return next();

    try {
      if (req.user.role === "admin" && req.user.accessType === "admin") return next();

      const entitlement = await getEntitlement(req.user.userId, feature);
      if (!entitlement.allowed) {
        return failure(
          res,
          `This feature is not included in your current plan. Upgrade to use ${entitlement.feature?.label || "this feature"}.`,
          403,
          {
            feature: entitlement.feature?.key || feature,
            plan: entitlement.plan?.name || "Free"
          }
        );
      }

      req.subscriptionEntitlement = entitlement;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Individual paid-course ownership grants access to that course even without
// a subscription that includes the general published-courses feature.
export function requireCourseOrFeature(feature) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === "admin" && req.user?.accessType === "admin") return next();
      const entitlement = await getEntitlement(req.user.userId, feature);
      const courseId = req.params.courseId;
      if (feature === "published_courses" && courseId) {
        if (await canAccessCourse(req.user.userId, courseId)) {
          req.subscriptionEntitlement = entitlement;
          return next();
        }
        return failure(res,
          "This course is not included in your current plan or has no verified individual purchase. Upgrade your plan or purchase this course to continue.",
          403,
          { feature: entitlement.feature?.key || feature, plan: entitlement.plan?.name || "Free" }
        );
      }
      if (entitlement.allowed) {
        req.subscriptionEntitlement = entitlement;
        return next();
      }
      return failure(res,
        `This feature is not included in your current plan. Upgrade your plan or purchase this course to continue.`,
        403,
        { feature: entitlement.feature?.key || feature, plan: entitlement.plan?.name || "Free" }
      );
    } catch (error) {
      next(error);
    }
  };
}
