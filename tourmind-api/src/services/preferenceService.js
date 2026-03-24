import { dbQuery, isDbEnabled } from "../lib/db.js";

const mapPreferences = row => ({
  userId: row.user_id,
  budget: row.budget,
  weatherPreference: row.weather_preference,
  travelStyle: row.travel_style,
  interests: row.interests,
  updatedAt: row.updated_at
});

export const getUserPreferences = async userId => {
  if (!isDbEnabled) {
    return {
      userId,
      budget: null,
      weatherPreference: null,
      travelStyle: null,
      interests: [],
      updatedAt: null
    };
  }

  const result = await dbQuery(
    `
    SELECT *
    FROM user_preferences
    WHERE user_id = $1::uuid
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]
    ? mapPreferences(result.rows[0])
    : {
        userId,
        budget: null,
        weatherPreference: null,
        travelStyle: null,
        interests: [],
        updatedAt: null
      };
};

export const upsertUserPreferences = async ({ userId, budget, weatherPreference, travelStyle, interests }) => {
  if (!isDbEnabled) {
    return {
      userId,
      budget: budget || null,
      weatherPreference: weatherPreference || null,
      travelStyle: travelStyle || null,
      interests: Array.isArray(interests) ? interests : [],
      updatedAt: new Date().toISOString()
    };
  }

  const result = await dbQuery(
    `
    INSERT INTO user_preferences (user_id, budget, weather_preference, travel_style, interests, updated_at)
    VALUES ($1::uuid, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      budget = EXCLUDED.budget,
      weather_preference = EXCLUDED.weather_preference,
      travel_style = EXCLUDED.travel_style,
      interests = EXCLUDED.interests,
      updated_at = NOW()
    RETURNING *
    `,
    [userId, budget || null, weatherPreference || null, travelStyle || null, JSON.stringify(Array.isArray(interests) ? interests : [])]
  );

  return mapPreferences(result.rows[0]);
};

export const savePlace = async ({ userId, placeId }) => {
  if (!isDbEnabled) {
    return { userId, placeId, createdAt: new Date().toISOString() };
  }

  const result = await dbQuery(
    `
    INSERT INTO saved_places (user_id, place_id, deleted_at)
    VALUES ($1::uuid, $2, NULL)
    ON CONFLICT (user_id, place_id)
    DO UPDATE SET deleted_at = NULL
    RETURNING id, user_id, place_id, created_at
    `,
    [userId, placeId]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    createdAt: row.created_at
  };
};

export const unsavePlace = async ({ userId, placeId }) => {
  if (!isDbEnabled) {
    return { success: true };
  }

  await dbQuery(
    `
    UPDATE saved_places
    SET deleted_at = NOW()
    WHERE user_id = $1::uuid
      AND place_id = $2
    `,
    [userId, placeId]
  );

  return { success: true };
};

export const listSavedPlaces = async userId => {
  if (!isDbEnabled) {
    return [];
  }

  const result = await dbQuery(
    `
    SELECT id, user_id, place_id, created_at
    FROM saved_places
    WHERE user_id = $1::uuid
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    createdAt: row.created_at
  }));
};

export const trackRecentlyViewedPlace = async ({ userId, placeId }) => {
  if (!isDbEnabled) {
    return { userId, placeId, viewedAt: new Date().toISOString() };
  }

  const result = await dbQuery(
    `
    INSERT INTO recently_viewed_places (user_id, place_id, viewed_at)
    VALUES ($1::uuid, $2, NOW())
    ON CONFLICT (user_id, place_id)
    DO UPDATE SET viewed_at = NOW()
    RETURNING user_id, place_id, viewed_at
    `,
    [userId, placeId]
  );

  const row = result.rows[0];
  return {
    userId: row.user_id,
    placeId: row.place_id,
    viewedAt: row.viewed_at
  };
};

export const listRecentlyViewedPlaces = async ({ userId, limit = 20 }) => {
  if (!isDbEnabled) {
    return [];
  }

  const result = await dbQuery(
    `
    SELECT user_id, place_id, viewed_at
    FROM recently_viewed_places
    WHERE user_id = $1::uuid
    ORDER BY viewed_at DESC
    LIMIT $2
    `,
    [userId, Math.max(1, Math.min(limit, 50))]
  );

  return result.rows.map(row => ({
    userId: row.user_id,
    placeId: row.place_id,
    viewedAt: row.viewed_at
  }));
};

export const saveItinerary = async ({ userId, title, itinerary }) => {
  if (!isDbEnabled) {
    return {
      id: `local-${Date.now()}`,
      userId,
      title,
      itinerary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const result = await dbQuery(
    `
    INSERT INTO saved_itineraries (user_id, title, itinerary)
    VALUES ($1::uuid, $2, $3::jsonb)
    RETURNING id, user_id, title, itinerary, created_at, updated_at
    `,
    [userId, title, JSON.stringify(itinerary)]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    itinerary: row.itinerary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const listSavedItineraries = async userId => {
  if (!isDbEnabled) {
    return [];
  }

  const result = await dbQuery(
    `
    SELECT id, user_id, title, itinerary, created_at, updated_at
    FROM saved_itineraries
    WHERE user_id = $1::uuid
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    `,
    [userId]
  );

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    itinerary: row.itinerary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
};
