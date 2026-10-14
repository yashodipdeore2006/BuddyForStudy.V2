import crypto from "crypto";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";
import { createNotificationEvent } from "../services/notification.service.js";

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
  const isRenewal = payment.metadata?.get
    ? payment.metadata.get("renewal") === "true"
    : payment.metadata?.renewal === "true";
  if (isRenewal && providerPaymentId) {
    await createNotificationEvent({
      userId: String(payment.user),
      title: "Subscription payment received",
      message: `Your subscription renewal payment of ${payment.currency || "INR"} ${payment.amount} was received successfully.`,
      type: "billing",
      link: "/billing",
      eventKey: `subscription-charge:${providerPaymentId}`,
      emailSubject: "Your BuddyForStudy subscription payment receipt",
      metadata: { paymentId: String(payment._id), subscriptionId: String(subscription.id), providerPaymentId, amount: String(payment.amount), currency: payment.currency || "INR" },
      templateKeys: { notification: "subscription-payment-in-app", email: "subscription-payment-email" }
    });
  }
}

export async function razorpayWebhook(req, res, next) {
  let claimedEventId = "";
  try {
    const signature = req.get("x-razorpay-signature");
    if (!req.rawBody || !razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    claimedEventId = eventId(req);
    const claimed = await claimEvent(req, event);
    if (!claimed) return success(res, { received: true, duplicate: true });

    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (orderId) {
        const paidPayment = await Payment.findOneAndUpdate(
          {
            provider: "razorpay",
            providerOrderId: orderId,
            status: { $in: ["created", "pending"] },
            course: { $exists: true }
          },
          {
            $set: {
              status: "paid",
              providerPaymentId: paymentEntity?.id || "",
              paidAt: new Date()
            }
          },
          { new: true }
        ).populate("course", "title");
        if (paidPayment) {
          await createNotificationEvent({
            userId: String(paidPayment.user),
            title: "Course purchase confirmed",
            message: `Your payment for "${paidPayment.course?.title || "your course"}" has been verified. You can now continue to your learning roadmap.`,
            type: "billing",
            link: `/courses/${paidPayment.course?._id || paidPayment.course}/roadmap`,
            eventKey: `course-purchase-confirmed:${paidPayment._id}`,
            emailSubject: "Your BuddyForStudy course purchase is confirmed",
            metadata: { paymentId: String(paidPayment._id), courseId: String(paidPayment.course?._id || paidPayment.course), courseTitle: paidPayment.course?.title || "your course" },
            templateKeys: { notification: "course-purchase-confirmed-in-app", email: "course-purchase-confirmed-email" }
          });
        }
      }
    } else if (event.event === "subscription.activated" || event.event === "subscription.resumed") {
      if (subscriptionEntity?.id) {
        const payment = await Payment.findOne({
          provider: "razorpay",
          providerOrderId: subscriptionEntity.id
        }).sort({ createdAt: -1 }).populate("plan", "name");

        if (payment) {
          payment.status = "paid";
          payment.paidAt = payment.paidAt || new Date();
          await payment.save();
          await activateSubscription(subscriptionEntity, payment);
          await createNotificationEvent({
            userId: String(payment.user),
            title: "Your subscription is active",
            message: `Your ${payment.plan?.name || "BuddyForStudy"} plan is now active. Your subscription payment has been confirmed.`,
            type: "billing",
            link: "/billing",
            eventKey: `subscription-activated:${subscriptionEntity.id}`,
            emailSubject: "Your BuddyForStudy subscription is active",
            metadata: { paymentId: String(payment._id), subscriptionId: String(subscriptionEntity.id), planId: String(payment.plan?._id || payment.plan || ""), planName: payment.plan?.name || "BuddyForStudy" },
            templateKeys: { notification: "subscription-activated-in-app", email: "subscription-activated-email" }
          });
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
      const failedPayment = await Payment.findOneAndUpdate(
        { provider: "razorpay", providerOrderId: orderId, status: { $ne: "paid" } },
        { $set: { status: "failed", providerPaymentId: paymentEntity?.id || "" } },
        { new: true }
      );
      if (failedPayment) {
        await createNotificationEvent({
          userId: String(failedPayment.user),
          title: "Payment was not completed",
          message: "Your payment was not completed. You can review your billing details and try again when ready.",
          type: "billing",
          link: "/billing",
          eventKey: `payment-failed:${failedPayment._id}:${paymentEntity?.id || "attempt"}`,
          emailSubject: "BuddyForStudy payment update",
          metadata: { paymentId: String(failedPayment._id) },
          templateKeys: { notification: "payment-failed-in-app", email: "payment-failed-email" }
        });
      }
    }

    return success(res, { received: true });
  } catch (e) {
    if (claimedEventId) await WebhookEvent.deleteOne({ eventId: claimedEventId }).catch(() => {});
    next(e);
  }
}
