import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { listNotifications, markNotificationRead } from "../services/notificationService.js";

const router = Router();

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const data = await listNotifications({
      userId: req.authUser.id,
      limit: req.query.limit ? Number(req.query.limit) : 50
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      throw new ApiError(400, "Notification id is required.");
    }

    const data = await markNotificationRead({
      id,
      userId: req.authUser.id
    });

    if (!data) {
      throw new ApiError(404, "Notification not found.");
    }

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
