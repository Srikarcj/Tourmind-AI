import { Router } from "express";
import { estimateTripBudget } from "../services/advancedTravelService.js";

const router = Router();

router.post("/budget/estimate", async (req, res, next) => {
  try {
    const days = Number(req.body.days);

    if (!Number.isFinite(days) || days <= 0 || days > 20) {
      return res.status(400).json({ message: "days must be between 1 and 20." });
    }

    const data = estimateTripBudget({
      days,
      budget: req.body.budget ? String(req.body.budget) : "",
      budgetType: req.body.budgetType ? String(req.body.budgetType) : "",
      travelType: req.body.travelType ? String(req.body.travelType) : "solo",
      distanceKm: req.body.distanceKm ? Number(req.body.distanceKm) : 0,
      location: req.body.location ? String(req.body.location) : ""
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
