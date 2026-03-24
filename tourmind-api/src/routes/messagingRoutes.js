import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { env } from "../config/env.js";
import { createNotification } from "../services/notificationService.js";
import { getBookingByIdDetails } from "../services/bookingService.js";
import { listBookingMessages, sendBookingMessage } from "../services/messagingService.js";

const router = Router();

const isAdminUser = authUser => (authUser?.email || "").toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

router.get("/bookings/:bookingId/messages", requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId || "").trim();

    if (!bookingId) {
      throw new ApiError(400, "bookingId is required.");
    }

    const data = await listBookingMessages({
      bookingId,
      authUser: req.authUser,
      isAdmin: isAdminUser(req.authUser)
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/bookings/:bookingId/messages", requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId || "").trim();
    const message = String(req.body.message || "").trim();

    if (!bookingId) {
      throw new ApiError(400, "bookingId is required.");
    }

    if (!message) {
      throw new ApiError(400, "message is required.");
    }

    const senderRole = isAdminUser(req.authUser) ? "admin" : "user";

    const data = await sendBookingMessage({
      bookingId,
      authUser: req.authUser,
      senderRole,
      message,
      isAdmin: isAdminUser(req.authUser)
    });

    const booking = await getBookingByIdDetails(bookingId);

    if (booking) {
      const notifyUserId = senderRole === "admin" ? booking.userId : null;

      if (notifyUserId) {
        createNotification({
          userId: notifyUserId,
          type: "booking_message",
          title: "New booking message",
          message: `New update on booking ${booking.id}.`,
          data: { bookingId: booking.id }
        }).catch(() => undefined);
      }
    }

    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
