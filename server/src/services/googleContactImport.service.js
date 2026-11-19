import { env } from "../config/env.js";

function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.isOperational = true;
  return error;
}

async function getGoogleJson(url, accessToken, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (response.status === 401 || response.status === 403) return { denied: true, data: null };
  if (!response.ok) {
    throw authError("Google profile information is temporarily unavailable. Please enter your details manually.", 503);
  }
  return { denied: false, data: await response.json() };
}

function firstValue(items, keys) {
  if (!Array.isArray(items)) return "";
  const entry = items.find((item) => item && keys.some((key) => typeof item[key] === "string" && item[key].trim()));
  if (!entry) return "";
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function importGoogleContactData(
  user,
  accessToken,
  { fetchImpl = globalThis.fetch } = {}
) {
  if (!user?._id || !user?.email || !user?.googleId) {
    throw authError("This account is not linked to a Google identity.", 403);
  }
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) {
    throw authError("A valid Google authorization token is required.", 400);
  }
  if (typeof fetchImpl !== "function") {
    throw authError("Google profile import is unavailable in this environment.", 503);
  }

  const identityResult = await getGoogleJson(
    "https://openidconnect.googleapis.com/v1/userinfo",
    accessToken,
    fetchImpl
  );
  const identity = identityResult.data;
  if (
    identityResult.denied ||
    identity?.email_verified !== true ||
    String(identity?.email || "").toLowerCase() !== String(user.email).toLowerCase() ||
    identity?.sub !== user.googleId
  ) {
    throw authError("The Google account does not match the Google account linked to this BuddyForStudy profile.", 403);
  }

  const peopleBase = "https://people.googleapis.com/v1/people/me?personFields=";
  const [phoneResult, addressResult] = await Promise.all([
    getGoogleJson(peopleBase + "phoneNumbers", accessToken, fetchImpl),
    getGoogleJson(peopleBase + "addresses", accessToken, fetchImpl)
  ]);

  const phoneNumber = phoneResult.denied
    ? ""
    : firstValue(phoneResult.data?.phoneNumbers, ["canonicalForm", "value"]);
  const googleAddress = addressResult.denied
    ? null
    : (Array.isArray(addressResult.data?.addresses) ? addressResult.data.addresses[0] : null);

  const address = {
    line1: String(googleAddress?.streetAddress || "").trim(),
    line2: String(googleAddress?.extendedAddress || "").trim(),
    city: String(googleAddress?.city || "").trim(),
    state: String(googleAddress?.region || "").trim(),
    postalCode: String(googleAddress?.postalCode || "").trim(),
    country: String(googleAddress?.country || "").trim(),
    formatted: String(googleAddress?.formattedValue || "").trim()
  };

  return {
    phoneNumber,
    address,
    city: address.city,
    availability: {
      phoneNumbers: !phoneResult.denied,
      addresses: !addressResult.denied
    },
    phoneNumberVerified: false
  };
}
