import { ApiError } from "../lib/apiError.js";
import { dbQuery, isDbEnabled } from "../lib/db.js";
import { getServiceDataset } from "../lib/dataset.js";

const toBooking = row => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.user_email,
  userName: row.user_name,
  serviceId: row.service_id,
  serviceName: row.service_name,
  serviceType: row.service_type,
  serviceLocation: row.service_location,
  serviceContactInfo: row.service_contact_info,
  servicePriceRange: row.service_price_range,
  startDate: row.start_date,
  endDate: row.end_date,
  guests: row.guests,
  status: row.status,
  userNote: row.user_note,
  adminNote: row.admin_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  updatedByEmail: row.updated_by_email,
  deletedAt: row.deleted_at || null
});

export const BOOKING_STATUS_TRANSITIONS = {
  pending: new Set(["reviewed", "confirmed", "cancelled"]),
  reviewed: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["completed", "cancelled"]),
  completed: new Set([]),
  cancelled: new Set([])
};

const toService = row => ({
  id: row.id,
  name: row.name,
  location: row.location,
  priceRange: row.price_range,
  type: row.type,
  contactInfo: row.contact_info,
  createdAt: row.created_at
});

const toDatasetService = row => ({
  id: row.id,
  name: row.name,
  location: row.location,
  priceRange: row.priceRange,
  type: row.type,
  contactInfo: row.contactInfo,
  createdAt: new Date(0).toISOString()
});

