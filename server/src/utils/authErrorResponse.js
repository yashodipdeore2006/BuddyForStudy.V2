import { failure } from "./response.js";

const GENERIC_AUTH_ERROR = "Authentication service is temporarily unavailable. Please try again shortly.";

export function authErrorResponse(res, error) {
  const suppliedStatus = Number(error?.status);
  const status = Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599
    ? suppliedStatus
    : 500;
  const isSafeClientError = error?.isOperational === true && status >= 400 && status < 500;
  const message = isSafeClientError && typeof error?.message === "string" && error.message.trim()
    ? error.message
    : GENERIC_AUTH_ERROR;

  const retryAfter = Number(error?.retryAfter);
  if (status === 429 && Number.isInteger(retryAfter) && retryAfter > 0 && typeof res.setHeader === "function") {
    res.setHeader("Retry-After", String(retryAfter));
  }

  return failure(res, message, status);
}
