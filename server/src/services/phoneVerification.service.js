import { env } from "../config/env.js";

function operationalError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.isOperational = true;
  return error;
}

function getTwilioConfig(config) {
  const accountSid = String(config.twilioAccountSid || "").trim();
  const authToken = String(config.twilioAuthToken || "").trim();
  const serviceSid = String(config.twilioVerifyServiceSid || "").trim();
  if (!accountSid || !authToken || !serviceSid) {
    throw operationalError("Phone verification is not configured. You can still save your number, but it will remain unverified.", 503);
  }
  if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid) || !/^VA[a-fA-F0-9]{32}$/.test(serviceSid)) {
    throw operationalError("Phone verification is temporarily unavailable. Please try again later.", 503);
  }
  return { accountSid, authToken, serviceSid };
}

async function twilioRequest(action, fields, { config = env, fetchImpl = globalThis.fetch } = {}) {
  const { accountSid, authToken, serviceSid } = getTwilioConfig(config);
  if (typeof fetchImpl !== "function") {
    throw operationalError("Phone verification is unavailable in this environment.", 503);
  }

  const url = "https://verify.twilio.com/v2/Services/" + serviceSid + "/" + action;
  const body = new URLSearchParams(fields);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      throw operationalError("The phone number or verification code could not be accepted. Check the details and try again.", 400);
    }
    if (response.status === 429) {
      throw operationalError("Too many verification attempts. Please wait before trying again.", 429);
    }
    throw operationalError("SMS delivery or verification is temporarily unavailable. Please try again later.", 503);
  }
  return response.json();
}

export async function sendPhoneVerification(phoneNumber, dependencies = {}) {
  if (!/^\+[1-9]\d{7,14}$/.test(String(phoneNumber || ""))) {
    throw operationalError("Enter a valid phone number in international format, for example +919876543210.", 400);
  }
  const result = await twilioRequest("Verifications", { To: phoneNumber, Channel: "sms" }, dependencies);
  return { status: result.status || "pending" };
}

export async function checkPhoneVerification(phoneNumber, code, dependencies = {}) {
  if (!/^\+[1-9]\d{7,14}$/.test(String(phoneNumber || ""))) {
    throw operationalError("A valid saved phone number is required before verification.", 400);
  }
  if (!/^\d{4,10}$/.test(String(code || ""))) {
    throw operationalError("Enter the verification code sent to your phone.", 400);
  }
  const result = await twilioRequest("VerificationCheck", { To: phoneNumber, Code: code }, dependencies);
  if (result.status !== "approved") {
    throw operationalError("The verification code is incorrect or has expired.", 400);
  }
  return { verified: true };
}