const getFallbackServices = async type => {
  const dataset = await getServiceDataset();

  return dataset.services
    .filter(service => (type ? service.type === type : true))
    .map(toDatasetService)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const createHistoryEntry = async ({ bookingId, previousStatus, newStatus, note, changedByEmail, metadata = {} }) => {
  await dbQuery(
    `
    INSERT INTO booking_history (booking_id, previous_status, new_status, note, changed_by_email, metadata)
    VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
    `,
    [bookingId, previousStatus || null, newStatus, note || null, changedByEmail || null, JSON.stringify(metadata)]
  );
};

export const getBookableServices = async type => {
  const normalizedType = type ? String(type).trim().toLowerCase() : "";

  if (!isDbEnabled) {
    return getFallbackServices(normalizedType || undefined);
  }

  const values = [];
  const where = [];

  if (normalizedType) {
    values.push(normalizedType);
    where.push(`type = $${values.length}`);
  }

  try {
    const result = await dbQuery(
      `
      SELECT id, name, location, price_range, type, contact_info, created_at
      FROM services
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC, name ASC
      `,
      values
    );

    return result.rows.map(toService);
  } catch (error) {
    console.error("Failed to load services from database, using fallback dataset.", error);
    return getFallbackServices(normalizedType || undefined);
  }
};

const getServiceById = async serviceId => {
  const result = await dbQuery(
    `
    SELECT id, name, location, price_range, type, contact_info
    FROM services
    WHERE id = $1::uuid
    LIMIT 1
    `,
    [serviceId]
  );

  return result.rows[0] || null;
};

const getBookingById = async bookingId => {
  const result = await dbQuery(
    `
    SELECT
      b.*,
      u.email AS user_email,
      u.name AS user_name,
      s.name AS service_name,
      s.type AS service_type,
      s.location AS service_location,
      s.contact_info AS service_contact_info,
      s.price_range AS service_price_range
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN services s ON s.id = b.service_id
    WHERE b.id = $1::uuid
    LIMIT 1
    `,
    [bookingId]
  );

  return result.rows[0] ? toBooking(result.rows[0]) : null;
};

export const createBooking = async ({ userId, serviceId, startDate, endDate, guests, userNote }) => {
  const service = await getServiceById(serviceId);

  if (!service) {
    throw new ApiError(404, "Selected service does not exist.");
  }

  const insertResult = await dbQuery(
    `
    INSERT INTO bookings (user_id, service_id, start_date, end_date, guests, status, user_note)
    VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5, 'pending', $6)
    RETURNING id
    `,
    [userId, serviceId, startDate, endDate, guests, userNote || null]
  );

  const bookingId = insertResult.rows[0].id;

  await createHistoryEntry({
    bookingId,
    previousStatus: null,
    newStatus: "pending",
    note: userNote || "Booking created",
    changedByEmail: null,
    metadata: { source: "booking_create" }
  });

  const booking = await getBookingById(bookingId);

  if (!booking) {
    throw new ApiError(500, "Booking was created but could not be read back.");
  }

  return booking;
};

export const getUserBookings = async userId => {
  const result = await dbQuery(
    `
    SELECT
      b.*,
      u.email AS user_email,
      u.name AS user_name,
      s.name AS service_name,
      s.type AS service_type,
      s.location AS service_location,
      s.contact_info AS service_contact_info,
      s.price_range AS service_price_range
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN services s ON s.id = b.service_id
    WHERE b.user_id = $1::uuid AND b.deleted_at IS NULL
    ORDER BY b.created_at DESC
    `,
    [userId]
  );

  return result.rows.map(toBooking);
};

export const getAllBookings = async () => {
  const result = await dbQuery(
    `
    SELECT
      b.*,
      u.email AS user_email,
      u.name AS user_name,
      s.name AS service_name,
      s.type AS service_type,
      s.location AS service_location,
      s.contact_info AS service_contact_info,
      s.price_range AS service_price_range
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN services s ON s.id = b.service_id
    WHERE b.deleted_at IS NULL
    ORDER BY b.created_at DESC
    `
  );

  return result.rows.map(toBooking);
};

export const getBookingHistory = async bookingId => {
  const result = await dbQuery(
    `
    SELECT id, booking_id, previous_status, new_status, note, changed_by_email, metadata, created_at
    FROM booking_history
    WHERE booking_id = $1::uuid
    ORDER BY created_at ASC
    `,
    [bookingId]
  );

  return result.rows.map(row => ({
    id: row.id,
    bookingId: row.booking_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    note: row.note,
    changedByEmail: row.changed_by_email,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
};

export const updateBookingNotes = async ({ bookingId, userNote, adminNote, updatedByEmail }) => {
  const booking = await getBookingById(bookingId);

  if (!booking || booking.deletedAt) {
    throw new ApiError(404, "Booking not found.");
  }

  await dbQuery(
    `
    UPDATE bookings
    SET
      user_note = COALESCE($1, user_note),
      admin_note = COALESCE($2, admin_note),
      updated_at = NOW(),
      updated_by_email = $3
    WHERE id = $4::uuid
    `,
    [userNote ?? null, adminNote ?? null, updatedByEmail || null, bookingId]
  );

  await createHistoryEntry({
    bookingId,
    previousStatus: booking.status,
    newStatus: booking.status,
    note: "Booking notes updated",
    changedByEmail: updatedByEmail,
    metadata: {
      userNoteUpdated: userNote !== undefined,
      adminNoteUpdated: adminNote !== undefined
    }
  });

  const updated = await getBookingById(bookingId);

  if (!updated) {
    throw new ApiError(500, "Booking notes updated but could not be fetched.");
  }

  return updated;
};

export const updateBookingStatus = async ({ bookingId, status, adminEmail, note }) => {
  const current = await getBookingById(bookingId);

  if (!current || current.deletedAt) {
    throw new ApiError(404, "Booking not found.");
  }

  const allowed = BOOKING_STATUS_TRANSITIONS[current.status] || new Set();

  if (!allowed.has(status)) {
    throw new ApiError(
      400,
      `Invalid status transition from ${current.status} to ${status}.`
    );
  }

  await dbQuery(
    `
    UPDATE bookings
    SET
      status = $1,
      admin_note = COALESCE($2, admin_note),
      updated_at = NOW(),
      updated_by_email = $3
    WHERE id = $4::uuid
    `,
    [status, note || null, adminEmail, bookingId]
  );

  await createHistoryEntry({
    bookingId,
    previousStatus: current.status,
    newStatus: status,
    note: note || `Status changed to ${status}`,
    changedByEmail: adminEmail,
    metadata: { action: "status_update" }
  });

  const updated = await getBookingById(bookingId);

  if (!updated) {
    throw new ApiError(500, "Booking status updated but could not be fetched.");
  }

  return updated;
};

export const softDeleteBooking = async ({ bookingId, deletedByEmail }) => {
  const booking = await getBookingById(bookingId);

  if (!booking || booking.deletedAt) {
    throw new ApiError(404, "Booking not found.");
  }

  await dbQuery(
    `
    UPDATE bookings
    SET
      deleted_at = NOW(),
      updated_at = NOW(),
      updated_by_email = $1
    WHERE id = $2::uuid
    `,
    [deletedByEmail || null, bookingId]
  );

  await createHistoryEntry({
    bookingId,
    previousStatus: booking.status,
    newStatus: booking.status,
    note: "Booking soft deleted",
    changedByEmail: deletedByEmail,
    metadata: { action: "soft_delete" }
  });

  return { success: true };
};

export const getBookingByIdDetails = getBookingById;

