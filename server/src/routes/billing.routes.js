import { Router } from "express";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { RefundRequest } from "../models/RefundRequest.js";
import { Payment } from "../models/Payment.js";
import { authMiddleware } from "../middleware/auth.js";
import { success, failure } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

const router = Router();
router.get("/plans", async (_req,res,next)=>{ try { return success(res,{plans:await SubscriptionPlan.find({isActive:true}).sort({sortOrder:1,createdAt:1}).lean()}); } catch(e){next(e)} });
router.use(authMiddleware);
router.get("/me", async (req,res,next)=>{ try { const { UserSubscription } = await import("../models/UserSubscription.js"); const subscription=await UserSubscription.findOne({user:req.user.userId}).populate("plan").lean(); return success(res,{subscription}); } catch(e){next(e)} });
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
