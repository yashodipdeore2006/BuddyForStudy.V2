import crypto from "crypto";
import { Payment } from "../models/Payment.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";
import { createNotificationEvent } from "../services/notification.service.js";
import { buildSubscriptionActivatedNotificationPayload } from "../services/billingNotificationPayloads.js";
import { CAPTURED_PAYMENT_SOURCE_STATUSES, FAILED_PAYMENT_SOURCE_STATUSES } from "../services/paymentWebhookTransitions.js";
import { getWebhookClaimDisposition, WEBHOOK_EVENT_LEASE_MS } from "../services/webhookEventClaims.js";
import { subscriptionEventTimestamp, subscriptionEventFreshnessFilter } from "../services/subscriptionWebhookTransitions.js";

function eventId(req) {
  const supplied = req.get("x-razorpay-event-id");
  if (supplied) return supplied;
  return crypto.createHash("sha256").update(req.rawBody || "").digest("hex");
}

async function claimEvent(req, event) {
  const id = eventId(req);
  const now = new Date();
  const claimToken = crypto.randomUUID();
  const leaseCutoff = new Date(now.getTime() - WEBHOOK_EVENT_LEASE_MS);
  const claim = {
    eventId: id,
    event: event.event,
    status: "processing",
    claimToken,
    claimedAt: now,
    processedAt: null
  };

  try {
    await WebhookEvent.create(claim);
    return { claimed: true, eventId: id, claimToken };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  let existing = await WebhookEvent.findOne({ eventId: id });
  let disposition = getWebhookClaimDisposition(existing, now);
  if (disposition === "duplicate") return { claimed: false, duplicate: true };
  if (disposition === "in_progress") return { claimed: false, inProgress: true };

  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      eventId: id,
      $or: [
        { status: "failed" },
        { status: "processing", claimedAt: { $lte: leaseCutoff } },
        { status: { $exists: false }, processedAt: null }
      ]
    },
    { $set: claim },
    { new: true }
  );
  if (reclaimed) return { claimed: true, eventId: id, claimToken };

  existing = await WebhookEvent.findOne({ eventId: id });
  disposition = getWebhookClaimDisposition(existing, new Date());
  if (disposition === "duplicate") return { claimed: false, duplicate: true };
  return { claimed: false, inProgress: true };
}

function periodDate(value) {
  return value ? new Date(Number(value) * 1000) : null;
}

