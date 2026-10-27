const THREE_DECIMAL_RAZORPAY_CURRENCIES = new Set(["BHD", "KWD", "OMR"]);

function amountError(message) {
  const error = new RangeError(message);
  error.status = 400;
  error.isOperational = true;
  return error;
}

function currencySpec(currency = "INR") {
  const code = String(currency ?? "INR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw amountError("Currency must be a three-letter code.");
  let fractionDigits;
  try {
    fractionDigits = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw amountError("Currency code is not valid for payment amount conversion.");
  }
  if (THREE_DECIMAL_RAZORPAY_CURRENCIES.has(code) && fractionDigits === 3) {
    // These Razorpay currencies use a 1000x provider scale but require a trailing zero.
    // BuddyForStudy therefore stores and displays them to two decimal places.
    return { code, displayFractionDigits: 2, providerFractionDigits: 3, scale: 1000 };
  }
  if (fractionDigits === 0) return { code, displayFractionDigits: 0, providerFractionDigits: 0, scale: 1 };
  if (fractionDigits === 2) return { code, displayFractionDigits: 2, providerFractionDigits: 2, scale: 100 };
  throw amountError("Minor-unit precision is not configured for this Razorpay currency.");
}

function numericAmount(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    throw amountError("Amount must be a finite non-negative number.");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw amountError("Amount must be a finite non-negative number.");
  return amount;
}

export function getRazorpayCurrencyPrecision(currency = "INR") {
  return currencySpec(currency).displayFractionDigits;
}

/** Convert major units to the exact integer minor units expected by Razorpay. */
export function toRazorpayMinorUnits(value, currency = "INR") {
  const amount = numericAmount(value);
  const spec = currencySpec(currency);
  const displayScale = 10 ** spec.displayFractionDigits;
  const scaled = amount * displayScale;
  const roundedUnits = Math.round(scaled);
  if (!Number.isFinite(scaled) || !Number.isSafeInteger(roundedUnits) || Math.abs(scaled - roundedUnits) > 1e-7) {
    throw amountError(`Amount has more fractional digits than ${spec.code} supports.`);
  }
  const minorUnits = roundedUnits * (spec.scale / displayScale);
  if (!Number.isSafeInteger(minorUnits) || (spec.providerFractionDigits === 3 && minorUnits % 10 !== 0)) {
    throw amountError(`Amount does not match the supported minor-unit precision for ${spec.code}.`);
  }
  return minorUnits;
}

/** Convert the provider's integer minor-unit amount into stored major units. */
export function fromRazorpayMinorUnits(value, currency = "INR") {
  const minorUnits = Number(value);
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw amountError("Provider amount must be a non-negative safe integer in minor units.");
  }
  const spec = currencySpec(currency);
  if (spec.providerFractionDigits === 3 && minorUnits % 10 !== 0) {
    throw amountError(`Provider amount violates the required ${spec.code} minor-unit precision.`);
  }
  return minorUnits / spec.scale;
}

/** Normalize a manually entered amount to the precision the app can display and charge. */
export function normalizeRazorpayAmount(value, currency = "INR") {
  const amount = numericAmount(value);
  const displayScale = 10 ** getRazorpayCurrencyPrecision(currency);
  const normalized = Math.round((amount + Number.EPSILON) * displayScale) / displayScale;
  return fromRazorpayMinorUnits(toRazorpayMinorUnits(normalized, currency), currency);
}
