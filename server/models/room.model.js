/**
 * In-Memory Room State Model
 * Encapsulates the active rooms registry and member tracking.
 */
class RoomModel {
  constructor() {
    // Map<roomCode, {
    //   members: Map<socketId, username>,
    //   adminSocketId: string | null,
    //   adminUsername: string | null,
    //   hostToken: string | null
    // }>
    this.rooms = new Map();
  }

  has(roomCode) {
    return this.rooms.has(roomCode);
  }

  get(roomCode) {
    return this.rooms.get(roomCode);
  }

  create(roomCode, { adminUsername = null, hostToken = null } = {}) {
    const roomData = {
      members: new Map(),
      adminSocketId: null,
      adminUsername,
      hostToken,
    };
    this.rooms.set(roomCode, roomData);
    return roomData;
  }

  delete(roomCode) {
    return this.rooms.delete(roomCode);
  }

  getMembers(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return [];
    return Array.from(room.members.values());
  }

  getAdminSocket(roomCode) {
    return this.rooms.get(roomCode)?.adminSocketId || null;
  }

  addMember(roomCode, socketId, username) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    room.members.set(socketId, username);
    return Array.from(room.members.values());
  }

  removeMember(roomCode, socketId) {
    const room = this.rooms.get(roomCode);
    if (!room) return [];
    room.members.delete(socketId);
    return Array.from(room.members.values());
  }

  isNicknameTaken(roomCode, username, excludeSocketId = null) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    const lower = username.trim().toLowerCase();
    for (const [sId, u] of room.members.entries()) {
      if (sId !== excludeSocketId && u.trim().toLowerCase() === lower) {
        return true;
      }
    }
    return false;
  }

  findSocketByUsername(roomCode, username) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const lower = username.trim().toLowerCase();
    for (const [sId, u] of room.members.entries()) {
      if (u.trim().toLowerCase() === lower) {
        return sId;
      }
    }
    return null;
  }
}

export const roomModel = new RoomModel();
