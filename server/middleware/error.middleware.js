import { logger } from "../utils/logger.js";
import { errorResponse } from "../utils/helpers.js";

export function notFoundHandler(req, res) {
  return errorResponse(res, `Route ${req.originalUrl} not found`, 404);
}

export function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  return errorResponse(res, message, status);
}