async function activateSubscription(subscription, payment, eventAt = null) {
  const filter = {
    user: payment.user,
    ...subscriptionEventFreshnessFilter(eventAt)
  };
  const set = {
    plan: payment.plan,
    status: "active",
    provider: "razorpay",
    providerSubscriptionId: subscription.id,
    currentPeriodStart: periodDate(subscription.current_start) || new Date(),
    currentPeriodEnd: periodDate(subscription.current_end),
    cancelAtPeriodEnd: Boolean(subscription.end_at),
    ...(eventAt ? { providerEventAt: eventAt } : {})
  };
  try {
    return await UserSubscription.findOneAndUpdate(
      filter,
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // An older event can fail an upsert against the unique user index when a
    // newer subscription record already exists. Treat that as a stale event.
    if (eventAt && error?.code === 11000) return null;
    throw error;
  }
}

async function recordSubscriptionCharge(subscription, paymentEntity, eventAt = null) {
  if (!subscription?.id) return;

  const providerPaymentId = paymentEntity?.id || "";
  if (providerPaymentId) {
    const duplicate = await Payment.findOne({ provider: "razorpay", providerPaymentId });
    if (duplicate) {
      // A provider payment ID is globally unique. Never bind a duplicate charge
      // to a different subscription merely because a webhook references it.
      if (String(duplicate.providerOrderId || "") !== String(subscription.id)) {
        console.error("[billing-webhook] duplicate provider payment references a different subscription", {
          providerPaymentId,
          paymentId: String(duplicate._id)
        });
        return;
      }
      await activateSubscription(subscription, duplicate, eventAt);
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

  await activateSubscription(subscription, payment, eventAt);
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
  let claimToken = "";
  try {
    const signature = req.get("x-razorpay-signature");
    if (!req.rawBody || !razorpay.verifyWebhookSignature(req.rawBody, signature, env.razorpayWebhookSecret)) {
      return failure(res, "Invalid webhook signature", 400);
    }

    const event = req.body;
    const claim = await claimEvent(req, event);
    if (!claim.claimed) {
      if (claim.inProgress) return failure(res, "Webhook event is already being processed", 503);
      return success(res, { received: true, duplicate: true });
    }
    claimedEventId = claim.eventId;
    claimToken = claim.claimToken;

    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    const subscriptionEventAt = subscriptionEventTimestamp(event);
    const orderId = paymentEntity?.order_id || orderEntity?.id;

    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (orderId) {
        await Payment.findOneAndUpdate(
          {
            provider: "razorpay",
            providerOrderId: orderId,
            status: { $in: CAPTURED_PAYMENT_SOURCE_STATUSES },
            course: { $ne: null }
          },
          {
            $set: {
              status: "paid",
              providerPaymentId: paymentEntity?.id || "",
              paidAt: new Date(),
              purchaseNotificationStatus: "pending",
              purchaseNotificationLastCheckedAt: null
            }
          },
          { new: true }
        );
      }
    } else if (event.event === "subscription.activated" || event.event === "subscription.resumed") {
      if (subscriptionEntity?.id) {
        const payment = await Payment.findOne({
          provider: "razorpay",
          providerOrderId: subscriptionEntity.id
        }).sort({ createdAt: -1 }).populate("plan", "name billingInterval");

        if (payment) {
          payment.status = "paid";
          payment.subscriptionNotificationStatus = "pending";
          payment.subscriptionNotificationLastCheckedAt = null;
          payment.paidAt = payment.paidAt || new Date();
          await payment.save();
          const appliedSubscriptionEvent = await activateSubscription(subscriptionEntity, payment, subscriptionEventAt);
          const notification = appliedSubscriptionEvent ? await createNotificationEvent(buildSubscriptionActivatedNotificationPayload({
            userId: String(payment.user),
            payment,
            plan: payment.plan,
            subscription: subscriptionEntity,
            subscriptionId: String(subscriptionEntity.id)
          })) : null;
          if (notification) {
            await Payment.updateOne(
              { _id: payment._id, subscriptionNotificationStatus: "pending" },
              { $set: {
                subscriptionNotificationStatus: "queued",
                subscriptionNotificationQueuedAt: new Date(),
                subscriptionNotificationLastCheckedAt: new Date()
              } }
            );
          }
        }
      }
    } else if (event.event === "subscription.charged") {
      await recordSubscriptionCharge(subscriptionEntity, paymentEntity, subscriptionEventAt);
    } else if (event.event === "subscription.pending" || event.event === "subscription.halted") {
      if (subscriptionEntity?.id) {
        const subscription = await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id, ...subscriptionEventFreshnessFilter(subscriptionEventAt) },
          { $set: { status: "past_due", ...(subscriptionEventAt ? { providerEventAt: subscriptionEventAt } : {}) } },
          { new: true }
        ).populate("plan", "name");
        if (subscription) {
          await createNotificationEvent({
            userId: String(subscription.user),
            title: "Subscription payment needs attention",
            message: "Your subscription payment needs attention. Open billing to review the status and next steps.",
            type: "billing",
            link: "/billing",
            eventKey: `subscription-payment-action:${subscriptionEntity.id}:${event.event}`,
            emailSubject: "Action needed for your BuddyForStudy subscription",
            metadata: { subscriptionId: String(subscriptionEntity.id), planName: subscription.plan?.name || "BuddyForStudy", status: event.event },
            templateKeys: { notification: "subscription-payment-action-in-app", email: "subscription-payment-action-email" }
          });
        }
      }
    } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
      if (subscriptionEntity?.id) {
        const subscription = await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id, ...subscriptionEventFreshnessFilter(subscriptionEventAt) },
          {
            $set: {
              ...(subscriptionEventAt ? { providerEventAt: subscriptionEventAt } : {}),
              status: event.event === "subscription.completed" ? "expired" : "cancelled",
              cancelAtPeriodEnd: false,
              cancelledAt: new Date(),
              currentPeriodEnd: periodDate(subscriptionEntity.current_end) || undefined
            }
          },
          { new: true }
        ).populate("plan", "name");
        if (subscription) {
          const completed = event.event === "subscription.completed";
          await createNotificationEvent({
            userId: String(subscription.user),
            title: completed ? "Your subscription period has ended" : "Your subscription was cancelled",
            message: completed
              ? "Your paid subscription period has ended. Review plans if you'd like to renew access."
              : "Your subscription has been cancelled. Check billing for the latest subscription status.",
            type: "billing",
            link: "/billing",
            eventKey: `subscription-ended:${subscriptionEntity.id}:${event.event}`,
            emailSubject: completed ? "Your BuddyForStudy subscription period ended" : "Your BuddyForStudy subscription was cancelled",
            metadata: { subscriptionId: String(subscriptionEntity.id), planName: subscription.plan?.name || "BuddyForStudy", status: subscription.status },
            templateKeys: { notification: "subscription-ended-in-app", email: "subscription-ended-email" }
          });
        }
      }
    } else if (event.event === "payment.failed" && orderId) {
      const failedPayment = await Payment.findOneAndUpdate(
        { provider: "razorpay", providerOrderId: orderId, status: { $in: FAILED_PAYMENT_SOURCE_STATUSES } },
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

    if (claimedEventId) {
      const finalized = await WebhookEvent.updateOne(
        { eventId: claimedEventId, claimToken, status: "processing" },
        { $set: { status: "processed", processedAt: new Date() }, $unset: { claimToken: "", claimedAt: "" } }
      );
      if (!finalized.modifiedCount) {
        console.error("[billing-webhook] event claim changed before finalization", { eventId: claimedEventId });
      }
    }
    return success(res, { received: true });
  } catch (e) {
    if (claimedEventId && claimToken) {
      await WebhookEvent.updateOne(
        { eventId: claimedEventId, claimToken, status: "processing" },
        { $set: { status: "failed" }, $unset: { claimToken: "", claimedAt: "" } }
      ).catch(() => {});
    }
    next(e);
  }
}
