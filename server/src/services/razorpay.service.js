import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";

function getClient() {
  const keyId = String(env.razorpayKeyId || "").trim();
  const keySecret = String(env.razorpayKeySecret || "").trim();

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env.");
    error.status = 503;
    throw error;
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
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

export async function createOrder({ amount, currency, receipt, notes = {} }) {
  const client = getClient();
  return client.orders.create({
    amount: Math.round(amount * 100),
    currency,
    receipt,
    notes
  });
}

export async function createSubscriptionPlan({ name, amount, currency, interval, period }) {
  const client = getClient();
  try {
    return await client.plans.create({
      period,
      interval,
      item: {
        name,
        amount: Math.round(amount * 100),
        currency,
        description: name
      }
    });
  } catch (error) {
    wrapProviderError("plan creation", error);
  }
}

export async function createSubscription({ planId, customerNotify = 1, totalCount }) {
  const client = getClient();
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

export async function fetchSubscription(subscriptionId) {
  const client = getClient();
  try {
    return await client.subscriptions.fetch(subscriptionId);
  } catch (error) {
    wrapProviderError("subscription fetch", error);
  }
}

export async function fetchPayment(paymentId) {
  const client = getClient();
  return client.payments.fetch(paymentId);
}

export async function refundPayment({ paymentId, amount }) {
  const client = getClient();
  const payload = {};
  if (amount != null) payload.amount = Math.round(amount * 100);
  return client.payments.refund(paymentId, payload);
}

export async function cancelSubscription(subscriptionId, cancelAtCycleEnd = true) {
  const client = getClient();
  return client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

export function getPublicKey() {
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
