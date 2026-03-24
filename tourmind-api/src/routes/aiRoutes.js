import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  chatWithAssistant,
  generateAdvancedTripPlan
} from "../services/advancedTravelService.js";
import { generateTripPlan } from "../services/aiService.js";
import { sendTripItineraryExportEmail } from "../services/emailService.js";

const router = Router();

const parseTripInput = body => {
  const location = String(body.location || "").trim();
  const days = Number(body.days);
  const budget = body.budget ? String(body.budget).trim() : "";
  const budgetType = body.budgetType ? String(body.budgetType).trim().toLowerCase() : "";
  const travelStyle = body.travelStyle ? String(body.travelStyle).trim().toLowerCase() : "";
  const travelType = body.travelType ? String(body.travelType).trim().toLowerCase() : "";
  const interests = Array.isArray(body.interests)
    ? body.interests.map(item => String(item).trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    location,
    days,
    budget,
    budgetType,
    travelStyle,
    travelType,
    interests
  };
};

const validateTripInput = ({ location, days }) => {
  if (!location) {
    return "Location is required.";
  }

  if (!Number.isInteger(days) || days <= 0 || days > 15) {
    return "Days must be an integer between 1 and 15.";
  }

  return "";
};

const handleTripGeneration = action => async (req, res, next) => {
  try {
    const parsed = parseTripInput(req.body);
    const validationError = validateTripInput(parsed);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const trip = await generateTripPlan({
      ...parsed,
      action
    });

    return res.json({ data: trip });
  } catch (error) {
    return next(error);
  }
};

router.post("/ai/generate-trip", handleTripGeneration("generate"));
router.post("/ai/regenerate-day", handleTripGeneration("regenerate_day"));
router.post("/ai/optimize-route", handleTripGeneration("optimize_route"));
router.post("/ai/shorten-trip", handleTripGeneration("shorten_trip"));

router.post("/ai/generate-trip-advanced", async (req, res, next) => {
  try {
    const parsed = parseTripInput(req.body);
    const validationError = validateTripInput(parsed);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const trip = await generateAdvancedTripPlan({
      location: parsed.location,
      days: parsed.days,
      budget: parsed.budget,
      budgetType: parsed.budgetType || parsed.budget,
      travelType: parsed.travelType || parsed.travelStyle || "solo",
      interests: parsed.interests
    });

    return res.json({ data: trip });
  } catch (error) {
    return next(error);
  }
});

router.post("/ai/chat", async (req, res, next) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      throw new ApiError(400, "message is required.");
    }

    const data = await chatWithAssistant({
      conversationId: req.body.conversationId ? String(req.body.conversationId).trim() : "",
      message
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/ai/export-email", requireAuth, async (req, res, next) => {
  try {
    const location = String(req.body.location || "").trim();
    const itinerary = req.body.itinerary;

    if (!location) {
      throw new ApiError(400, "location is required.");
    }

    if (!itinerary || typeof itinerary !== "object") {
      throw new ApiError(400, "itinerary object is required.");
    }

    await sendTripItineraryExportEmail({
      to: req.authUser.email,
      location,
      itinerary
    });

    return res.json({ data: { success: true } });
  } catch (error) {
    return next(error);
  }
});

export default router;
