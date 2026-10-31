const safeName = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value) ? value : "Error";
const safeCode = (value) => typeof value === "string" && /^[A-Z0-9_-]{1,40}$/.test(value.toUpperCase()) ? value.toUpperCase() : undefined;

/**
 * Return only stable error metadata for operational telemetry.
 * Never include provider messages, request data, prompts, URLs, or stack traces.
 */
export function safeTelemetryError(error) {
  const statusValue = Number(error?.statusCode || error?.status || 0);
  const status = Number.isInteger(statusValue) && statusValue >= 400 && statusValue <= 599 ? statusValue : undefined;
  const code = safeCode(error?.code);
  return {
    errorType: safeName(error?.name),
    ...(code ? { errorCode: code } : {}),
    ...(status ? { statusCode: status } : {})
  };
}
