import app from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase, initializeDatabase, isDbConnectionError, isDbEnabled } from "./lib/db.js";

const isStatementTimeoutError = error =>
  String(error?.code || "") === "57014" || /statement timeout/i.test(String(error?.message || ""));

const isLockTimeoutError = error =>
  String(error?.code || "") === "55P03" || /lock timeout/i.test(String(error?.message || ""));

const isRecoverableStartupDbError = error =>
  isStatementTimeoutError(error) || isLockTimeoutError(error) || isDbConnectionError(error);

const startServer = async () => {
  if (isDbEnabled) {
    try {
      await initializeDatabase();

      if (isDbEnabled) {
        console.log("Database initialized and datasets synced.");
      } else {
        console.warn("Database is unreachable. Running in degraded mode with non-DB fallbacks where available.");
      }
    } catch (error) {
      if (isRecoverableStartupDbError(error)) {
        console.warn("Database initialization skipped due connectivity/lock/timeout. Starting API with reduced DB features.");
      } else {
        throw error;
      }
    }
  } else {
    console.log("DATABASE_URL not set. Running with static JSON dataset only.");
  }

  const server = app.listen(env.PORT, () => {
    console.log(`TourMind API listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down TourMind API...");
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

startServer().catch(error => {
  console.error("Failed to start TourMind API", error);
  process.exit(1);
});
