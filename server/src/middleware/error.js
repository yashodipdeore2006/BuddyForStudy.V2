import { failure } from "../utils/response.js";
import { Sentry } from "../instrument.js";

function getErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  const provider = error?.error || error?.response?.data?.error || error?.response?.data;
  return provider?.description
    || provider?.reason
    || error?.description
    || (typeof error === "string" ? error : "")
    || (error ? JSON.stringify(error) : "Unknown server error");
}

export function notFound(req, res) {
  return failure(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

export function errorHandler(error, req, res, _next) {
  const message = getErrorMessage(error);
  console.error({
    method: req.method,
    route: req.originalUrl,
    error: message,
    rawError: error
  });

  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag("route", req.originalUrl);
      scope.setTag("method", req.method);
      Sentry.captureException(error instanceof Error ? error : new Error(message));
    });
  }

  if (error?.code === 11000) return failure(res, "A resource with the same unique value already exists", 409);
  const status = Number(error?.status);
  return failure(
    res,
    process.env.NODE_ENV === "production" ? "Internal server error" : message,
    status >= 400 && status < 600 ? status : 500
  );
}
