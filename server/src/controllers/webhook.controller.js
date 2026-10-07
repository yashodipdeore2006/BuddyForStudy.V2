import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";

function subscriptionPeriod(subscription) {
  return {
    currentPeriodStart: subscription?.current_start
      ? new Date(subscription.current_start * 1000)
      : new Date(),
    currentPeriodEnd: subscription?.current_end
      ? new Date(subscription.current_end * 1000)
      : null
  };
}

async function recordSubscriptionCharge(subscription, paymentEntity) {
  if (!subscription?.id || !paymentEntity?.id) return;

  const period = subscriptionPeriod(subscription);
  const existingPayment = await Payment.findOne({
    provider: "razorpay",
    providerPaymentId: paymentEntity.id
  });

  if (existingPayment) {
    existingPayment.status = "paid";
    existingPayment.providerOrderId = subscription.id;
    existingPayment.paidAt = existingPayment.paidAt || new Date();
    await existingPayment.save();
    return existingPayment;
  }

  const initialPayment = await Payment.findOne({
    provider: "razorpay",
    providerOrderId: subscription.id,
    plan: { $ne: null },
    providerPaymentId: ""
  });

  if (initialPayment) {
    initialPayment.providerPaymentId = paymentEntity.id;
    initialPayment.status = "paid";
    initialPayment.paidAt = initialPayment.paidAt || new Date();
    initialPayment.metadata = new Map([
      ["checkoutType", "subscription"],
      ["subscriptionId", subscription.id]
    ]);
    await initialPayment.save();
    return initialPayment;
  }

  const userSubscription = await UserSubscription.findOne({
    provider: "razorpay",
    providerSubscriptionId: subscription.id
  });

  if (!userSubscription) return null;

  return Payment.create({
    user: userSubscription.user,
    plan: userSubscription.plan,
    amount: Number(paymentEntity.amount || 0) / 100,
    currency: paymentEntity.currency || "INR",
    provider: "razorpay",
    providerPaymentId: paymentEntity.id,
    providerOrderId: subscription.id,
    status: "paid",
    paidAt: new Date(),
    metadata: new Map([
      ["checkoutType", "subscription"],
      ["subscriptionId", subscription.id],
      ["renewal", "true"]
    ])
  });
}

export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.get("x-razorpay-signature");
    if (!req.rawBody || !razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (orderId) {
        await Payment.findOneAndUpdate(
          { provider: "razorpay", providerOrderId: orderId },
          {
            $set: {
              status: "paid",
              ...(paymentEntity?.id ? { providerPaymentId: paymentEntity.id } : {}),
              paidAt: new Date()
            }
          }
        );
      }
    } else if (event.event === "subscription.activated" || event.event === "subscription.resumed") {
      if (subscriptionEntity?.id) {
        const payment = await Payment.findOne({
          provider: "razorpay",
          providerOrderId: subscriptionEntity.id
        });

        if (payment) {
          payment.status = "paid";
          if (paymentEntity?.id) payment.providerPaymentId = paymentEntity.id;
          payment.paidAt = payment.paidAt || new Date();
          await payment.save();

          const period = subscriptionPeriod(subscriptionEntity);
          await UserSubscription.findOneAndUpdate(
            { user: payment.user },
            {
              $set: {
                plan: payment.plan,
                status: "active",
                provider: "razorpay",
                providerSubscriptionId: subscriptionEntity.id,
                ...period,
                cancelAtPeriodEnd: false,
                cancelledAt: null
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    } else if (event.event === "subscription.charged") {
      if (subscriptionEntity?.id) {
        const period = subscriptionPeriod(subscriptionEntity);
        await recordSubscriptionCharge(subscriptionEntity, paymentEntity);

        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id },
          {
            $set: {
              status: "active",
              ...period
            }
          }
        );
      }
    } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
      if (subscriptionEntity?.id) {
        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id },
          {
            $set: {
              status: event.event === "subscription.completed" ? "expired" : "cancelled",
              cancelAtPeriodEnd: true,
              cancelledAt: new Date()
            }
          }
        );
      }
    } else if (event.event === "subscription.halted" || event.event === "subscription.pending") {
      if (subscriptionEntity?.id) {
        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id },
          { $set: { status: "past_due" } }
        );
      }
    } else if (event.event === "payment.failed" && orderId) {
      await Payment.findOneAndUpdate(
        { provider: "razorpay", providerOrderId: orderId, status: { $ne: "paid" } },
        { $set: { status: "failed", providerPaymentId: paymentEntity?.id || "" } }
      );
    }

    return success(res, { received: true });
  } catch (e) {
    next(e);
  }
}
