import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";

export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.get("x-razorpay-signature");
    if (!req.rawBody || !razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

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
    } else if (event.event === "subscription.activated" || event.event === "subscription.resumed") {
      const subscription = event?.payload?.subscription?.entity;
      if (subscription?.id) {
        const payment = await Payment.findOne({ provider: "razorpay", providerOrderId: subscription.id });
        if (payment) {
          payment.status = "paid";
          payment.paidAt = payment.paidAt || new Date();
          await payment.save();
          await UserSubscription.findOneAndUpdate(
            { user: payment.user },
            { $set: { plan: payment.plan, status: "active", provider: "razorpay", providerSubscriptionId: subscription.id, currentPeriodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : new Date(), currentPeriodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : null } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    } else if (event.event === "subscription.charged") {
      const subscription = event?.payload?.subscription?.entity;
      if (subscription?.id) {
        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscription.id },
          { $set: { status: "active", currentPeriodStart: subscription.current_start ? new Date(subscription.current_start * 1000) : new Date(), currentPeriodEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : null } }
        );
        await Payment.findOneAndUpdate({ provider: "razorpay", providerOrderId: subscription.id }, { $set: { status: "paid", paidAt: new Date() } });
      }
    } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
      const subscription = event?.payload?.subscription?.entity;
      if (subscription?.id) await UserSubscription.findOneAndUpdate({ provider: "razorpay", providerSubscriptionId: subscription.id }, { $set: { status: event.event === "subscription.completed" ? "expired" : "cancelled", cancelledAt: new Date() } });
    } else if (event.event === "payment.failed" && orderId) {
      await Payment.findOneAndUpdate(
        { provider: "razorpay", providerOrderId: orderId, status: { $ne: "paid" } },
        { $set: { status: "failed", providerPaymentId: paymentEntity?.id || "" } }
      );
    }

    return success(res, { received: true });
  } catch (e) { next(e); }
}
