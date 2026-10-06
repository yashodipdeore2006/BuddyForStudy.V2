import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";

function getClient() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error("Razorpay is not configured");
    error.status = 503;
    throw error;
  }
  return new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
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

export function getPublicKey() {
  if (!env.razorpayKeyId) {
    const error = new Error("Razorpay is not configured");
    error.status = 503;
    throw error;
  }
  return env.razorpayKeyId;
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", env.razorpayKeySecret)
    .update(orderId + "|" + paymentId)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
