import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { User } from "../models/User.js";
import { AdminInvitation } from "../models/AdminInvitation.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { env } from "../config/env.js";
import { failure, success } from "../utils/response.js";
import { isAdminRoleProfile } from "../utils/adminRbac.js";
import { isValidObjectId } from "../utils/ids.js";

const invitationTtlMs = 24 * 60 * 60 * 1000;
const inviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  adminRole: z.enum(["super_admin", "platform_admin", "ai_content_manager", "finance_manager", "support_manager", "analyst_auditor"]),
  reason: z.string().trim().max(500).optional().default("")
});
const acceptSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254),
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128)
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createMailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    const error = new Error("Email delivery is not configured on the server.");
    error.status = 503;
    throw error;
  }
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass }
  });
}

export async function listInvitations(_req, res, next) {
  try {
    const invitations = await AdminInvitation.find({ acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select("-tokenHash")
      .populate("invitedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();
    return success(res, { invitations });
  } catch (error) {
    return next(error);
  }
}

export async function createInvitation(req, res, next) {
  try {
    const input = inviteSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (!isAdminRoleProfile(input.adminRole)) return failure(res, "Invalid administrator role.", 400);
    if (input.adminRole === "super_admin" && req.user?.adminRole !== "super_admin") {
      return failure(res, "Only a Super Admin can invite another Super Admin.", 403);
    }
    const existingUser = await User.findOne({ email }).select("_id role");
    if (existingUser) return failure(res, "This email already belongs to an account. Use the existing administrator role assignment workflow if appropriate.", 409);

    const now = new Date();
    const token = crypto.randomBytes(32).toString("base64url");
    const invitation = await AdminInvitation.create({
      email,
      name: input.name,
      adminRole: input.adminRole,
      tokenHash: hashToken(token),
      invitedBy: req.user.userId,
      expiresAt: new Date(now.getTime() + invitationTtlMs)
    });

    const inviteUrl = new URL("/accept-admin-invitation", env.clientUrl);
    // Keep the bearer token in the URL fragment so it is not sent in HTTP requests or referrer headers.
    inviteUrl.hash = new URLSearchParams({ email, token }).toString();
    const roleLabel = ({
      super_admin: "Super Admin",
      platform_admin: "Platform Administrator",
      ai_content_manager: "AI & Learning Content Manager",
      finance_manager: "Finance & Subscription Manager",
      support_manager: "Support Manager",
      analyst_auditor: "Analyst & Auditor"
    })[input.adminRole];
    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#0f172a">',
      '<h2 style="margin:0 0 12px">BuddyForStudy administrator invitation</h2>',
      '<p>Hello ' + escapeHtml(input.name) + ',</p>',
      '<p>You have been invited to join BuddyForStudy as <strong>' + escapeHtml(roleLabel) + '</strong>.</p>',
      '<p>Use the secure invitation link below to set your password and activate your administrator account. This link expires in 24 hours and can only be used once.</p>',
      '<p style="margin:28px 0"><a href="' + escapeHtml(inviteUrl.toString()) + '" style="background:#4f46e5;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Accept invitation</a></p>',
      '<p style="color:#64748b;font-size:13px">If you were not expecting this invitation, you can ignore this email.</p>',
      '</div>'
    ].join("");

    try {
      await createMailer().sendMail({
        from: env.mailFrom,
        to: email,
        subject: "Your BuddyForStudy administrator invitation",
        html
      });
    } catch (error) {
      await invitation.deleteOne();
      const deliveryError = new Error(error.status === 503 ? error.message : "Unable to send the administrator invitation email.");
      deliveryError.status = error.status || 503;
      throw deliveryError;
    }

    // Do not revoke a previous working invitation until the replacement email
    // has been accepted by the mail transport. A failed send must not lock out
    // the invitee by invalidating the only usable invitation.
    let previousInvitationsRevoked = true;
    try {
      await AdminInvitation.updateMany(
        { email, _id: { $ne: invitation._id }, acceptedAt: null, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    } catch (error) {
      previousInvitationsRevoked = false;
      console.error("[admin-invitations] replacement invitation sent but previous invitations could not be revoked", {
        message: String(error?.message || "Unknown error").slice(0, 200)
      });
    }

    const auditResult = await recordAuditEvent({
      actor: req.user.userId,
      action: "admin.invitation.created",
      targetType: "admin_invitation",
      targetId: invitation._id.toString(),
      reason: input.reason || "Administrator invitation created.",
      before: null,
      after: { email, adminRole: input.adminRole, expiresAt: invitation.expiresAt },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500)
    });
    return success(res, {
      invitation: {
        id: invitation._id.toString(),
        email: invitation.email,
        name: invitation.name,
        adminRole: invitation.adminRole,
        expiresAt: invitation.expiresAt
      },
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, !previousInvitationsRevoked
      ? "Administrator invitation sent, but previous pending invitations could not be revoked. Review the invitation list."
      : auditResult.recorded ? "Administrator invitation sent."
      : auditResult.queued ? "Administrator invitation sent; audit event queued for retry."
      : "Administrator invitation sent, but its audit event could not be recorded or queued. Notify a Super Admin.", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return next(error);
  }
}

export async function revokeInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    if (!isValidObjectId(invitationId)) return failure(res, "Invalid invitation ID.", 400);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) {
      return failure(res, "A reason between 10 and 500 characters is required to revoke an administrator invitation.", 400);
    }
    const revokedAt = new Date();
    // Make revocation mutually exclusive with acceptance: both operations
    // must atomically transition only a still-pending invitation.
    const invitation = await AdminInvitation.findOneAndUpdate(
      { _id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: revokedAt } },
      { $set: { revokedAt } },
      { new: true }
    );
    if (!invitation) return failure(res, "Pending invitation not found.", 404);
    const auditResult = await recordAuditEvent({
      actor: req.user.userId,
      action: "admin.invitation.revoked",
      targetType: "admin_invitation",
      targetId: invitation._id.toString(),
      reason,
      before: { email: invitation.email, adminRole: invitation.adminRole },
      after: { revokedAt: invitation.revokedAt },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500)
    });
    return success(res, {
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, auditResult.recorded ? "Administrator invitation revoked."
      : auditResult.queued ? "Administrator invitation revoked; audit event queued for retry."
      : "Administrator invitation revoked, but its audit event could not be recorded or queued. Notify a Super Admin.");
  } catch (error) {
    return next(error);
  }
}

export async function acceptInvitation(req, res, next) {
  try {
    const input = acceptSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const invitation = await AdminInvitation.findOne({
      email,
      tokenHash: hashToken(input.token),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).select("+tokenHash");
    if (!invitation) return failure(res, "This invitation is invalid, expired, or has already been used.", 400);
    if (input.name && input.name.trim().toLowerCase() !== invitation.name.toLowerCase()) {
      return failure(res, "The name does not match the invited administrator.", 400);
    }
    if (await User.exists({ email })) return failure(res, "An account already exists for this email. Contact a Super Admin.", 409);

    // Atomically claim the invitation so concurrent requests or a concurrent
    // revoke cannot activate the same invitation twice.
    const claimedAt = new Date();
    const claimedInvitation = await AdminInvitation.findOneAndUpdate(
      {
        _id: invitation._id,
        tokenHash: hashToken(input.token),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: claimedAt }
      },
      { $set: { acceptedAt: claimedAt } },
      { new: true }
    );
    if (!claimedInvitation) {
      return failure(res, "This invitation is invalid, expired, revoked, or has already been used.", 400);
    }

    let user;
    try {
      user = await User.create({
        name: claimedInvitation.name,
        email,
        password: await User.hashPassword(input.password),
        role: "admin",
        adminRole: claimedInvitation.adminRole,
        adminPermissionOverrides: [],
        isActive: true,
        emailVerified: true,
        authProvider: "local"
      });
    } catch (error) {
      // Release the claim only if account creation failed, allowing a safe retry.
      await AdminInvitation.updateOne(
        { _id: claimedInvitation._id, acceptedAt: claimedAt },
        { $set: { acceptedAt: null } }
      );
      throw error;
    }
    // Account creation and invitation consumption have already committed.
    // Persist the audit event directly or enqueue it for durable retry.
    const auditResult = await recordAuditEvent({
      actor: invitation.invitedBy,
      action: "admin.invitation.accepted",
      targetType: "user",
      targetId: user._id.toString(),
      reason: "Administrator invitation accepted and account activated.",
      before: { invitationId: claimedInvitation._id.toString(), email },
      after: { adminRole: user.adminRole, isActive: user.isActive },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500)
    });
    return success(res, {
      administrator: { id: user._id.toString(), name: user.name, email: user.email, adminRole: user.adminRole },
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued
    }, auditResult.recorded
      ? "Invitation accepted. You can now sign in through the standard login page."
      : auditResult.queued
        ? "Invitation accepted. The audit event is queued for retry."
        : "Invitation accepted and account activated, but the audit event could not be recorded or queued. Notify a Super Admin.", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return next(error);
  }
}
