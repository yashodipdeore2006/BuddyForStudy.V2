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


/** Summarize worker delivery results without hiding retryable or terminal failures. */
export function summarizeNotificationDeliveryOutcomes(outcomes = []) {
  return {
    attempted: outcomes.filter((item) => item?.status !== "not_attempted").length,
    failures: outcomes.filter((item) =>
      ["failed", "retrying"].includes(item?.status) || item?.partialFailure === true
    ).length
  };
}
