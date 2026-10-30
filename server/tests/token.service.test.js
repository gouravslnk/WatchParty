import test from "node:test";
import assert from "node:assert";
import { signHostToken, verifyHostToken } from "../services/token.service.js";

test("Token Service: should generate and verify a valid JWT host token", () => {
  const roomCode = "TEST_ROOM_101";
  const username = "hostUser";

  const token = signHostToken({ roomCode, username });
  assert.ok(typeof token === "string", "Token must be a string");
  assert.ok(token.length > 20, "Token should be a non-trivial JWT");

  const isValid = verifyHostToken(token, roomCode, username);
  assert.strictEqual(isValid, true, "Token must be valid for correct room and user");
});

test("Token Service: should reject token for wrong room code", () => {
  const token = signHostToken({ roomCode: "ROOM_A", username: "alex" });
  const isValid = verifyHostToken(token, "ROOM_B", "alex");
  assert.strictEqual(isValid, false, "Token must be rejected for mismatched room");
});

test("Token Service: should reject tampered token string", () => {
  const token = signHostToken({ roomCode: "ROOM_A", username: "alex" });
  const tampered = token.slice(0, -5) + "abcde";
  const isValid = verifyHostToken(tampered, "ROOM_A", "alex");
  assert.strictEqual(isValid, false, "Tampered token must be rejected");
});
