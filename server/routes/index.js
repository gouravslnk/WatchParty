import { Router } from "express";
import roomRoutes from "./room.routes.js";
import { successResponse } from "../utils/helpers.js";

const router = Router();

// Root API index
router.get("/", (req, res) => {
  return successResponse(res, {
    name: "WatchParty API",
    version: "1.0.0",
    status: "online",
  });
});

// Mount modular sub-routes
router.use("/", roomRoutes);

export default router;
