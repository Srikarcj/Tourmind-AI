import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import aiRoutes from "./routes/aiRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import messagingRoutes from "./routes/messagingRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import preferenceRoutes from "./routes/preferenceRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import stateRoutes from "./routes/stateRoutes.js";
import { createRateLimiter } from "./middleware/rateLimit.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-internal-key"],
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(createRateLimiter({ windowMs: 60_000, max: 220 }));

app.get("/", (_req, res) => {
  res.json({
    message: "TourMind AI API",
    docs: {
      health: "/health",
      states: "/api/states",
      stateDistricts: "/api/states/:slug/districts",
      statePlaces: "/api/states/:slug/places?source=hybrid",
      stateDiscovered: "/api/states/:slug/discovered",
      stateApiCache: "/api/states/:slug/places/api-cache",
      addManualPlace: "POST /api/states/:slug/places/manual",
      syncStateApiPlaces: "POST /api/states/:slug/places/sync-api",
      syncAllStatesApiPlaces: "POST /api/states/sync-api",
      placeDetails: "/api/places/:id?enrich=true",
      placeDiscover: "POST /api/places/discover",
      routePlanner: "/api/routes?start=Delhi&destination=Agra",
      advancedRoutePlanner: "POST /api/routes/multi-stop",
      routeOptimizer: "POST /api/route/optimize",
      aiTrip: "POST /api/ai/generate-trip",
      aiTripAdvanced: "POST /api/ai/generate-trip-advanced",
      aiChat: "POST /api/ai/chat",
      aiRegenerateDay: "POST /api/ai/regenerate-day",
      aiOptimizeRoute: "POST /api/ai/optimize-route",
      bookingCreate: "POST /api/bookings/create",
      bookingUser: "GET /api/bookings/user",
      bookingAdmin: "GET /api/bookings/admin",
      bookingHistory: "GET /api/bookings/:bookingId/history",
      bookingNotes: "PATCH /api/bookings/notes",
      bookingStatus: "PATCH /api/bookings/status",
      recommendations: "GET/POST /api/recommendations",
      budgetEstimator: "POST /api/budget/estimate",
      preferences: "GET/PUT /api/preferences",
      savedPlaces: "GET/POST/DELETE /api/saved-places",
      notifications: "GET/PATCH /api/notifications",
      bookingMessages: "GET/POST /api/bookings/:bookingId/messages",
      analyticsTrack: "POST /api/analytics/track",
      analyticsAdmin: "GET /api/admin/analytics"
    }
  });
});

app.use(healthRoutes);
app.use("/api", stateRoutes);
app.use("/api", routeRoutes);
app.use("/api", aiRoutes);
app.use("/api", budgetRoutes);
app.use("/api", bookingRoutes);
app.use("/api", messagingRoutes);
app.use("/api", recommendationRoutes);
app.use("/api", preferenceRoutes);
app.use("/api", notificationRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", emailRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;

  console.error(error);
  res.status(status).json({
    message: status === 500 ? "Internal server error" : error.message,
    detail: env.NODE_ENV === "production" ? undefined : error.message
  });
});

export default app;