import { roomModel } from "../models/room.model.js";

export class SyncService {
  /**
   * Verify if the socket attempting to control playback is indeed the active host
   */
  static isHost(roomCode, socketId) {
    const adminSocketId = roomModel.getAdminSocket(roomCode);
    return Boolean(adminSocketId && adminSocketId === socketId);
  }

  /**
   * Format playback action payload for broadcast
   */
  static formatPlaybackPayload(data, username) {
    return {
      type: data.type,
      currentTime: data.currentTime,
      isPlaying: data.isPlaying,
      playbackRate: data.playbackRate || 1,
      source: data.source,
      username,
    };
  }
}
