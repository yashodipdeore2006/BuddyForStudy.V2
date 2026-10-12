import { failure } from "../utils/response.js";
import { getEntitlement } from "../services/subscriptionEntitlement.service.js";

export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      if (req.user?.user?.role === "admin") return next();

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
      if (req.user.role === "admin") return next();

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
