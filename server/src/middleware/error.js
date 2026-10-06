import { failure } from "../utils/response.js";

export function notFound(req, res) {
  return failure(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

export function errorHandler(error, req, res, _next) {
  console.error({
    method: req.method,
    route: req.originalUrl,
    error: error.message
  });

  if (error?.code === 11000) {
    return failure(res, "A resource with the same unique value already exists", 409);
  }

  return failure(
    res,
    process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    500
  );
}
