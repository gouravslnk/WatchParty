import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// In-memory room registry: roomCode -> {
//   members: Map<socketId, username>,
//   adminSocketId: string | null,
//   adminUsername: string | null,
//   hostToken: string | null
// }
const rooms = new Map();

function getRoomMembers(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return [];
  return Array.from(room.members.values());
}

function findAdminSocket(roomCode) {
  const room = rooms.get(roomCode);
  return room?.adminSocketId || null;
}

io.on("connection", (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  let currentRoom = null;
  let currentUsername = null;

  // JOIN ROOM
  socket.on("join-room", async ({ roomCode, username, hostToken }) => {
    if (!roomCode || !username) return;

    const trimmedUser = username.trim();

    // Initialize room in memory if not present
    if (!rooms.has(roomCode)) {
      const { data } = await supabase
        .from("rooms")
        .select("admin")
        .eq("roomCode", roomCode)
        .maybeSingle();

      rooms.set(roomCode, {
        members: new Map(),
        adminSocketId: null,
        adminUsername: data?.admin || null,
        hostToken: hostToken || null,
      });
    }

    const room = rooms.get(roomCode);

    // 1. Prevent duplicate active nicknames in the same room
    for (const [existingSocketId, existingUser] of room.members.entries()) {
      if (
        existingSocketId !== socket.id &&
        existingUser.trim().toLowerCase() === trimmedUser.toLowerCase()
      ) {
        // If this is the reconnecting host with the matching hostToken, allow reclaiming the slot
        const isReconnectingHost = Boolean(
          hostToken && room.hostToken && hostToken === room.hostToken
        );
        if (isReconnectingHost) {
          room.members.delete(existingSocketId);
          break;
        }

        socket.emit("join-error", {
          message: `The nickname "${trimmedUser}" is already taken in this room. Please choose another nickname.`,
        });
        return;
      }
    }

    currentRoom = roomCode;
    currentUsername = trimmedUser;
    socket.join(roomCode);
    room.members.set(socket.id, trimmedUser);

    // 2. Authoritative Single Host Assignment
    let isThisSocketHost = false;

    if (hostToken && room.hostToken && hostToken === room.hostToken) {
      // Reconnecting host with matching secret host token
      room.adminSocketId = socket.id;
      room.adminUsername = trimmedUser;
      isThisSocketHost = true;
    } else if (!room.adminSocketId && !room.hostToken && hostToken) {
      // First connection presenting the creator's hostToken
      room.adminSocketId = socket.id;
      room.adminUsername = trimmedUser;
      room.hostToken = hostToken;
      isThisSocketHost = true;
    } else if (!room.adminSocketId && !room.adminUsername && hostToken) {
      // Fallback: room without pre-assigned admin
      room.adminSocketId = socket.id;
      room.adminUsername = trimmedUser;
      room.hostToken = hostToken;
      isThisSocketHost = true;
    }

    // Send role confirmation to this client
    socket.emit("role-assignment", {
      isHost: isThisSocketHost,
      admin: room.adminUsername,
      hostToken: isThisSocketHost ? room.hostToken : null,
    });

    const membersList = getRoomMembers(roomCode);
    const count = membersList.length;

    // Notify everyone in the room
    io.to(roomCode).emit("user-joined", {
      username: trimmedUser,
      members: count,
      membersList,
    });

    // Send presence state to the joiner
    socket.emit("presence-sync", { members: count, membersList });

    // Ask host to send current video state to the new client
    const adminSocketId = findAdminSocket(roomCode);
    if (adminSocketId && adminSocketId !== socket.id) {
      io.to(adminSocketId).emit("request-video-state", {
        requestingSocketId: socket.id,
      });
    }

    console.log(`[ROOM ${roomCode}] ${trimmedUser} joined as ${isThisSocketHost ? "HOST" : "VIEWER"} (${count} total)`);
  });

  // HOST → CLIENTS: Player control (ONLY active host socket can emit)
  socket.on("player-control", (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || socket.id !== room.adminSocketId) return;

    // Broadcast to everyone EXCEPT host
    socket.to(currentRoom).emit("player-update", {
      ...data,
      username: currentUsername,
    });
  });

  // HOST → SERVER → NEW CLIENT: State sync 
  socket.on("video-state-response", ({ requestingSocketId, currentTime, isPlaying }) => {
    io.to(requestingSocketId).emit("sync-video-state", {
      currentTime,
      isPlaying,
    });
  });

  // HOST: Change video stream (ONLY active host socket can change)
  socket.on("change-video", (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || socket.id !== room.adminSocketId) return;

    io.to(currentRoom).emit("video-changed", data);
    console.log(`[ROOM ${currentRoom}] Video changed by host`);
  });

  // HOST ONLY: Transfer host to another member
  socket.on("transfer-host", async ({ targetUsername }) => {
    if (!currentRoom || !targetUsername) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    // Verify requesting socket is indeed the active host
    if (socket.id !== room.adminSocketId) {
      socket.emit("error-message", "Only the host can transfer hosting privileges.");
      return;
    }

    // Find target socket by username
    let targetSocketId = null;
    for (const [sId, u] of room.members.entries()) {
      if (u.trim().toLowerCase() === targetUsername.trim().toLowerCase()) {
        targetSocketId = sId;
        break;
      }
    }

    if (!targetSocketId) {
      socket.emit("error-message", `Member "${targetUsername}" is no longer in the room.`);
      return;
    }

    const previousHost = room.adminUsername;
    const newHostToken = "ht_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    room.hostToken = newHostToken;
    room.adminSocketId = targetSocketId;
    room.adminUsername = targetUsername;

    // Persist new admin in Supabase
    await supabase
      .from("rooms")
      .update({ admin: targetUsername })
      .eq("roomCode", currentRoom);

    // Notify former host: demoted to viewer
    socket.emit("role-assignment", { isHost: false, admin: targetUsername });

    // Notify new host: promoted to host with new hostToken
    io.to(targetSocketId).emit("role-assignment", { isHost: true, admin: targetUsername, hostToken: newHostToken });

    // Broadcast to all room members
    io.to(currentRoom).emit("host-changed", {
      admin: targetUsername,
      previousAdmin: previousHost,
    });

    console.log(`[ROOM ${currentRoom}] Host transferred from ${previousHost} to ${targetUsername}`);
  });

  // HOST ONLY: Kick a member from the room
  socket.on("kick-user", ({ targetUsername }) => {
    if (!currentRoom || !targetUsername) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    // Verify requesting socket is indeed the active host
    if (socket.id !== room.adminSocketId) {
      socket.emit("error-message", "Only the host can remove members.");
      return;
    }

    // Host cannot kick themselves
    if (targetUsername.trim().toLowerCase() === currentUsername?.trim().toLowerCase()) {
      socket.emit("error-message", "Host cannot kick themselves.");
      return;
    }

    // Find target socket
    let targetSocketId = null;
    for (const [sId, u] of room.members.entries()) {
      if (u.trim().toLowerCase() === targetUsername.trim().toLowerCase()) {
        targetSocketId = sId;
        break;
      }
    }

    if (!targetSocketId) {
      socket.emit("error-message", `Member "${targetUsername}" is no longer in the room.`);
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    // Remove member from room map and room channel
    room.members.delete(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(currentRoom);
      targetSocket.emit("kicked", {
        message: "You were removed from the room by the host.",
      });
    }

    const membersList = getRoomMembers(currentRoom);
    const count = membersList.length;

    // Notify remaining room members
    io.to(currentRoom).emit("user-kicked", {
      username: targetUsername,
      members: count,
      membersList,
    });

    console.log(`[ROOM ${currentRoom}] ${targetUsername} was kicked by host ${currentUsername}`);
  });

  // CHAT (Broadcast to everyone EXCEPT sender)
  socket.on("send-message", (message) => {
    if (!currentRoom || !currentUsername || !message) return;

    socket.to(currentRoom).emit("new-message", {
      username: currentUsername,
      message: message.toString().slice(0, 500),
    });
  });

  // REACTIONS (Broadcast to everyone EXCEPT sender)
  socket.on("send-reaction", (emoji) => {
    if (!currentRoom || !currentUsername) return;
    socket.to(currentRoom).emit("new-reaction", { username: currentUsername, emoji });
  });

  // LEAVE ROOM
  socket.on("leave-room", async () => {
    await handleLeave(true);
  });

  async function handleLeave(isExplicit = false) {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const wasAdmin = socket.id === room.adminSocketId;
    room.members.delete(socket.id);
    socket.leave(currentRoom);

    const membersList = getRoomMembers(currentRoom);
    const count = membersList.length;

    if (wasAdmin && isExplicit) {
      // Host explicitly ended/left → delete room from Supabase & memory
      await supabase.from("rooms").delete().eq("roomCode", currentRoom);
      rooms.delete(currentRoom);

      io.to(currentRoom).emit("room-ended", {
        message: "The host ended the party.",
      });
      console.log(`[ROOM ${currentRoom}] Ended by host`);
    } else {
      if (wasAdmin) {
        room.adminSocketId = null; // Host disconnected; room awaits host rejoin or handover
      }

      if (count === 0) {
        rooms.delete(currentRoom);
        console.log(`[ROOM ${currentRoom}] Removed from memory (empty)`);
      } else {
        io.to(currentRoom).emit("user-left", {
          username: currentUsername,
          members: count,
          membersList,
        });
        console.log(`[ROOM ${currentRoom}] ${currentUsername} left (${count} remaining)`);
      }
    }

    currentRoom = null;
    currentUsername = null;
  }

  socket.on("disconnect", async () => {
    await handleLeave(false);
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use. Kill the other process or use a different port.\n   Try: npx kill-port ${PORT}\n`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 WatchParty Socket Server running on port ${PORT}`);
  console.log(`   Architecture: Single-Host Authority → Server → Clients`);
  console.log(`   Backend: Supabase (room persistence)`);
});
