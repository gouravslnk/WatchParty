import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import routes from "./routes/index.js";
import { requestLogger } from "./middleware/logger.middleware.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();

// Global Middlewares
app.use(cors({
  origin: ENV.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// API Routes
app.use("/", routes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
