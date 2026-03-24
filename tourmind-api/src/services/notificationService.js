import { dbQuery, isDbEnabled } from "../lib/db.js";

const mapNotification = row => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  message: row.message,
  data: row.data,
  isRead: row.is_read,
  createdAt: row.created_at,
  readAt: row.read_at
});

export const createNotification = async ({ userId, type, title, message, data = {} }) => {
  if (!isDbEnabled || !userId) {
    return null;
  }

  const result = await dbQuery(
    `
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
    RETURNING *
    `,
    [userId, type, title, message, JSON.stringify(data)]
  );

  return mapNotification(result.rows[0]);
};

export const listNotifications = async ({ userId, limit = 50 }) => {
  if (!isDbEnabled) {
    return [];
  }

  const result = await dbQuery(
    `
    SELECT *
    FROM notifications
    WHERE user_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, Math.max(1, Math.min(limit, 200))]
  );

  return result.rows.map(mapNotification);
};

export const markNotificationRead = async ({ id, userId }) => {
  if (!isDbEnabled) {
    return null;
  }

  const result = await dbQuery(
    `
    UPDATE notifications
    SET is_read = TRUE,
        read_at = NOW()
    WHERE id = $1::uuid
      AND user_id = $2::uuid
    RETURNING *
    `,
    [id, userId]
  );

  return result.rows[0] ? mapNotification(result.rows[0]) : null;
};
