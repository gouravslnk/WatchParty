import { Router } from "express";
import { RoomController } from "../controllers/room.controller.js";

const router = Router();

// Health check
router.get("/health", RoomController.getHealth);

// Room details
router.get("/rooms/:roomCode", RoomController.getRoomDetails);

export default router;
