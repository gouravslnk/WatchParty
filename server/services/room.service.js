import { supabase } from "../db/supabase.js";
import { roomModel } from "../models/room.model.js";
import { signHostToken, verifyHostToken } from "./token.service.js";
import { logger } from "../utils/logger.js";

export class RoomService {
  /**
   * Ensure room is loaded into memory, populating admin from database if needed
   */
  static async getOrInitRoom(roomCode, initialHostToken = null) {
    if (!roomModel.has(roomCode)) {
      const { data } = await supabase
        .from("rooms")
        .select("admin")
        .eq("roomCode", roomCode)
        .maybeSingle();

      const adminUser = data?.admin || null;
      let hostToken = initialHostToken;

      // If no hostToken provided, generate a signed JWT for the admin
      if (!hostToken && adminUser) {
        hostToken = signHostToken({ roomCode, username: adminUser });
      }

      roomModel.create(roomCode, {
        adminUsername: adminUser,
        hostToken,
      });
    }

    return roomModel.get(roomCode);
  }

  /**
   * Process a user joining a room
   */
  static async handleUserJoin({ roomCode, username, socketId, hostToken }) {
    const room = await this.getOrInitRoom(roomCode, hostToken);
    const trimmedUser = username.trim();

    // 1. Check duplicate nickname
    const isNicknameTaken = roomModel.isNicknameTaken(roomCode, trimmedUser, socketId);
    if (isNicknameTaken) {
      // Allow reconnecting host with matching token to reclaim
      const isReconnectingHost = Boolean(
        hostToken &&
        (verifyHostToken(hostToken, roomCode, trimmedUser) || hostToken === room.hostToken)
      );

      if (isReconnectingHost) {
        const existingSocketId = roomModel.findSocketByUsername(roomCode, trimmedUser);
        if (existingSocketId) {
          roomModel.removeMember(roomCode, existingSocketId);
        }
      } else {
        return {
          error: `The nickname "${trimmedUser}" is already taken in this room. Please choose another nickname.`,
        };
      }
    }

    // Register member in room
    roomModel.addMember(roomCode, socketId, trimmedUser);

    // 2. Authoritative Single Host Assignment
    let isThisSocketHost = false;

    // A) Secret Host Token Match (via cryptographically signed JWT or memory token)
    const tokenMatches = Boolean(
      hostToken &&
      (verifyHostToken(hostToken, roomCode, trimmedUser) || hostToken === room.hostToken)
    );

    if (tokenMatches) {
      room.hostToken = hostToken;
      room.adminSocketId = socketId;
      room.adminUsername = trimmedUser;
      isThisSocketHost = true;
    } else if (!room.adminSocketId && room.adminUsername) {
      // B) Reconnect by username if room has no active host socket
      if (room.adminUsername.trim().toLowerCase() === trimmedUser.toLowerCase()) {
        const newJwtToken = signHostToken({ roomCode, username: trimmedUser });
        room.hostToken = newJwtToken;
        room.adminSocketId = socketId;
        isThisSocketHost = true;
      }
    } else if (!room.adminSocketId && !room.adminUsername) {
      // C) First-ever joiner becomes host
      const newJwtToken = signHostToken({ roomCode, username: trimmedUser });
      room.hostToken = newJwtToken;
      room.adminSocketId = socketId;
      room.adminUsername = trimmedUser;
      isThisSocketHost = true;

      // Persist admin to Supabase
      await supabase
        .from("rooms")
        .update({ admin: trimmedUser })
        .eq("roomCode", roomCode);
    }

    const membersList = roomModel.getMembers(roomCode);

    return {
      success: true,
      isHost: isThisSocketHost,
      admin: room.adminUsername,
      hostToken: isThisSocketHost ? room.hostToken : null,
      membersList,
    };
  }

  /**
   * Transfer host authority to another member
   */
  static async handleHostTransfer({ roomCode, requestingSocketId, targetUsername }) {
    const room = roomModel.get(roomCode);
    if (!room) return { error: "Room not found." };

    if (requestingSocketId !== room.adminSocketId) {
      return { error: "Only the host can transfer hosting privileges." };
    }

    const targetSocketId = roomModel.findSocketByUsername(roomCode, targetUsername);
    if (!targetSocketId) {
      return { error: `Member "${targetUsername}" is no longer in the room.` };
    }

    const previousHost = room.adminUsername;
    const newHostJwt = signHostToken({ roomCode, username: targetUsername });

    room.hostToken = newHostJwt;
    room.adminSocketId = targetSocketId;
    room.adminUsername = targetUsername;

    // Persist to Supabase
    await supabase
      .from("rooms")
      .update({ admin: targetUsername })
      .eq("roomCode", roomCode);

    logger.info(`[ROOM ${roomCode}] Host transferred from ${previousHost} to ${targetUsername}`);

    return {
      success: true,
      previousHost,
      newHost: targetUsername,
      targetSocketId,
      newHostToken: newHostJwt,
    };
  }

  /**
   * Kick a member from the room
   */
  static handleKickMember({ roomCode, requestingSocketId, currentUsername, targetUsername }) {
    const room = roomModel.get(roomCode);
    if (!room) return { error: "Room not found." };

    if (requestingSocketId !== room.adminSocketId) {
      return { error: "Only the host can remove members." };
    }

    if (targetUsername.trim().toLowerCase() === currentUsername?.trim().toLowerCase()) {
      return { error: "Host cannot kick themselves." };
    }

    const targetSocketId = roomModel.findSocketByUsername(roomCode, targetUsername);
    if (!targetSocketId) {
      return { error: `Member "${targetUsername}" is no longer in the room.` };
    }

    const membersList = roomModel.removeMember(roomCode, targetSocketId);
    logger.info(`[ROOM ${roomCode}] "${targetUsername}" kicked by host "${currentUsername}"`);

    return {
      success: true,
      targetSocketId,
      targetUsername,
      membersList,
    };
  }

  /**
   * Process a member leaving or disconnecting
   */
  static async handleLeave({ roomCode, socketId, isExplicit = false }) {
    const room = roomModel.get(roomCode);
    if (!room) return null;

    const wasAdmin = socketId === room.adminSocketId;
    const membersList = roomModel.removeMember(roomCode, socketId);
    const count = membersList.length;

    if (wasAdmin && isExplicit) {
      // Host explicitly ended room
      await supabase.from("rooms").delete().eq("roomCode", roomCode);
      roomModel.delete(roomCode);
      logger.info(`[ROOM ${roomCode}] Ended by host`);

      return {
        roomEnded: true,
        message: "The host ended the party.",
      };
    }

    if (wasAdmin) {
      room.adminSocketId = null; // Awaits host rejoin or transfer
    }

    if (count === 0) {
      roomModel.delete(roomCode);
      logger.info(`[ROOM ${roomCode}] Cleaned up from memory (empty)`);
    }

    return {
      roomEnded: false,
      wasAdmin,
      count,
      membersList,
    };
  }
}
