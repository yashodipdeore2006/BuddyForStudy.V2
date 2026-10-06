import { Payment } from "../models/Payment.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";

export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.get("x-razorpay-signature");
    if (!razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (orderId) {
        await Payment.findOneAndUpdate(
          { provider: "razorpay", providerOrderId: orderId },
          {
            $set: {
              status: "paid",
              providerPaymentId: paymentEntity?.id || undefined,
              paidAt: new Date()
            }
          }
        );
      }
    } else if (event.event === "payment.failed" && orderId) {
      await Payment.findOneAndUpdate(
        { provider: "razorpay", providerOrderId: orderId, status: { $ne: "paid" } },
        { $set: { status: "failed", providerPaymentId: paymentEntity?.id || "" } }
      );
    }

    return success(res, { received: true });
  } catch (e) { next(e); }
}
