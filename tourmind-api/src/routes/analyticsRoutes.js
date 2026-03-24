import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getAdminAnalytics, getTrendingDestinations, trackEvent } from "../services/analyticsService.js";

const router = Router();

router.post("/analytics/track", requireAuth, async (req, res, next) => {
  try {
    const eventType = String(req.body.eventType || "").trim();
    const entityType = String(req.body.entityType || "").trim();
    const entityId = req.body.entityId ? String(req.body.entityId).trim() : null;
    const metadata = req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

    if (!eventType || !entityType) {
      throw new ApiError(400, "eventType and entityType are required.");
    }

    const data = await trackEvent({
      userId: req.authUser.id,
      eventType,
      entityType,
      entityId,
      metadata
    });

    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics/trending", async (req, res, next) => {
  try {
    const data = await getTrendingDestinations({
      limit: req.query.limit ? Number(req.query.limit) : 8,
      days: req.query.days ? Number(req.query.days) : 30
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/analytics", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const data = await getAdminAnalytics();
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
