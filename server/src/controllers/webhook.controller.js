import crypto from "crypto";
import { Payment } from "../models/Payment.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import * as razorpay from "../services/razorpay.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";
import { createNotificationEvent, notifyActiveAdmins } from "../services/notification.service.js";
import { buildSubscriptionActivatedNotificationPayload } from "../services/billingNotificationPayloads.js";
import { CAPTURED_PAYMENT_SOURCE_STATUSES, FAILED_PAYMENT_SOURCE_STATUSES, buildCapturedPaymentUpdate, buildFailedPaymentUpdate } from "../services/paymentWebhookTransitions.js";
import { getWebhookClaimDisposition, WEBHOOK_EVENT_LEASE_MS } from "../services/webhookEventClaims.js";
import { subscriptionEventTimestamp, subscriptionEventFreshnessFilter, SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES, TERMINAL_PAYMENT_STATUSES } from "../services/subscriptionWebhookTransitions.js";

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
    providerOrderId: String(event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || event?.payload?.subscription?.entity?.id || "").slice(0, 200),
    providerPaymentId: String(event?.payload?.payment?.entity?.id || "").slice(0, 200),
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

async function activateSubscription(subscription, payment, eventAt = null, providerEventId = "", providerEventName = "") {
  const filter = {
    user: payment.user,
    ...subscriptionEventFreshnessFilter(eventAt, providerEventId, providerEventName)
  };
  const set = {
    plan: payment.plan,
    status: "active",
    provider: "razorpay",
    providerSubscriptionId: subscription.id,
    currentPeriodStart: periodDate(subscription.current_start) || new Date(),
    currentPeriodEnd: periodDate(subscription.current_end),
    cancelAtPeriodEnd: Boolean(subscription.end_at),
    ...(eventAt ? { providerEventAt: eventAt, providerEventId, providerEventName } : {})
  };
  try {
    const updated = await UserSubscription.findOneAndUpdate(
      filter,
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (updated || !eventAt) return updated;

    // A retry of the exact event must be able to recover post-transition work
    // (for example, activation notification delivery) without reopening state
    // to a different event with the same second-level timestamp.
    const alreadyApplied = await UserSubscription.findOne({
      user: payment.user,
      provider: "razorpay",
      providerSubscriptionId: subscription.id,
      status: "active",
      providerEventAt: eventAt,
      providerEventId,
      providerEventName
    }).select("+providerEventAt +providerEventId +providerEventName");
    return alreadyApplied || null;
  } catch (error) {
    // A concurrent delivery may have won the unique-user upsert. Recover
    // post-transition work only if the exact event's active state was applied.
    if (error?.code === 11000 && eventAt) {
      return await UserSubscription.findOne({
        user: payment.user,
        provider: "razorpay",
        providerSubscriptionId: subscription.id,
        status: "active",
        providerEventAt: eventAt,
        providerEventId,
        providerEventName
      }).select("+providerEventAt +providerEventId +providerEventName");
    }
    if (error?.code === 11000) return null;
    throw error;
  }
}


async function markTrialConversionIfPresent(payment, subscriptionId) {
  const grantId = payment?.metadata?.get
    ? payment.metadata.get("trialConversionGrantId")
    : payment?.metadata?.trialConversionGrantId;
  if (!grantId) return;
  await TrialGrant.updateOne(
    { _id: grantId, user: payment.user, status: "trialing", conversionConsentStatus: "pending_user_consent" },
    { $set: { status: "converted", conversionConsentStatus: "authorized", providerSubscriptionId: subscriptionId } }
  );
}

async function notifySubscriptionCharge(payment, subscriptionId, providerPaymentId) {
  const isRenewal = payment?.metadata?.get
    ? payment.metadata.get("renewal") === "true"
    : payment?.metadata?.renewal === "true";
  if (!isRenewal || !providerPaymentId) return;
  await createNotificationEvent({
    userId: String(payment.user),
    title: "Subscription payment received",
    message: "Your subscription renewal payment of " + (payment.currency || "INR") + " " + payment.amount + " was received successfully.",
    type: "billing",
    link: "/billing",
    eventKey: "subscription-charge:" + providerPaymentId,
    emailSubject: "Your BuddyForStudy subscription payment receipt",
    metadata: { paymentId: String(payment._id), subscriptionId: String(subscriptionId), providerPaymentId, amount: String(payment.amount), currency: payment.currency || "INR" },
    templateKeys: { notification: "subscription-payment-in-app", email: "subscription-payment-email" }
  });
}

async function recordSubscriptionCharge(subscription, paymentEntity, eventAt = null, providerEventId = "", providerEventName = "") {
  if (!subscription?.id) return;

  const providerPaymentId = paymentEntity?.id || "";
  // Without a stable provider identifier, concurrent deliveries cannot be
  // deduplicated safely. Do not create an untraceable renewal payment.
  if (!providerPaymentId) {
    console.error("[billing-webhook] subscription charge missing provider payment ID", {
      subscriptionId: String(subscription.id)
    });
    return;
  }

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
    if (TERMINAL_PAYMENT_STATUSES.includes(duplicate.status)) {
      console.warn("[billing-webhook] ignoring charge replay for a terminal payment", {
        providerPaymentId,
        paymentId: String(duplicate._id),
        status: duplicate.status
      });
      return;
    }
    const activated = await activateSubscription(subscription, duplicate, eventAt, providerEventId, providerEventName);
    if (activated) await markTrialConversionIfPresent(duplicate, subscription.id);
    // Recover a receipt if an earlier delivery saved the payment but failed before notifying.
    await notifySubscriptionCharge(duplicate, subscription.id, providerPaymentId);
    return;
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

    try {
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
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // A concurrent delivery may have inserted the same provider payment.
      // Re-read it and continue only if it belongs to this subscription.
      payment = await Payment.findOne({ provider: "razorpay", providerPaymentId });
      if (!payment || String(payment.providerOrderId || "") !== String(subscription.id)) {
        console.error("[billing-webhook] concurrent charge insert conflicted with another subscription", {
          providerPaymentId,
          subscriptionId: String(subscription.id)
        });
        return;
      }
    }
  }

  const activated = await activateSubscription(subscription, payment, eventAt, providerEventId, providerEventName);
  if (activated) await markTrialConversionIfPresent(payment, subscription.id);
  await notifySubscriptionCharge(payment, subscription.id, providerPaymentId);
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
    const subscriptionEventId = claimedEventId;
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
            $set: buildCapturedPaymentUpdate(paymentEntity)
          },
          { new: true }
        );
      }
    } else if (event.event === "subscription.activated" || event.event === "subscription.resumed") {
      if (subscriptionEntity?.id) {
        const payment = await Payment.findOne({
          provider: "razorpay",
          providerOrderId: subscriptionEntity.id,
          status: { $in: SUBSCRIPTION_ACTIVATION_PAYMENT_STATUSES }
        }).sort({ createdAt: -1 }).populate("plan", "name billingInterval");

        if (payment) {
          // Apply the ordered subscription transition first. A stale activation
          // must not mutate payment status or enqueue activation messaging.
          const appliedSubscriptionEvent = await activateSubscription(subscriptionEntity, payment, subscriptionEventAt, subscriptionEventId, event.event);
          if (appliedSubscriptionEvent) {
            await markTrialConversionIfPresent(payment, subscriptionEntity.id);
            payment.status = "paid";
            payment.paidAt = payment.paidAt || new Date();
            payment.subscriptionNotificationStatus = "pending";
            payment.subscriptionNotificationLastCheckedAt = null;
            await payment.save();
          }
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
      await recordSubscriptionCharge(subscriptionEntity, paymentEntity, subscriptionEventAt, subscriptionEventId, event.event);
    } else if (event.event === "subscription.pending" || event.event === "subscription.halted") {
      if (subscriptionEntity?.id) {
        const subscription = await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id, ...subscriptionEventFreshnessFilter(subscriptionEventAt, subscriptionEventId, event.event) },
          { $set: { status: "past_due", ...(subscriptionEventAt ? { providerEventAt: subscriptionEventAt, providerEventId: subscriptionEventId, providerEventName: event.event } : {}) } },
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
          await notifyActiveAdmins({
            title: "Subscription requires billing attention",
            message: `A subscription entered ${event.event === "subscription.halted" ? "halted" : "pending"} status. Review the subscription and payment records.`,
            type: "billing",
            link: "/admin/billing",
            eventKey: `subscription-billing-attention:${subscriptionEntity.id}:${event.event}:${claimedEventId}`,
            emailSubject: "BuddyForStudy: subscription billing attention required",
            metadata: { subscriptionId: String(subscriptionEntity.id), status: event.event, planName: subscription.plan?.name || "BuddyForStudy" }
          }).catch((alertError) => console.error("[notifications] admin subscription alert failed", {
            subscriptionId: String(subscriptionEntity.id), message: String(alertError?.message || "Unknown error").slice(0, 200)
          }));
        }
      }
    } else if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
      if (subscriptionEntity?.id) {
        const subscription = await UserSubscription.findOneAndUpdate(
          { provider: "razorpay", providerSubscriptionId: subscriptionEntity.id, ...subscriptionEventFreshnessFilter(subscriptionEventAt, subscriptionEventId, event.event) },
          {
            $set: {
              ...(subscriptionEventAt ? { providerEventAt: subscriptionEventAt, providerEventId: subscriptionEventId, providerEventName: event.event } : {}),
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
        { $set: buildFailedPaymentUpdate(paymentEntity) },
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
        await notifyActiveAdmins({
          title: "Payment failed",
          message: `A payment attempt failed for payment record ${String(failedPayment._id)}. Review the billing record if follow-up is required.`,
          type: "billing",
          link: "/admin/billing",
          eventKey: `payment-failed:${failedPayment._id}:${paymentEntity?.id || "attempt"}`,
          emailSubject: "BuddyForStudy: payment failure",
          metadata: { paymentId: String(failedPayment._id), learnerId: String(failedPayment.user), providerPaymentId: String(paymentEntity?.id || "") }
        }).catch((alertError) => console.error("[notifications] admin payment failure alert failed", {
          paymentId: String(failedPayment._id), message: String(alertError?.message || "Unknown error").slice(0, 200)
        }));
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
