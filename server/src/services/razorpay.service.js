import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { toRazorpayMinorUnits } from "../utils/razorpayAmounts.js";

export function assertPaymentsEnabled(config = env) {
  if (config.paymentsEnabled) return;
  const error = new Error("Payments are temporarily unavailable.");
  error.status = 503;
  error.isOperational = true;
  throw error;
}

function getClient({ config = env, RazorpayClient = Razorpay } = {}) {
  // Existing transaction reconciliation, refunds, and cancellation may still
  // need the provider client after new checkout has been disabled.
  const keyId = String(config.razorpayKeyId || "").trim();
  const keySecret = String(config.razorpayKeySecret || "").trim();

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured. Keep existing provider credentials available while transactions or subscriptions require reconciliation.");
    error.status = 503;
    throw error;
  }

  return new RazorpayClient({ key_id: keyId, key_secret: keySecret });
}

function getProviderErrorMessage(error) {
  const provider = error?.error || error?.response?.data?.error || error?.response?.data;
  return provider?.description
    || provider?.reason
    || error?.description
    || error?.message
    || (typeof error === "string" ? error : "")
    || "Unknown Razorpay provider error";
}

function wrapProviderError(operation, error) {
  if (error?.status === 503 && error?.message?.startsWith("Razorpay is not configured")) {
    throw error;
  }
  const wrapped = new Error(`Razorpay ${operation} failed: ${getProviderErrorMessage(error)}`);
  wrapped.status = Number(error?.statusCode || error?.status || error?.response?.status) >= 400
    ? Number(error?.statusCode || error?.status || error?.response?.status)
    : 502;
  wrapped.provider = error?.error || error?.response?.data?.error || null;
  throw wrapped;
}

export async function createOrder({ amount, currency, receipt, notes = {} }, dependencies = {}) {
  assertPaymentsEnabled(dependencies.config || env);
  const client = getClient(dependencies);
  return client.orders.create({
    amount: toRazorpayMinorUnits(amount, currency),
    currency,
    receipt,
    notes
  });
}

export async function createSubscriptionPlan({ name, amount, currency, interval, period }, dependencies = {}) {
  assertPaymentsEnabled(dependencies.config || env);
  const client = getClient(dependencies);
  try {
    return await client.plans.create({
      period,
      interval,
      item: {
        name,
        amount: toRazorpayMinorUnits(amount, currency),
        currency,
        description: name
      }
    });
  } catch (error) {
    wrapProviderError("plan creation", error);
  }
}

export async function createSubscription({ planId, customerNotify = 1, totalCount }, dependencies = {}) {
  assertPaymentsEnabled(dependencies.config || env);
  const client = getClient(dependencies);
  const payload = {
    plan_id: planId,
    customer_notify: customerNotify,
    quantity: 1
  };
  if (Number.isInteger(totalCount) && totalCount > 0) payload.total_count = totalCount;

  try {
    return await client.subscriptions.create(payload);
  } catch (error) {
    wrapProviderError("subscription creation", error);
  }
}

export async function fetchSubscription(subscriptionId, dependencies = {}) {
  const client = getClient(dependencies);
  try {
    return await client.subscriptions.fetch(subscriptionId);
  } catch (error) {
    wrapProviderError("subscription fetch", error);
  }
}

export async function fetchPayment(paymentId, dependencies = {}) {
  const client = getClient(dependencies);
  return client.payments.fetch(paymentId);
}

export async function fetchRefund({ refundId, paymentId }, dependencies = {}) {
  const client = getClient(dependencies);
  try {
    return await client.refunds.fetch(refundId, { payment_id: paymentId });
  } catch (error) {
    wrapProviderError("refund reconciliation", error);
  }
}

export async function refundPayment({ paymentId, amount, currency = "INR", notes }, dependencies = {}) {
  const client = getClient(dependencies);
  const payload = {};
  if (amount != null) payload.amount = toRazorpayMinorUnits(amount, currency);
  if (notes && typeof notes === "object" && !Array.isArray(notes)) payload.notes = notes;
  return client.payments.refund(paymentId, payload);
}

export async function cancelSubscription(subscriptionId, cancelAtCycleEnd = true, dependencies = {}) {
  const client = getClient(dependencies);
  return client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

export function getPublicKey() {
  if (!env.paymentsEnabled) {
    const error = new Error("Payments are temporarily unavailable.");
    error.status = 503;
    throw error;
  }
  if (!env.razorpayKeyId) {
    const error = new Error("Razorpay is not configured");
    error.status = 503;
    throw error;
  }
  return env.razorpayKeyId;
}

export function verifyPaymentSignature({ orderId, paymentId, signature, secret = env.razorpayKeySecret }) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(orderId + "|" + paymentId)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyWebhookSignature(rawBody, signature, webhookSecret = env.razorpayWebhookSecret) {
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
