import test from "node:test";
import assert from "node:assert";
import { roomModel } from "../models/room.model.js";

test("Room Model: should create and manage room membership", () => {
  const roomCode = "TEST_MODEL_ROOM";

  roomModel.create(roomCode, { adminUsername: "hostAlex" });
  assert.strictEqual(roomModel.has(roomCode), true);

  // Add members
  roomModel.addMember(roomCode, "sock_1", "hostAlex");
  roomModel.addMember(roomCode, "sock_2", "bob");

  const members = roomModel.getMembers(roomCode);
  assert.strictEqual(members.length, 2);
  assert.ok(members.includes("hostAlex"));
  assert.ok(members.includes("bob"));

  // Duplicate nickname check
  const isTaken = roomModel.isNicknameTaken(roomCode, "BOB");
  assert.strictEqual(isTaken, true, "Nickname check must be case-insensitive");

  // Remove member
  const remaining = roomModel.removeMember(roomCode, "sock_2");
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(roomModel.isNicknameTaken(roomCode, "bob"), false);

  // Cleanup
  roomModel.delete(roomCode);
  assert.strictEqual(roomModel.has(roomCode), false);
});
