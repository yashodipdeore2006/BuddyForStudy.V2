import { Router } from "express";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { Payment } from "../models/Payment.js";
import { authMiddleware } from "../middleware/auth.js";
import { success, failure } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import * as razorpay from "../services/razorpay.service.js";
import { normalizeSubscriptionFeatures } from "../config/subscriptionFeatures.js";

const router = Router();
router.get("/plans", async (_req,res,next)=>{ try {
  const plans = await SubscriptionPlan.find({isActive:true}).sort({sortOrder:1,createdAt:1}).lean();
  return success(res,{plans:plans.map((plan)=>({...plan,features:normalizeSubscriptionFeatures(plan.features)}))});
} catch(e){next(e)} });
router.use(authMiddleware);
router.get("/payments", async (req,res,next)=>{ try { const payments=await Payment.find({user:req.user.userId}).populate("course","title").populate("plan","name billingInterval").sort({createdAt:-1}).lean(); return success(res,{payments}); } catch(e){next(e)} });
router.get("/me", async (req,res,next)=>{ try { const { UserSubscription } = await import("../models/UserSubscription.js"); const subscription=await UserSubscription.findOne({user:req.user.userId}).populate("plan").lean(); return success(res,{subscription}); } catch(e){next(e)} });
router.post("/subscription/cancel", async (req,res,next)=>{ try {
  const { UserSubscription } = await import("../models/UserSubscription.js");
  const subscription=await UserSubscription.findOne({user:req.user.userId,provider:"razorpay",status:{$in:["trialing","active","past_due"]}});
  if(!subscription?.providerSubscriptionId) return failure(res,"No active Razorpay subscription found",404);
  if(subscription.cancelAtPeriodEnd) return success(res,{subscription},"Subscription is already scheduled for cancellation");
  const providerSubscription=await razorpay.cancelSubscription(subscription.providerSubscriptionId,true);
  subscription.cancelAtPeriodEnd=true;
  subscription.currentPeriodEnd=providerSubscription?.end_at ? new Date(Number(providerSubscription.end_at)*1000) : subscription.currentPeriodEnd;
  await subscription.save();
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
  return success(res,{refund},"Refund request submitted",201);
} catch(e){next(e)} });
export default router;
