import { verifyHostToken } from "../services/token.service.js";
import { errorResponse } from "../utils/helpers.js";

/**
 * Express middleware to verify host JWT token on protected HTTP routes
 */
export function requireHostAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : req.query.token;
  const roomCode = req.params.roomCode || req.body.roomCode;

  if (!token || !roomCode) {
    return errorResponse(res, "Missing host authorization token or room code.", 401);
  }

  const isValid = verifyHostToken(token, roomCode);
  if (!isValid) {
    return errorResponse(res, "Invalid or expired host authorization.", 403);
  }

  next();
}
