function safeErrorCode(error) {
  const candidate = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  return /^[A-Z0-9_-]{1,40}$/.test(candidate) ? candidate : "";
}

function safeErrorType(error) {
  const candidate = typeof error?.name === "string" ? error.name : "";
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(candidate) ? candidate : "Error";
}

export function safeDeliveryError(error, channel = "email") {
  const code = safeErrorCode(error);
  const rawStatus = Number(error?.statusCode || error?.status || 0);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 0;

  if (channel === "push" && (status === 404 || status === 410)) {
    return "Push subscription expired or no longer exists";
  }
  if (channel === "push" && status) {
    return "Web Push delivery failed (HTTP " + status + ")" + (code ? " (" + code + ")" : "") + ".";
  }
  if (channel === "push") {
    return "Web Push delivery failed" + (code ? " (" + code + ")" : "") + ".";
  }
  return "Email delivery failed" + (code ? " (" + code + ")" : "") + ".";
}

export function safeDeliveryErrorMetadata(error) {
  const code = safeErrorCode(error);
  const rawStatus = Number(error?.statusCode || error?.status || 0);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
  return {
    errorType: safeErrorType(error),
    ...(code ? { errorCode: code } : {}),
    ...(status ? { statusCode: status } : {})
  };
}
