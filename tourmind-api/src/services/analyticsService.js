import { dbQuery, isDbEnabled } from "../lib/db.js";

export const trackEvent = async ({ userId = null, eventType, entityType, entityId = null, metadata = {} }) => {
  if (!isDbEnabled) {
    return null;
  }

  await dbQuery(
    `
    INSERT INTO analytics_events (user_id, event_type, entity_type, entity_id, metadata)
    VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
    `,
    [userId, eventType, entityType, entityId, JSON.stringify(metadata)]
  );

  return { success: true };
};

export const getTrendingDestinations = async ({ limit = 8, days = 30 } = {}) => {
  if (!isDbEnabled) {
    return [];
  }

  const result = await dbQuery(
    `
    SELECT
      COALESCE(entity_id, metadata->>'placeId') AS place_id,
      COUNT(*)::int AS events
    FROM analytics_events
    WHERE event_type IN ('place_view', 'search_click', 'recommendation_click')
      AND created_at >= NOW() - ($1::text || ' days')::interval
    GROUP BY COALESCE(entity_id, metadata->>'placeId')
    HAVING COALESCE(entity_id, metadata->>'placeId') IS NOT NULL
    ORDER BY events DESC
    LIMIT $2
    `,
    [String(days), Math.max(1, Math.min(limit, 20))]
  );

  return result.rows.map(row => ({
    placeId: row.place_id,
    events: Number(row.events)
  }));
};

export const getAdminAnalytics = async () => {
  if (!isDbEnabled) {
    return {
      totals: {
        bookings: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        conversionRate: 0
      },
      popularDestinations: [],
      bookingsByStatus: [],
      recentEvents: []
    };
  }

  const [totalResult, statusResult, destinationResult, recentEventsResult] = await Promise.all([
    dbQuery(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
      FROM bookings
      WHERE deleted_at IS NULL
      `
    ),
    dbQuery(
      `
      SELECT status, COUNT(*)::int AS count
      FROM bookings
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY status ASC
      `
    ),
    dbQuery(
      `
      SELECT s.location, COUNT(*)::int AS bookings
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      WHERE b.deleted_at IS NULL
      GROUP BY s.location
      ORDER BY bookings DESC
      LIMIT 8
      `
    ),
    dbQuery(
      `
      SELECT id, user_id, event_type, entity_type, entity_id, metadata, created_at
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT 30
      `
    )
  ]);

  const totals = totalResult.rows[0] || { total: 0, confirmed: 0, cancelled: 0, completed: 0 };
  const conversionRate = totals.total > 0 ? Number(((totals.confirmed / totals.total) * 100).toFixed(1)) : 0;

  return {
    totals: {
      bookings: Number(totals.total),
      confirmed: Number(totals.confirmed),
      cancelled: Number(totals.cancelled),
      completed: Number(totals.completed),
      conversionRate
    },
    popularDestinations: destinationResult.rows.map(row => ({
      location: row.location,
      bookings: Number(row.bookings)
    })),
    bookingsByStatus: statusResult.rows.map(row => ({
      status: row.status,
      count: Number(row.count)
    })),
    recentEvents: recentEventsResult.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: row.created_at
    }))
  };
};
