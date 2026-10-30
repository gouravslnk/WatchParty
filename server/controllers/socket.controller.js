import { SOCKET_EVENTS } from "../config/constants.js";
import { RoomService } from "../services/room.service.js";
import { SyncService } from "../services/sync.service.js";
import { roomModel } from "../models/room.model.js";
import { logger } from "../utils/logger.js";

export function registerSocketHandlers(io, socket) {
  let currentRoom = null;
  let currentUsername = null;

  logger.info(`[+] Client connected: ${socket.id}`);

  // 1. JOIN ROOM
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async ({ roomCode, username, hostToken }) => {
    if (!roomCode || !username) return;

    const result = await RoomService.handleUserJoin({
      roomCode,
      username,
      socketId: socket.id,
      hostToken,
    });

    if (result.error) {
      socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: result.error });
      return;
    }

    currentRoom = roomCode;
    currentUsername = username.trim();
    socket.join(roomCode);

    // Send authoritative role assignment to the joining socket
    socket.emit(SOCKET_EVENTS.ROLE_ASSIGNMENT, {
      isHost: result.isHost,
      admin: result.admin,
      hostToken: result.hostToken,
    });

    // Broadcast current member list and active admin to room
    io.to(roomCode).emit(SOCKET_EVENTS.PRESENCE_SYNC, {
      members: result.membersList,
      admin: result.admin,
    });

    // Notify other room members
    socket.to(roomCode).emit(SOCKET_EVENTS.USER_JOINED, {
      username: currentUsername,
      count: result.membersList.length,
      membersList: result.membersList,
    });

    // Ask active host to send current video state to the newly joined client
    const adminSocketId = roomModel.getAdminSocket(roomCode);
    if (adminSocketId && adminSocketId !== socket.id) {
      io.to(adminSocketId).emit(SOCKET_EVENTS.REQUEST_VIDEO_STATE, {
        requestingSocketId: socket.id,
      });
    }

    logger.info(`[ROOM ${roomCode}] ${currentUsername} joined as ${result.isHost ? "HOST" : "VIEWER"} (${result.membersList.length} total)`);
  });

  // 2. HOST: Player control (Play / Pause / Seek)
  socket.on(SOCKET_EVENTS.PLAYER_CONTROL, (data) => {
    if (!currentRoom) return;
    if (!SyncService.isHost(currentRoom, socket.id)) return;

    const payload = SyncService.formatPlaybackPayload(data, currentUsername);
    socket.to(currentRoom).emit(SOCKET_EVENTS.PLAYER_UPDATE, payload);
  });

  // 3. HOST -> SERVER -> NEW CLIENT: State sync response
  socket.on(SOCKET_EVENTS.VIDEO_STATE_RESPONSE, ({ requestingSocketId, currentTime, isPlaying }) => {
    io.to(requestingSocketId).emit(SOCKET_EVENTS.SYNC_VIDEO_STATE, {
      currentTime,
      isPlaying,
    });
  });

  // 4. HOST: Change video stream
  socket.on(SOCKET_EVENTS.CHANGE_VIDEO, (data) => {
    if (!currentRoom) return;
    if (!SyncService.isHost(currentRoom, socket.id)) return;

    io.to(currentRoom).emit(SOCKET_EVENTS.VIDEO_CHANGED, data);
    logger.info(`[ROOM ${currentRoom}] Video changed by host`);
  });

  // 5. HOST ONLY: Transfer host to another member
  socket.on(SOCKET_EVENTS.TRANSFER_HOST, async ({ targetUsername }) => {
    if (!currentRoom || !targetUsername) return;

    const result = await RoomService.handleHostTransfer({
      roomCode: currentRoom,
      requestingSocketId: socket.id,
      targetUsername,
    });

    if (result.error) {
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, result.error);
      return;
    }

    // Demote former host
    socket.emit(SOCKET_EVENTS.ROLE_ASSIGNMENT, { isHost: false, admin: result.newHost });

    // Promote new host with signed JWT host token
    io.to(result.targetSocketId).emit(SOCKET_EVENTS.ROLE_ASSIGNMENT, {
      isHost: true,
      admin: result.newHost,
      hostToken: result.newHostToken,
    });

    // Broadcast change to all room members
    io.to(currentRoom).emit(SOCKET_EVENTS.HOST_CHANGED, {
      admin: result.newHost,
      previousAdmin: result.previousHost,
    });
  });

  // 6. HOST ONLY: Kick a member
  socket.on(SOCKET_EVENTS.KICK_USER, ({ targetUsername }) => {
    if (!currentRoom || !targetUsername) return;

    const result = RoomService.handleKickMember({
      roomCode: currentRoom,
      requestingSocketId: socket.id,
      currentUsername,
      targetUsername,
    });

    if (result.error) {
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, result.error);
      return;
    }

    const targetSocket = io.sockets.sockets.get(result.targetSocketId);
    if (targetSocket) {
      targetSocket.leave(currentRoom);
      targetSocket.emit(SOCKET_EVENTS.KICKED, {
        message: "You have been removed from the room by the host.",
      });
    }

    // Broadcast removal to all remaining room members
    io.to(currentRoom).emit(SOCKET_EVENTS.USER_KICKED, {
      username: result.targetUsername,
      membersList: result.membersList,
    });
  });

  // 7. CHAT MESSAGE
  socket.on(SOCKET_EVENTS.SEND_MESSAGE, (message) => {
    if (!currentRoom || !currentUsername || !message) return;

    socket.to(currentRoom).emit(SOCKET_EVENTS.NEW_MESSAGE, {
      username: currentUsername,
      message: message.toString().slice(0, 500),
    });
  });

  // 8. REACTIONS
  socket.on(SOCKET_EVENTS.SEND_REACTION, (emoji) => {
    if (!currentRoom || !currentUsername) return;
    socket.to(currentRoom).emit(SOCKET_EVENTS.NEW_REACTION, {
      username: currentUsername,
      emoji,
    });
  });

  // 9. LEAVE ROOM & DISCONNECT
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, async () => {
    await handleLeave(true);
  });

  socket.on("disconnect", async (reason) => {
    logger.info(`[-] Client disconnected: ${socket.id} (${reason})`);
    await handleLeave(false);
  });

  async function handleLeave(isExplicit = false) {
    if (!currentRoom) return;

    const roomCode = currentRoom;
    const leavingUser = currentUsername;

    const result = await RoomService.handleLeave({
      roomCode,
      socketId: socket.id,
      isExplicit,
    });

    socket.leave(roomCode);
    currentRoom = null;
    currentUsername = null;

    if (!result) return;

    if (result.roomEnded) {
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_ENDED, {
        message: result.message,
      });
    } else {
      socket.to(roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
        username: leavingUser,
        count: result.count,
        membersList: result.membersList,
      });
    }
  }
}
