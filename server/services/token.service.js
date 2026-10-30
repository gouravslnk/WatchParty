import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { ROLES } from "../config/constants.js";
import { logger } from "../utils/logger.js";

/**
 * Generate a cryptographically signed JWT for room host privileges
 */
export function signHostToken({ roomCode, username }) {
  const payload = {
    roomCode,
    username,
    role: ROLES.HOST,
  };

  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRY,
  });
}

/**
 * Verify a given host token against roomCode and optional username
 * Supports both modern JWT signatures and legacy session tokens during migration
 */
export function verifyHostToken(token, expectedRoomCode, expectedUsername = null) {
  if (!token || typeof token !== "string") return false;

  // 1. Try JWT verification
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    if (decoded.roomCode !== expectedRoomCode) return false;
    if (decoded.role !== ROLES.HOST) return false;
    if (expectedUsername && decoded.username.toLowerCase() !== expectedUsername.toLowerCase()) {
      return false;
    }
    return true;
  } catch (err) {
    // If not a valid JWT, check legacy format fallback (e.g. legacy random strings during transition)
    logger.debug(`Token JWT verification fallback: ${err.message}`);
    return false;
  }
}
