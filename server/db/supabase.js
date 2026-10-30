import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);

/**
 * Health check ping to Supabase
 */
export async function checkDbConnection() {
  try {
    const { error } = await supabase.from("rooms").select("roomCode").limit(1);
    if (error) {
      logger.warn(`Database connection warning: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`Database connection check failed: ${err.message}`);
    return false;
  }
}
