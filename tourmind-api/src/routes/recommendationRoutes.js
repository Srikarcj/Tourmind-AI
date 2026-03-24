import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { trackEvent } from "../services/analyticsService.js";
import {
  getPersonalizedRecommendations,
  getPreferenceBasedRecommendations
} from "../services/recommendationService.js";

const router = Router();

router.get("/recommendations", requireAuth, async (req, res, next) => {
  try {
    const tags = req.query.tags ? String(req.query.tags).split(",").map(tag => tag.trim()).filter(Boolean) : [];
    const limit = req.query.limit ? Number(req.query.limit) : 12;

    const data = await getPersonalizedRecommendations({
      userId: req.authUser.id,
      tags,
      limit
    });

    await trackEvent({
      userId: req.authUser.id,
      eventType: "recommendations_loaded",
      entityType: "recommendation_list",
      entityId: null,
      metadata: { tags, count: data.length }
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/recommendations", async (req, res, next) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map(tag => String(tag).trim()).filter(Boolean) : [];
    const interests = Array.isArray(req.body.interests)
      ? req.body.interests.map(tag => String(tag).trim()).filter(Boolean)
      : [];
    const budget = req.body.budget ? String(req.body.budget).trim() : "medium";
    const limit = req.body.limit ? Number(req.body.limit) : 12;

    const recommendations = await getPreferenceBasedRecommendations({
      tags,
      interests,
      budget,
      limit
    });

    return res.json({
      data: {
        recommendations,
        suggestedDurationDays: Math.max(2, Math.min(8, Math.round(recommendations.length / 2))),
        suggestedRoutePlaceIds: recommendations.slice(0, 8).map(item => item.id)
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
