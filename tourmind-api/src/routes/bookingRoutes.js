import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { fireAndForget } from "../lib/asyncTask.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireDatabase } from "../middleware/requireDatabase.js";
import {
  createBooking,
  getAllBookings,
  getBookableServices,
  getBookingByIdDetails,
  getBookingHistory,
  getUserBookings,
  softDeleteBooking,
  updateBookingNotes,
  updateBookingStatus
} from "../services/bookingService.js";
import {
  sendBookingCreatedNotifications,
  sendBookingStatusNotification
} from "../services/emailService.js";
import { env } from "../config/env.js";
import { createNotification } from "../services/notificationService.js";

const router = Router();

const parseDate = value => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
};

const validateBookingPayload = body => {
  const serviceId = String(body.serviceId || "").trim();
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const guests = Number(body.guests);
  const userNote = body.userNote ? String(body.userNote).trim() : "";

  if (!serviceId) {
    throw new ApiError(400, "serviceId is required.");
  }

  if (!startDate || !endDate) {
    throw new ApiError(400, "startDate and endDate must be valid YYYY-MM-DD values.");
  }

  if (endDate < startDate) {
    throw new ApiError(400, "endDate must be on or after startDate.");
  }

  if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
    throw new ApiError(400, "guests must be an integer between 1 and 20.");
  }

  return { serviceId, startDate, endDate, guests, userNote: userNote || null };
};

const isAdminUser = authUser => (authUser?.email || "").toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

const ensureBookingAccess = async (req, bookingId) => {
  const booking = await getBookingByIdDetails(bookingId);

  if (!booking || booking.deletedAt) {
    throw new ApiError(404, "Booking not found.");
  }

  if (!isAdminUser(req.authUser) && booking.userId !== req.authUser.id) {
    throw new ApiError(403, "Not allowed to access this booking.");
  }

  return booking;
};

router.get("/bookings/services", async (req, res, next) => {
  try {
    const type = req.query.type ? String(req.query.type).trim().toLowerCase() : "";

    if (type && !["hotel", "travel"].includes(type)) {
      throw new ApiError(400, "type must be either hotel or travel.");
    }

    const services = await getBookableServices(type || undefined);
    return res.json({ data: services });
  } catch (error) {
    return next(error);
  }
});

router.post("/bookings/create", requireDatabase, requireAuth, async (req, res, next) => {
  try {
    const payload = validateBookingPayload(req.body);

    const booking = await createBooking({
      userId: req.authUser.id,
      serviceId: payload.serviceId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      guests: payload.guests,
      userNote: payload.userNote
    });

    res.status(201).json({ data: booking });

    fireAndForget(
      sendBookingCreatedNotifications({
        booking,
        adminEmail: env.ADMIN_EMAIL
      })
    );

    fireAndForget(
      createNotification({
        userId: req.authUser.id,
        type: "booking_created",
        title: "Booking request submitted",
        message: `Your booking for ${booking.serviceName} is pending review.`,
        data: { bookingId: booking.id }
      })
    );

    return;
  } catch (error) {
    return next(error);
  }
});

router.get("/bookings/user", requireDatabase, requireAuth, async (req, res, next) => {
  try {
    const bookings = await getUserBookings(req.authUser.id);
    return res.json({ data: bookings });
  } catch (error) {
    return next(error);
  }
});

router.get("/bookings/admin", requireDatabase, requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const bookings = await getAllBookings();
    return res.json({ data: bookings });
  } catch (error) {
    return next(error);
  }
});

router.get("/bookings/:bookingId/history", requireDatabase, requireAuth, async (req, res, next) => {
  try {
    await ensureBookingAccess(req, req.params.bookingId);
    const timeline = await getBookingHistory(req.params.bookingId);
    return res.json({ data: timeline });
  } catch (error) {
    return next(error);
  }
});

router.patch("/bookings/notes", requireDatabase, requireAuth, async (req, res, next) => {
  try {
    const bookingId = String(req.body.bookingId || "").trim();
    const userNote = req.body.userNote !== undefined ? String(req.body.userNote || "").trim() : undefined;
    const adminNote = req.body.adminNote !== undefined ? String(req.body.adminNote || "").trim() : undefined;

    if (!bookingId) {
      throw new ApiError(400, "bookingId is required.");
    }

    const booking = await ensureBookingAccess(req, bookingId);

    if (!isAdminUser(req.authUser) && adminNote !== undefined) {
      throw new ApiError(403, "Only admin can update adminNote.");
    }

    if (!isAdminUser(req.authUser) && booking.userId !== req.authUser.id) {
      throw new ApiError(403, "Only booking owner can update user notes.");
    }

    const updated = await updateBookingNotes({
      bookingId,
      userNote,
      adminNote,
      updatedByEmail: req.authUser.email
    });

    return res.json({ data: updated });
  } catch (error) {
    return next(error);
  }
});

router.patch("/bookings/status", requireDatabase, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const bookingId = String(req.body.bookingId || "").trim();
    const status = String(req.body.status || "").trim().toLowerCase();
    const note = req.body.note ? String(req.body.note).trim() : "";

    if (!bookingId) {
      throw new ApiError(400, "bookingId is required.");
    }

    if (!["reviewed", "confirmed", "completed", "cancelled"].includes(status)) {
      throw new ApiError(400, "status must be reviewed, confirmed, completed, or cancelled.");
    }

    const booking = await updateBookingStatus({
      bookingId,
      status,
      note,
      adminEmail: req.authUser.email
    });

    res.json({ data: booking });

    fireAndForget(sendBookingStatusNotification({ booking }));

    fireAndForget(
      createNotification({
        userId: booking.userId,
        type: "booking_status",
        title: "Booking status updated",
        message: `Your booking ${booking.id} is now ${booking.status}.`,
        data: { bookingId: booking.id, status: booking.status }
      })
    );

    return;
  } catch (error) {
    return next(error);
  }
});

router.delete("/bookings/:bookingId", requireDatabase, requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const bookingId = String(req.params.bookingId || "").trim();

    if (!bookingId) {
      throw new ApiError(400, "bookingId is required.");
    }

    await softDeleteBooking({
      bookingId,
      deletedByEmail: req.authUser.email
    });

    return res.json({ data: { success: true } });
  } catch (error) {
    return next(error);
  }
});

export default router;


