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

const checkoutSchema = z.object({
  courseId: z.string().min(1)
});

export async function createCourseOrder(req, res, next) {
  try {
    const input = checkoutSchema.parse(req.body);
    if (!isValidObjectId(input.courseId)) return failure(res, "Invalid courseId", 400);

    const course = await Course.findOne({ _id: input.courseId, isPublished: true });
    if (!course) return failure(res, "Course not found", 404);
    if (!course.enrollmentEnabled) return failure(res, "Enrollment is disabled for this course", 403);
    if (course.pricing?.mode !== "paid") return failure(res, "This course does not require payment", 400);

    const amount = course.pricing.saleEnabled && course.pricing.salePrice > 0
      ? course.pricing.salePrice
      : course.pricing.price;
    if (!Number.isFinite(amount) || amount <= 0) return failure(res, "Course price is invalid", 400);

    const receipt = "bfs_" + Date.now().toString(36) + "_" + req.user.userId.slice(-8);
    const order = await razorpay.createOrder({
      amount,
      currency: course.pricing.currency || "INR",
      receipt,
      notes: { courseId: String(course._id), userId: String(req.user.userId) }
    });

    const payment = await Payment.create({
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
      keyId: razorpay.getPublicKey(),
      course: { id: course._id, title: course.title, amount }
    }, "Checkout order created", 201);
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
        return success(res, { payment }, "Payment already verified");
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

    return success(res, { payment }, "Payment verified successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function createSubscriptionOrder(req, res, next) {
  try {
    const schema = z.object({ planId: z.string().min(1), trialConversionGrantId: z.string().optional(), recurringConsent: z.literal(true).optional() });
    const { planId, trialConversionGrantId, recurringConsent } = schema.parse(req.body);
    if (!isValidObjectId(planId)) return failure(res, "Invalid planId", 400);

    const { SubscriptionPlan } = await import("../models/SubscriptionPlan.js");
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return failure(res, "Subscription plan not found", 404);
    if (plan.billingInterval === "one_time") return failure(res, "Use course checkout for one-time purchases", 400);

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
    const pendingCheckout = await Payment.findOne({
      user: req.user.userId,
      provider: "razorpay",
      status: "pending",
      "metadata.checkoutType": "subscription",
      ...(conversionGrant ? { "metadata.trialConversionGrantId": String(conversionGrant._id) } : {})
    }).select("_id providerOrderId plan").populate("plan", "name price currency billingInterval").lean();
    if (pendingCheckout) {
      if (pendingCheckout.providerOrderId && pendingCheckout.plan) {
        return success(res, {
          subscriptionId: pendingCheckout.providerOrderId,
          keyId: razorpay.getPublicKey(),
          plan: {
            id: pendingCheckout.plan._id,
            name: pendingCheckout.plan.name,
            price: pendingCheckout.plan.price,
            currency: pendingCheckout.plan.currency,
            billingInterval: pendingCheckout.plan.billingInterval
          }
        }, "Existing subscription checkout reused");
      }
      return failure(res, "A subscription checkout is already pending. Contact support before starting another.", 409, {
        paymentId: String(pendingCheckout._id)
      });
    }

    const intervalMap = { monthly: { period: "monthly", interval: 1 }, quarterly: { period: "monthly", interval: 3 }, yearly: { period: "yearly", interval: 1 } };
    const interval = intervalMap[plan.billingInterval];
    if (!interval) return failure(res, "Unsupported billing interval", 400);

    if (!plan.providerPlanId) {
      const providerPlan = await razorpay.createSubscriptionPlan({
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

    const subscription = await razorpay.createSubscription({
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
      keyId: razorpay.getPublicKey(),
      plan: { id: plan._id, name: plan.name, price: plan.price, currency: plan.currency, billingInterval: plan.billingInterval }
    }, "Subscription checkout created", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}
