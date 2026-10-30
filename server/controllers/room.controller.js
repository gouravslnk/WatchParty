import { checkDbConnection, supabase } from "../db/supabase.js";
import { roomModel } from "../models/room.model.js";
import { successResponse, errorResponse } from "../utils/helpers.js";

export class RoomController {
  /**
   * Health check endpoint for Render/uptime monitors
   */
  static async getHealth(req, res) {
    const dbHealthy = await checkDbConnection();
    return successResponse(res, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: dbHealthy ? "connected" : "degraded",
      activeRooms: roomModel.rooms.size,
    });
  }

  /**
   * Get active room details from memory/database
   */
  static async getRoomDetails(req, res) {
    const { roomCode } = req.params;
    if (!roomCode) {
      return errorResponse(res, "Room code is required.", 400);
    }

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("roomCode", roomCode)
      .maybeSingle();

    if (error || !data) {
      return errorResponse(res, "Room not found.", 404);
    }

    const activeMembers = roomModel.getMembers(roomCode);

    return successResponse(res, {
      room: data,
      activeMembersCount: activeMembers.length,
      hasActiveHost: Boolean(roomModel.getAdminSocket(roomCode)),
    });
  }
}
