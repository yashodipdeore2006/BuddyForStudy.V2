import { z } from "zod";
import { Course } from "../models/Course.js";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import * as razorpay from "../services/razorpay.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { verifyPaymentSignature } from "../services/razorpay.service.js";
import { capturedPaymentValidationError } from "../services/paymentVerification.js";
import { getEffectiveCoursePrice } from "../utils/coursePricing.js";
import { toRazorpayMinorUnits } from "../utils/razorpayAmounts.js";
import { enroll } from "../services/enrollment.service.js";
import { acquireCheckoutLock, checkoutLockKey, releaseCheckoutLock } from "../services/checkoutLock.service.js";

const checkoutSchema = z.object({
  courseId: z.string().min(1)
});

function pendingCourseCheckoutMatchesPrice(payment, amount, currency) {
  const pendingAmount = Number(payment?.amount);
  const pendingCurrency = String(payment?.currency || "INR").toUpperCase();
  const requestedCurrency = String(currency || "INR").toUpperCase();
  if (!payment?.providerOrderId || pendingCurrency !== requestedCurrency || !Number.isFinite(pendingAmount) || pendingAmount <= 0) return false;
  try {
    return toRazorpayMinorUnits(pendingAmount, pendingCurrency) === toRazorpayMinorUnits(Number(amount), requestedCurrency);
  } catch {
    return false;
  }
}

async function restorePurchasedCourseEnrollment(payment, userId) {
  if (!payment?.course) return null;
  // Payment must already be stored as paid before this call. The enrollment
  // service verifies that purchase before granting individual course access.
  return enroll(userId, payment.course);
}

