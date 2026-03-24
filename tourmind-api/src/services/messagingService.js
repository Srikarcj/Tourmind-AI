import { ApiError } from "../lib/apiError.js";
import { dbQuery, isDbEnabled } from "../lib/db.js";

const mapMessage = row => ({
  id: row.id,
  bookingId: row.booking_id,
  senderId: row.sender_id,
  senderRole: row.sender_role,
  message: row.message,
  createdAt: row.created_at
});

const getBookingOwner = async bookingId => {
  const result = await dbQuery(
    `
    SELECT user_id
    FROM bookings
    WHERE id = $1::uuid
      AND deleted_at IS NULL
    LIMIT 1
    `,
    [bookingId]
  );

  return result.rows[0]?.user_id || null;
};

export const listBookingMessages = async ({ bookingId, authUser, isAdmin }) => {
  if (!isDbEnabled) {
    return [];
  }

  const bookingOwner = await getBookingOwner(bookingId);

  if (!bookingOwner) {
    throw new ApiError(404, "Booking not found.");
  }

  if (!isAdmin && bookingOwner !== authUser.id) {
    throw new ApiError(403, "Not allowed to read this booking chat.");
  }

  const result = await dbQuery(
    `
    SELECT id, booking_id, sender_id, sender_role, message, created_at
    FROM booking_messages
    WHERE booking_id = $1::uuid
    ORDER BY created_at ASC
    `,
    [bookingId]
  );

  return result.rows.map(mapMessage);
};

export const sendBookingMessage = async ({ bookingId, authUser, senderRole, message, isAdmin }) => {
  if (!isDbEnabled) {
    return {
      id: `local-${Date.now()}`,
      bookingId,
      senderId: authUser.id,
      senderRole,
      message,
      createdAt: new Date().toISOString()
    };
  }

  const bookingOwner = await getBookingOwner(bookingId);

  if (!bookingOwner) {
    throw new ApiError(404, "Booking not found.");
  }

  if (!isAdmin && bookingOwner !== authUser.id) {
    throw new ApiError(403, "Not allowed to post to this booking chat.");
  }

  const result = await dbQuery(
    `
    INSERT INTO booking_messages (booking_id, sender_id, sender_role, message)
    VALUES ($1::uuid, $2::uuid, $3, $4)
    RETURNING id, booking_id, sender_id, sender_role, message, created_at
    `,
    [bookingId, authUser.id, senderRole, message]
  );

  return mapMessage(result.rows[0]);
};
