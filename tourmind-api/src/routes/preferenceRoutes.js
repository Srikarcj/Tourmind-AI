import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getUserPreferences,
  listRecentlyViewedPlaces,
  listSavedItineraries,
  listSavedPlaces,
  saveItinerary,
  savePlace,
  trackRecentlyViewedPlace,
  unsavePlace,
  upsertUserPreferences
} from "../services/preferenceService.js";
import { trackEvent } from "../services/analyticsService.js";

const router = Router();

router.get("/preferences", requireAuth, async (req, res, next) => {
  try {
    const data = await getUserPreferences(req.authUser.id);
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.put("/preferences", requireAuth, async (req, res, next) => {
  try {
    const interests = Array.isArray(req.body.interests) ? req.body.interests.map(item => String(item).trim()).filter(Boolean) : [];

    const data = await upsertUserPreferences({
      userId: req.authUser.id,
      budget: req.body.budget ? String(req.body.budget).trim() : "",
      weatherPreference: req.body.weatherPreference ? String(req.body.weatherPreference).trim() : "",
      travelStyle: req.body.travelStyle ? String(req.body.travelStyle).trim() : "",
      interests
    });

    await trackEvent({
      userId: req.authUser.id,
      eventType: "preferences_updated",
      entityType: "user_preferences",
      metadata: { interestCount: interests.length }
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/saved-places", requireAuth, async (req, res, next) => {
  try {
    const data = await listSavedPlaces(req.authUser.id);
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/saved-places", requireAuth, async (req, res, next) => {
  try {
    const placeId = String(req.body.placeId || "").trim();

    if (!placeId) {
      throw new ApiError(400, "placeId is required.");
    }

    const data = await savePlace({ userId: req.authUser.id, placeId });

    await trackEvent({
      userId: req.authUser.id,
      eventType: "place_saved",
      entityType: "place",
      entityId: placeId
    });

    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
});

router.delete("/saved-places/:placeId", requireAuth, async (req, res, next) => {
  try {
    const placeId = String(req.params.placeId || "").trim();

    if (!placeId) {
      throw new ApiError(400, "placeId is required.");
    }

    const data = await unsavePlace({ userId: req.authUser.id, placeId });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/places/:placeId/viewed", requireAuth, async (req, res, next) => {
  try {
    const placeId = String(req.params.placeId || "").trim();

    if (!placeId) {
      throw new ApiError(400, "placeId is required.");
    }

    const data = await trackRecentlyViewedPlace({
      userId: req.authUser.id,
      placeId
    });

    await trackEvent({
      userId: req.authUser.id,
      eventType: "place_view",
      entityType: "place",
      entityId: placeId
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/recently-viewed", requireAuth, async (req, res, next) => {
  try {
    const data = await listRecentlyViewedPlaces({
      userId: req.authUser.id,
      limit: req.query.limit ? Number(req.query.limit) : 20
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/saved-itineraries", requireAuth, async (req, res, next) => {
  try {
    const data = await listSavedItineraries(req.authUser.id);
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/saved-itineraries", requireAuth, async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();

    if (!title) {
      throw new ApiError(400, "title is required.");
    }

    if (!req.body.itinerary || typeof req.body.itinerary !== "object") {
      throw new ApiError(400, "itinerary object is required.");
    }

    const data = await saveItinerary({
      userId: req.authUser.id,
      title,
      itinerary: req.body.itinerary
    });

    await trackEvent({
      userId: req.authUser.id,
      eventType: "itinerary_saved",
      entityType: "itinerary",
      entityId: data.id
    });

    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
