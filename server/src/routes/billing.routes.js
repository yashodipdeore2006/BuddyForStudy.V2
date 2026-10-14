import { Router } from "express";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { Payment } from "../models/Payment.js";
import { authMiddleware } from "../middleware/auth.js";
import { success, failure } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import * as razorpay from "../services/razorpay.service.js";
import { normalizeSubscriptionFeatures } from "../config/subscriptionFeatures.js";
import { createNotificationEvent } from "../services/notification.service.js";

const router = Router();
router.get("/plans", async (_req,res,next)=>{ try {
  const plans = await SubscriptionPlan.find({isActive:true}).sort({sortOrder:1,createdAt:1}).lean();
  return success(res,{plans:plans.map((plan)=>({...plan,features:normalizeSubscriptionFeatures(plan.features)}))});
} catch(e){next(e)} });
router.use(authMiddleware);
router.get("/payments", async (req,res,next)=>{ try { const payments=await Payment.find({user:req.user.userId}).populate("course","title").populate("plan","name billingInterval").sort({createdAt:-1}).lean(); return success(res,{payments}); } catch(e){next(e)} });
router.get("/me", async (req,res,next)=>{ try { const { UserSubscription } = await import("../models/UserSubscription.js"); const subscription=await UserSubscription.findOne({user:req.user.userId}).populate("plan").lean(); return success(res,{subscription}); } catch(e){next(e)} });

router.post("/subscription/sync", async (req,res,next)=>{ try {
  const subscriptionId = String(req.body?.subscriptionId || "").trim();
  if (!subscriptionId) return failure(res, "subscriptionId is required", 400);

  const payment = await Payment.findOne({
    user: req.user.userId,
    provider: "razorpay",
    providerOrderId: subscriptionId,
    status: "pending"
  }).populate("plan");

  if (!payment) return failure(res, "Pending subscription payment not found", 404);
  if (!payment.plan?.providerPlanId) return failure(res, "Subscription plan is not linked to Razorpay", 409);

  const providerSubscription = await razorpay.fetchSubscription(subscriptionId);

  if (String(providerSubscription?.plan_id || "") !== String(payment.plan.providerPlanId)) {
    return failure(res, "Subscription plan mismatch", 409);
  }

  const status = String(providerSubscription?.status || "").toLowerCase();
  if (status !== "active") {
    return success(res, {
      activated: false,
      status,
      subscription: providerSubscription
    }, "Subscription is not active yet");
  }

  const start = providerSubscription?.current_start
    ? new Date(Number(providerSubscription.current_start) * 1000)
    : new Date();
  const end = providerSubscription?.current_end
    ? new Date(Number(providerSubscription.current_end) * 1000)
    : null;

  payment.status = "paid";
  payment.paidAt = payment.paidAt || new Date();
  payment.metadata = {
    ...Object.fromEntries(payment.metadata || []),
    checkoutType: "subscription",
    subscriptionId,
    reconciled: "true"
  };
  await payment.save();

  const { UserSubscription } = await import("../models/UserSubscription.js");
  const subscription = await UserSubscription.findOneAndUpdate(
    { user: req.user.userId },
    {
      $set: {
        plan: payment.plan._id,
        status: "active",
        provider: "razorpay",
        providerSubscriptionId: subscriptionId,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: Boolean(providerSubscription?.end_at)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("plan");

  await createNotificationEvent({
    userId: String(req.user.userId),
    title: "Your subscription is active",
    message: `Your ${payment.plan.name || "BuddyForStudy"} plan is now active. Your subscription payment has been confirmed.`,
    type: "billing",
    link: "/billing",
    eventKey: `subscription-activated:${subscriptionId}`,
    emailSubject: "Your BuddyForStudy subscription is active",
    metadata: { paymentId: String(payment._id), subscriptionId, planId: String(payment.plan._id), planName: payment.plan.name },
    templateKeys: { notification: "subscription-activated-in-app", email: "subscription-activated-email" }
  });

  return success(res, {
    activated: true,
    subscription
  }, "Subscription activated");
} catch(e){next(e)} });
router.post("/subscription/cancel", async (req,res,next)=>{ try {
  const { UserSubscription } = await import("../models/UserSubscription.js");
  const subscription=await UserSubscription.findOne({user:req.user.userId,provider:"razorpay",status:{$in:["trialing","active","past_due"]}});
  if(!subscription?.providerSubscriptionId) return failure(res,"No active Razorpay subscription found",404);
  if(subscription.cancelAtPeriodEnd) return success(res,{subscription},"Subscription is already scheduled for cancellation");
  const providerSubscription=await razorpay.cancelSubscription(subscription.providerSubscriptionId,true);
  subscription.cancelAtPeriodEnd=true;
  subscription.currentPeriodEnd=providerSubscription?.end_at ? new Date(Number(providerSubscription.end_at)*1000) : subscription.currentPeriodEnd;
  await subscription.save();
  await createNotificationEvent({
    userId: String(req.user.userId),
    title: "Subscription cancellation scheduled",
    message: `Your subscription will remain active until ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-IN") : "the end of the current billing period"}.`,
    type: "billing",
    link: "/billing",
    eventKey: `subscription-cancel-scheduled:${subscription._id}`,
    emailSubject: "Your BuddyForStudy subscription cancellation is scheduled",
    metadata: { subscriptionId: String(subscription._id), currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : "" }
  });
  return success(res,{subscription},"Subscription cancellation scheduled");
} catch(e){next(e)} });
router.post("/refunds", async (req,res,next)=>{ try {
  if(!isValidObjectId(req.body.paymentId)) return failure(res,"Invalid paymentId",400);
  const payment=await Payment.findOne({_id:req.body.paymentId,user:req.user.userId,status:{$in:["paid","partially_refunded"]}});
  if(!payment) return failure(res,"Paid payment not found",404);
  const existing=await RefundRequest.findOne({payment:payment._id,status:{ $in:["pending","approved","processed"] }});
  if(existing) return failure(res,"A refund request already exists for this payment",409);
  const amount=Math.min(Math.max(Number(req.body.amount)||payment.amount,0),payment.amount);
  const refund=await RefundRequest.create({user:req.user.userId,payment:payment._id,amount,reason:String(req.body.reason||"").trim()});
  await createNotificationEvent({
    userId: String(req.user.userId),
    title: "Refund request received",
    message: `We've received your refund request for ${payment.currency || "INR"} ${amount}. We'll review it and update you when the status changes.`,
    type: "billing",
    link: "/billing",
    eventKey: `refund-requested:${refund._id}`,
    emailSubject: "Your BuddyForStudy refund request was received",
    metadata: { refundId: String(refund._id), paymentId: String(payment._id), amount: String(amount), currency: payment.currency || "INR" },
    templateKeys: { notification: "refund-requested-in-app", email: "refund-requested-email" }
  });
  return success(res,{refund},"Refund request submitted",201);
} catch(e){next(e)} });
export default router;
