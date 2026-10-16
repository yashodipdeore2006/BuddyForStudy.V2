function normalizeEmailAddress(value) {
  const address = typeof value === "string"
    ? value
    : value && typeof value.address === "string"
      ? value.address
      : "";
  return address.trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * A resolved Nodemailer sendMail call is not enough by itself: transports can
 * report rejected recipients without throwing when a message has multiple
 * recipients. Require explicit acceptance of this notification's recipient.
 */
export function mailRecipientAccepted(info, recipient) {
  const expected = normalizeEmailAddress(recipient);
  if (!expected) return false;

  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
  if (rejected.some((address) => normalizeEmailAddress(address) === expected)) return false;
  return accepted.some((address) => normalizeEmailAddress(address) === expected);
}

/**
 * OneSignal can respond with HTTP 200 while creating no notification. Its
 * non-empty response ID is the provider's acknowledgement that a notification
 * request was created; this does not guarantee that a device displayed it.
 */
export function oneSignalNotificationCreated(result) {
  return typeof result?.id === "string" && result.id.trim().length > 0;
}
