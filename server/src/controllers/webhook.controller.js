import crypto from "crypto";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";

function eventId(req) {
  const supplied = req.get("x-razorpay-event-id");
  if (supplied) return supplied;
  return crypto.createHash("sha256").update(req.rawBody || "").digest("hex");
}

async function claimEvent(req, event) {
  const id = eventId(req);
  const existing = await WebhookEvent.findOne({ eventId: id });
  if (existing) return false;

  try {
    await WebhookEvent.create({ eventId: id, event: event.event, processedAt: new Date() });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

function periodDate(value) {
  return value ? new Date(Number(value) * 1000) : null;
}

async function activateSubscription(subscription, payment) {
  await UserSubscription.findOneAndUpdate(
    { user: payment.user },
    {
      $set: {
        plan: payment.plan,
        status: "active",
        provider: "razorpay",
        providerSubscriptionId: subscription.id,
        currentPeriodStart: periodDate(subscription.current_start) || new Date(),
        currentPeriodEnd: periodDate(subscription.current_end),
        cancelAtPeriodEnd: Boolean(subscription.end_at)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function recordSubscriptionCharge(subscription, paymentEntity) {
  if (!subscription?.id) return;

  const providerPaymentId = paymentEntity?.id || "";
  if (providerPaymentId) {
    const duplicate = await Payment.findOne({ provider: "razorpay", providerPaymentId });
    if (duplicate) {
      await activateSubscription(subscription, duplicate);
      return;
    }
  }

  let payment = await Payment.findOne({
    provider: "razorpay",
    providerOrderId: subscription.id,
    status: "pending"
  }).sort({ createdAt: 1 });

  if (payment) {
    payment.providerPaymentId = providerPaymentId || payment.providerPaymentId;
    payment.status = "paid";
    payment.paidAt = payment.paidAt || new Date();
    await payment.save();
  } else {
    const amount = Number(paymentEntity?.amount || 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return;

    const currentSubscription = await UserSubscription.findOne({
      provider: "razorpay",
      providerSubscriptionId: subscription.id
    }).select("user plan");
    if (!currentSubscription) return;

    payment = await Payment.create({
      user: currentSubscription.user,
      plan: currentSubscription.plan,
      amount,
      currency: paymentEntity?.currency || "INR",
      provider: "razorpay",
      providerPaymentId,
      providerOrderId: subscription.id,
      status: "paid",
      paidAt: new Date(),
      metadata: { checkoutType: "subscription", subscriptionId: subscription.id, renewal: "true" }
    });
  }

  await activateSubscription(subscription, payment);
}

export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.get("x-razorpay-signature");
    if (!req.rawBody || !razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    const claimed = await claimEvent(req, event);
    if (!claimed) return success(res, { received: true, duplicate: true });

    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (orderId) {
        await Payment.findOneAndUpdate(
          {
            provider: "razorpay",
            providerOrderId: orderId,
            status: { $in: ["created", "pending"] }
          },
          {
            $set: {
              status: "paid",
              providerPaymentId: paymentEntity?.id || "",
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
        }).sort({ createdAt: -1 });

        if (payment) {
          payment.status = "paid";
          payment.paidAt = payment.paidAt || new Date();
          await payment.save();
          await activateSubscription(subscriptionEntity, payment);
        }
      }
    } else if (event.event === "subscription.charged") {
      await recordSubscriptionCharge(subscriptionEntity, paymentEntity);
    } else if (event.event === "subscription.pending" || event.event === "subscription.halted") {
      if (subscriptionEntity?.id) {
        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id },
          { $set: { status: "past_due" } }
        );
      }
    } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
      if (subscriptionEntity?.id) {
        await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id },
          {
            $set: {
              status: event.event === "subscription.completed" ? "expired" : "cancelled",
              cancelAtPeriodEnd: false,
              cancelledAt: new Date(),
              currentPeriodEnd: periodDate(subscriptionEntity.current_end) || undefined
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
  } catch (e) {
    next(e);
  }
}
