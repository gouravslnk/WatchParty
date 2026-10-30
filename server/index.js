import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { ENV } from "./config/env.js";
import { registerSocketHandlers } from "./controllers/socket.controller.js";
import { checkDbConnection } from "./db/supabase.js";
import { logger } from "./utils/logger.js";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ENV.CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket.io connection dispatcher
io.on("connection", (socket) => {
  registerSocketHandlers(io, socket);
});

// Graceful EADDRINUSE error handler
httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`Port ${ENV.PORT} is already in use by another process.`);
    logger.info(`If another server is running, terminate it or run with a different port (e.g. PORT=3002).`);
    process.exit(1);
  } else {
    logger.error("HTTP Server Error:", err);
  }
});

// Bootstrap Server
async function startServer() {
  await checkDbConnection();

  httpServer.listen(ENV.PORT, () => {
    logger.info(`===============================================`);
    logger.info(`WatchParty Server running on port ${ENV.PORT}`);
    logger.info(`Socket.IO server ready with JWT Host Auth`);
    logger.info(`Health check: http://localhost:${ENV.PORT}/health`);
    logger.info(`===============================================`);
  });
}

// Graceful termination handling
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received. Closing HTTP server gracefully...");
  httpServer.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received. Closing HTTP server gracefully...");
  httpServer.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
});

startServer();