export async function createCourseOrder(req, res, next, dependencies = {}) {
  const CourseModel = dependencies.Course || Course;
  const PaymentModel = dependencies.Payment || Payment;
  const createOrder = dependencies.createOrder || razorpay.createOrder;
  const getPublicKey = dependencies.getPublicKey || razorpay.getPublicKey;
  const acquireLock = dependencies.acquireCheckoutLock || acquireCheckoutLock;
  const releaseLock = dependencies.releaseCheckoutLock || releaseCheckoutLock;
  const enrollUser = dependencies.enroll || enroll;
  try {
    const input = checkoutSchema.parse(req.body);
    if (!isValidObjectId(input.courseId)) return failure(res, "Invalid courseId", 400);

    const course = await CourseModel.findOne({
      _id: input.courseId,
      isPublished: true,
      deletedAt: null,
      status: { $ne: "archived" },
      visibility: { $ne: "private" },
      $or: [
        { "generation.mode": { $nin: ["normal", "ai", "module", "discovery"] } },
        {
          aiReviewStatus: "approved",
          $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
        }
      ]
    });
    if (!course) return failure(res, "Course not found", 404);
    if (!course.enrollmentEnabled) return failure(res, "Enrollment is disabled for this course", 403);
    if (course.pricing?.mode !== "paid") return failure(res, "This course does not require payment", 400);

    const amount = getEffectiveCoursePrice(course.pricing);
    if (!Number.isFinite(amount) || amount <= 0) return failure(res, "Course price is invalid. Please contact support before retrying checkout.", 400);

    // Recover access after a verified purchase if the browser closed or the
    // enrollment request failed. Never charge a learner twice for the same course.
    const lockKey = checkoutLockKey("course", req.user.userId, String(course._id));
    const lockToken = await acquireLock(lockKey);
    if (!lockToken) {
      const pending = await PaymentModel.findOne({
        user: req.user.userId,
        course: course._id,
        provider: "razorpay",
        status: "pending"
      }).sort({ createdAt: -1 });
      if (pending && pendingCourseCheckoutMatchesPrice(pending, amount, course.pricing.currency || "INR")) {
        const pendingAmount = Number(pending.amount);
        const pendingCurrency = String(pending.currency || "INR").toUpperCase();
        return success(res, {
          paymentId: pending._id,
          order: { id: pending.providerOrderId, amount: toRazorpayMinorUnits(pendingAmount, pendingCurrency), currency: pendingCurrency },
          keyId: getPublicKey(),
          course: { id: course._id, title: course.title, amount: pendingAmount }
        }, "Existing course checkout reused", 200);
      }
      return failure(res, "A checkout is already pending for this course, but its amount or currency no longer matches the current price. Please contact support before retrying.", 409);
    }
    try {
    const priorPurchase = await PaymentModel.findOne({
      user: req.user.userId,
      course: course._id,
      provider: "razorpay",
      status: { $in: ["paid", "partially_refunded"] }
    }).sort({ paidAt: -1, createdAt: -1 });

    if (priorPurchase) {
      const enrollment = await enrollUser(req.user.userId, course._id);
      return success(res, {
        alreadyPurchased: true,
        paymentId: priorPurchase._id,
        course: { id: course._id, title: course.title, amount: priorPurchase.amount },
        enrollment
      }, "This course was already purchased. Your learning access has been restored.", 200);
    }

    // Reuse the latest pending order for this learner/course. Repeated checkout
    // requests (such as refreshes or interrupted modal attempts) must not create
    // multiple payable Razorpay orders and risk duplicate charges.
    const pendingCourseCheckout = await PaymentModel.findOne({
      user: req.user.userId,
      course: course._id,
      provider: "razorpay",
      status: "pending"
    }).sort({ createdAt: -1 });

    if (pendingCourseCheckout) {
      if (!pendingCourseCheckoutMatchesPrice(pendingCourseCheckout, amount, course.pricing.currency || "INR")) {
        return failure(res, "A previous checkout is pending, but its amount or currency no longer matches the current price. Contact support before retrying.", 409);
      }
      const pendingAmount = Number(pendingCourseCheckout.amount);
      const pendingCurrency = String(pendingCourseCheckout.currency || "INR").toUpperCase();
      return success(res, {
        paymentId: pendingCourseCheckout._id,
        order: {
          id: pendingCourseCheckout.providerOrderId,
          amount: toRazorpayMinorUnits(pendingAmount, pendingCourseCheckout.currency || "INR"),
          currency: pendingCurrency
        },
        keyId: getPublicKey(),
        course: { id: course._id, title: course.title, amount: pendingAmount }
      }, "Existing course checkout reused", 200);
    }

    const receipt = "bfs_" + Date.now().toString(36) + "_" + req.user.userId.slice(-8);
    const order = await createOrder({
      amount,
      currency: course.pricing.currency || "INR",
      receipt,
      notes: { courseId: String(course._id), userId: String(req.user.userId) }
    });

    const payment = await PaymentModel.create({
      user: req.user.userId,
      course: course._id,
      amount,
      currency: course.pricing.currency || "INR",
      provider: "razorpay",
      providerOrderId: order.id,
      status: "pending",
      metadata: { receipt, checkoutType: "course" }
    });

    return success(res, {
      paymentId: payment._id,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: getPublicKey(),
      course: { id: course._id, title: course.title, amount }
    }, "Checkout order created", 201);
    } finally {
      await releaseLock(lockKey, lockToken).catch((error) => console.error("[checkout] course lock release failed", { courseId: String(course._id), message: String(error?.message || error).slice(0, 200) }));
    }
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function verifyCoursePayment(req, res, next) {
  try {
    const schema = z.object({
      paymentId: z.string().min(1),
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1)
    });
    const input = schema.parse(req.body);
    const payment = await Payment.findOne({
      _id: input.paymentId,
      user: req.user.userId,
      provider: "razorpay"
    });
    if (!payment) return failure(res, "Payment record not found", 404);
    if (payment.providerOrderId !== input.razorpayOrderId) return failure(res, "Order mismatch", 400);
    if (!verifyPaymentSignature({
      orderId: payment.providerOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature
    })) return failure(res, "Invalid payment signature", 400);

    if (payment.status === "paid") {
      if (payment.providerPaymentId === input.razorpayPaymentId) {
        // Make retries recover access if the original request saved the payment
        // but failed before enrollment was completed.
        const enrollment = await restorePurchasedCourseEnrollment(payment, req.user.userId);
        return success(res, { payment, enrollment }, "Payment already verified; course access restored");
      }
      return failure(res, "Payment has already been verified with a different provider payment", 409);
    }
    if (payment.status === "refunded" || payment.status === "partially_refunded") {
      return failure(res, "Payment is already refunded", 409);
    }

    const providerPayment = await razorpay.fetchPayment(input.razorpayPaymentId);
    const providerValidationError = capturedPaymentValidationError(payment, providerPayment);
    if (providerValidationError) return failure(res, providerValidationError, 400);

    payment.providerPaymentId = input.razorpayPaymentId;
    payment.status = "paid";
    payment.paidAt = payment.paidAt || new Date();
    if (payment.course) {
      payment.purchaseNotificationStatus = "pending";
      payment.purchaseNotificationLastCheckedAt = null;
    }
    await payment.save();

    // Complete the paid purchase on the server. If enrollment is temporarily
    // unavailable, keep the verified payment; a retry of this same verification
    // will attempt enrollment again without charging the learner twice.
    const enrollment = await restorePurchasedCourseEnrollment(payment, req.user.userId);
    return success(res, { payment, enrollment }, "Payment verified and course access granted");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function createSubscriptionOrder(req, res, next, dependencies = {}) {
  const createSubscriptionPlan = dependencies.createSubscriptionPlan || razorpay.createSubscriptionPlan;
  const createSubscription = dependencies.createSubscription || razorpay.createSubscription;
  const getPublicKey = dependencies.getPublicKey || razorpay.getPublicKey;
  try {
    const schema = z.object({ planId: z.string().min(1), trialConversionGrantId: z.string().optional(), recurringConsent: z.literal(true).optional() });
    const { planId, trialConversionGrantId, recurringConsent } = schema.parse(req.body);
    if (!isValidObjectId(planId)) return failure(res, "Invalid planId", 400);

    const { SubscriptionPlan } = await import("../models/SubscriptionPlan.js");
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return failure(res, "Subscription plan not found", 404);
    if (plan.billingInterval === "one_time") return failure(res, "Use course checkout for one-time purchases", 400);

    const lockKey = checkoutLockKey("subscription", req.user.userId);
    const lockToken = await acquireCheckoutLock(lockKey);
    if (!lockToken) {
      return failure(res, "A subscription checkout is already being prepared for this account. Retry in a moment.", 409);
    }
    try {
    const existingSubscription = await UserSubscription.findOne({
      user: req.user.userId,
      status: { $in: ["trialing", "active", "past_due"] },
      $or: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { $exists: false } },
        { currentPeriodEnd: { $gt: new Date() } }
      ]
    });
    let conversionGrant = null;
    if (trialConversionGrantId) {
      if (!isValidObjectId(trialConversionGrantId) || recurringConsent !== true) return failure(res, "Explicit recurring-payment consent is required for trial conversion.", 400);
      conversionGrant = await TrialGrant.findOne({
        _id: trialConversionGrantId, user: req.user.userId, status: "trialing",
        endsAt: { $gt: new Date() }, conversionPlan: plan._id,
        conversionConsentStatus: "pending_user_consent"
      });
      if (!conversionGrant) return failure(res, "This trial conversion offer is no longer eligible.", 409);
      if (existingSubscription && !(existingSubscription.status === "trialing" && existingSubscription.provider === "manual")) return failure(res, "An active paid subscription already exists.", 409);
    } else if (existingSubscription) {
      return failure(res, "An active subscription or trial already exists. Use the trial conversion offer if one is available.", 409);
    }

    // Do not create another provider subscription when a previous checkout is
    // still pending. This also makes retries after a page refresh idempotent
    // instead of creating multiple billable subscriptions for the same user.
    const pendingCheckouts = await Payment.find({
      user: req.user.userId,
      provider: "razorpay",
      status: "pending",
      "metadata.checkoutType": "subscription"
    })
      .sort({ createdAt: -1 })
      .select("_id providerOrderId plan metadata")
      .populate("plan", "name price currency billingInterval")
      .lean();

    const requestedConversionGrantId = conversionGrant ? String(conversionGrant._id) : "";
    const matchingPendingCheckout = pendingCheckouts.find((candidate) => {
      const candidatePlanId = String(candidate.plan?._id || candidate.plan || "");
      const candidateGrantId = String(
        candidate.metadata?.get
          ? candidate.metadata.get("trialConversionGrantId") || ""
          : candidate.metadata?.trialConversionGrantId || ""
      );
      return candidatePlanId === String(plan._id) && candidateGrantId === requestedConversionGrantId;
    });

    if (matchingPendingCheckout) {
      if (matchingPendingCheckout.providerOrderId && matchingPendingCheckout.plan) {
        return success(res, {
          subscriptionId: matchingPendingCheckout.providerOrderId,
          keyId: getPublicKey(),
          plan: {
            id: matchingPendingCheckout.plan._id,
            name: matchingPendingCheckout.plan.name,
            price: matchingPendingCheckout.plan.price,
            currency: matchingPendingCheckout.plan.currency,
            billingInterval: matchingPendingCheckout.plan.billingInterval
          }
        }, "Existing subscription checkout reused");
      }
      return failure(res, "A subscription checkout for this plan is pending but its provider reference is incomplete. Contact support before retrying.", 409, {
        paymentId: String(matchingPendingCheckout._id)
      });
    }

    if (pendingCheckouts.length) {
      const pendingCheckout = pendingCheckouts[0];
      return failure(
        res,
        "A subscription checkout for a different plan or trial conversion is already pending. Complete that checkout or contact support before starting another.",
        409,
        {
          paymentId: String(pendingCheckout._id),
          pendingPlanId: String(pendingCheckout.plan?._id || pendingCheckout.plan || "")
        }
      );
    }

    const intervalMap = { monthly: { period: "monthly", interval: 1 }, quarterly: { period: "monthly", interval: 3 }, yearly: { period: "yearly", interval: 1 } };
    const interval = intervalMap[plan.billingInterval];
    if (!interval) return failure(res, "Unsupported billing interval", 400);

    if (!plan.providerPlanId) {
      const providerPlan = await createSubscriptionPlan({
        name: plan.name,
        amount: plan.price,
        currency: plan.currency || "INR",
        period: interval.period,
        interval: interval.interval
      });
      plan.providerPlanId = providerPlan.id;
      await plan.save();
    }

    // Razorpay requires total_count when perpetual subscriptions are not enabled
    // on the merchant account. Keep subscription lifetimes bounded to Razorpay's
    // supported maximum of 10 years while allowing the customer to cancel earlier.
    const totalCountByInterval = {
      monthly: 120,
      quarterly: 40,
      yearly: 10
    };
    const totalCount = totalCountByInterval[plan.billingInterval];

    const subscription = await createSubscription({
      planId: plan.providerPlanId,
      customerNotify: 1,
      totalCount
    });

    await Payment.create({
      user: req.user.userId,
      plan: plan._id,
      amount: plan.price,
      currency: plan.currency || "INR",
      provider: "razorpay",
      providerOrderId: subscription.id,
      status: "pending",
      metadata: { checkoutType: "subscription", subscriptionId: subscription.id, ...(conversionGrant ? { trialConversionGrantId: String(conversionGrant._id), recurringConsentAt: new Date().toISOString() } : {}) }
    });

    return success(res, {
      subscriptionId: subscription.id,
      keyId: getPublicKey(),
      plan: { id: plan._id, name: plan.name, price: plan.price, currency: plan.currency, billingInterval: plan.billingInterval }
    }, "Subscription checkout created", 201);
    } finally {
      await releaseCheckoutLock(lockKey, lockToken).catch((error) => console.error("[checkout] subscription lock release failed", { userId: String(req.user.userId), message: String(error?.message || error).slice(0, 200) }));
    }
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}
