import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || "development",
  SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  SUPABASE_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  JWT_SECRET: process.env.JWT_SECRET || "watchparty-dev-secret-key-change-in-prod-2026",
  JWT_EXPIRY: process.env.JWT_EXPIRY || "7d",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
};

// Simple configuration sanity check
if (!ENV.SUPABASE_URL || !ENV.SUPABASE_KEY) {
  console.warn("[Config Warning] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment variables.");
}
