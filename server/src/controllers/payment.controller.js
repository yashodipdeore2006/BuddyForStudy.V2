import { z } from "zod";
import { Course } from "../models/Course.js";
import { Payment } from "../models/Payment.js";
import * as razorpay from "../services/razorpay.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

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
