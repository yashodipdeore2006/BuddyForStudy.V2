import { z } from "zod";
import { Course } from "../models/Course.js";
import { Payment } from "../models/Payment.js";
import * as razorpay from "../services/razorpay.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { verifyPaymentSignature } from "../services/razorpay.service.js";

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

    payment.providerPaymentId = input.razorpayPaymentId;
    payment.status = "paid";
    payment.paidAt = payment.paidAt || new Date();
    await payment.save();

    return success(res, { payment }, "Payment verified successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function createSubscriptionOrder(req, res, next) {
  try {
    const schema = z.object({ planId: z.string().min(1) });
    const { planId } = schema.parse(req.body);
    if (!isValidObjectId(planId)) return failure(res, "Invalid planId", 400);

    const { SubscriptionPlan } = await import("../models/SubscriptionPlan.js");
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return failure(res, "Subscription plan not found", 404);
    if (plan.billingInterval === "one_time") return failure(res, "Use course checkout for one-time purchases", 400);

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

    const subscription = await razorpay.createSubscription({
      planId: plan.providerPlanId,
      customerNotify: 1
    });

    await Payment.create({
      user: req.user.userId,
      plan: plan._id,
      amount: plan.price,
      currency: plan.currency || "INR",
      provider: "razorpay",
      providerOrderId: subscription.id,
      status: "pending",
      metadata: { checkoutType: "subscription", subscriptionId: subscription.id }
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
