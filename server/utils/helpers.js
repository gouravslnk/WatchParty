/**
 * Sanitize username by trimming and stripping control characters
 */
export function sanitizeUsername(username) {
  if (typeof username !== "string") return "";
  return username.trim().slice(0, 32);
}

/**
 * Standard HTTP JSON response formatters
 */
export function successResponse(res, data = {}, status = 200) {
  return res.status(status).json({
    success: true,
    data,
  });
}

export function errorResponse(res, message = "Internal Server Error", status = 500) {
  return res.status(status).json({
    success: false,
    error: message,
  });
}
