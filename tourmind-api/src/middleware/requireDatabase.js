import { env } from "../config/env.js";
import { isDbEnabled, tryReconnectDatabase } from "../lib/db.js";

export const requireDatabase = async (_req, res, next) => {
  if (!env.DATABASE_URL) {
    return res.status(503).json({
      message: "Database is not configured. Set DATABASE_URL before using booking APIs."
    });
  }

  if (!isDbEnabled) {
    const recovered = await tryReconnectDatabase();

    if (!recovered) {
      return res.status(503).json({
        message: "Database is currently unavailable. Please try again once database connectivity is restored."
      });
    }
  }

  return next();
};

