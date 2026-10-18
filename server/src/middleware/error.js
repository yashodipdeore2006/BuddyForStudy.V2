import { failure } from "../utils/response.js";
import { Sentry } from "../instrument.js";

function normalizeError(error) {
  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError && error?.status === 400) {
    return { status: 400, message: "The request contains invalid JSON. Please check the submitted information." };
  }
  if (error?.type === "entity.too.large") {
    return { status: 413, message: "The submitted request is too large. Please reduce the file or request size." };
  }
  if (error?.name === "ValidationError" && error?.errors) {
    const fields = Object.keys(error.errors).slice(0, 5);
    return { status: 400, message: "Some information is missing or invalid. Please review the highlighted fields.", errors: fields };
  }
  if (error?.name === "CastError") {
    return { status: 400, message: "One of the requested items is invalid. Refresh the page and try again." };
  }
  if (error?.code === 11000) {
    return { status: 409, message: "This record already exists. Check the information and try again." };
  }
  if (error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError") {
    return { status: 401, message: "Your session is invalid or has expired. Please sign in again." };
  }
  if (error?.name === "MulterError" && error?.code === "LIMIT_FILE_SIZE") {
    return { status: 413, message: "That file is too large. Choose a smaller file and try again." };
  }

  const explicitStatus = Number(error?.status || error?.statusCode);
  if (explicitStatus >= 400 && explicitStatus < 500) {
    const messages = {
      400: "The request is invalid. Please check the information and try again.",
      401: "Please sign in to continue.",
      403: "You don't have permission to perform this action.",
      404: "The requested item could not be found.",
      408: "The request timed out. Please try again.",
      409: "This action conflicts with an existing record. Refresh and try again.",
      413: "The submitted content is too large.",
      422: "The information could not be processed. Please check the fields.",
      429: "Too many requests were made in a short time. Please wait a moment and try again."
    };
    return { status: explicitStatus, message: messages[explicitStatus] || "We couldn't process that request. Please check the information and try again." };
  }

  return { status: 500, message: "Something went wrong on our side. Please try again shortly." };
}

export function notFound(req, res) {
  // Never echo arbitrary paths or query values back to the client.
  return failure(res, "We couldn't find that API endpoint. Check the address and try again.", 404);
}

export function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);
  const isProduction = process.env.NODE_ENV === "production";

  console.error({
    method: req.method,
    route: req.path,
    error: error?.name || "Error",
    message: String(error?.message || "Unknown error").slice(0, 1000),
    code: error?.code,
    status: normalized.status
  });

  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag("route", req.path);
      scope.setTag("method", req.method);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  }

  // Keep actionable validation details for expected client errors; never leak
  // stack traces, provider responses, DB internals, or raw exception messages.
  const errors = !isProduction && normalized.errors ? normalized.errors : undefined;
  return failure(res, normalized.message, normalized.status, errors);
}
