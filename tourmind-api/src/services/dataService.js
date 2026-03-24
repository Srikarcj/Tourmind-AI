import { dbQuery, isDbEnabled } from "../lib/db.js";
import { flattenPlaces, getDataset } from "../lib/dataset.js";
import {
  inferEstimatedCostRange,
  inferPlaceTags,
  inferPopularityScore,
  inferSeasonalScore
} from "../lib/placeIntelligence.js";
import { haversineDistanceKm } from "../lib/math.js";

const isMissingSchemaError = error => ["42P01", "42703"].includes(String(error?.code || ""));

const isApiSource = source => String(source || "").toLowerCase().startsWith("api-");

const normalizePlace = row => ({
  id: row.id,
  name: row.name,
  category: row.category,
  shortDescription: row.short_description,
  fullDescription: row.full_description,
  bestTimeToVisit: row.best_time,
  nearbyPlaces: Array.isArray(row.nearby_places) ? row.nearby_places : [],
  travelTips: Array.isArray(row.travel_tips) ? row.travel_tips : [],
  coordinates: {
    lat: Number(row.lat),
    lng: Number(row.lng)
  },
  stateCode: row.state_code,
  stateName: row.state_name,
  stateSlug: row.state_slug,
  districtName: row.district_name || `${row.state_name || "Unknown"} Central`,
  tags: Array.isArray(row.tags) ? row.tags : inferPlaceTags(row),
  popularityScore: Number(row.popularity_score || inferPopularityScore(row)),
  seasonalScore: Number(row.seasonal_score || inferSeasonalScore(row.best_time)),
  estimatedCostRange: String(row.estimated_cost_range || inferEstimatedCostRange(row)),
  source: row.source || "seed",
  isAIGenerated: Boolean(row.is_ai_generated),
  discoveredAt: row.discovered_at || null
});

const normalizeJsonPlace = place => ({
  ...place,
  districtName: place.districtName || place.district || `${place.stateName || "Unknown"} Central`,
  nearbyPlaces: Array.isArray(place.nearbyPlaces) ? place.nearbyPlaces : [],
  travelTips: Array.isArray(place.travelTips) ? place.travelTips : [],
  tags: Array.isArray(place.tags) ? place.tags : inferPlaceTags(place),
  popularityScore: Number(place.popularityScore || inferPopularityScore(place)),
  seasonalScore: Number(place.seasonalScore || inferSeasonalScore(place.bestTimeToVisit)),
  estimatedCostRange: String(place.estimatedCostRange || inferEstimatedCostRange(place)),
  source: place.source || "seed",
  isAIGenerated: Boolean(place.isAIGenerated),
  discoveredAt: place.discoveredAt || null
});

const dedupePlaces = places => {
  const byKey = new Map();

  places.forEach(place => {
    if (!place || !place.id) {
      return;
    }

    const key = String(place.id).toLowerCase();
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, place);
      return;
    }

    byKey.set(key, {
      ...current,
      ...place,
      source: current.source === "seed" && place.source ? place.source : current.source
    });
  });

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const filterPlaces = (places, options = {}) => {
  const categoryFilter = String(options.category || "").trim().toLowerCase();
  const searchFilter = String(options.search || "").trim().toLowerCase();
  const sourceFilter = String(options.source || "hybrid").trim().toLowerCase();

  return places.filter(place => {
    const matchesCategory = categoryFilter ? String(place.category || "").toLowerCase() === categoryFilter : true;

    const matchesSearch = searchFilter
      ? String(place.name || "").toLowerCase().includes(searchFilter) ||
        String(place.shortDescription || "").toLowerCase().includes(searchFilter)
      : true;

    const matchesSource =
      sourceFilter === "api"
        ? isApiSource(place.source)
        : sourceFilter === "manual"
          ? !isApiSource(place.source)
          : true;

    return matchesCategory && matchesSearch && matchesSource;
  });
};

const getJsonState = async slug => {
  const dataset = await getDataset();
  return dataset.states.find(state => state.slug === slug) || null;
};

const getJsonPlacesByState = async slug => {
  const state = await getJsonState(slug);
  if (!state) {
    return [];
  }

  return state.places.map(place =>
    normalizeJsonPlace({
      ...place,
      stateCode: state.code,
      stateName: state.name,
      stateSlug: state.slug
    })
  );
};

const getDbPlacesByState = async slug => {
  if (!isDbEnabled) {
    return [];
  }

  try {
    const result = await dbQuery(
      `
      SELECT
        p.*,
        s.name AS state_name,
        s.slug AS state_slug
      FROM places p
      JOIN states s ON s.code = p.state_code
      WHERE s.slug = $1
      ORDER BY p.name ASC
      `,
      [slug]
    );

    return result.rows.map(normalizePlace);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
};

export const getStates = async () => {
  const dataset = await getDataset();
  const jsonSummaries = dataset.states
    .map(state => ({
      code: state.code,
      slug: state.slug,
      name: state.name,
      placeCount: state.places.length
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!isDbEnabled) {
    return jsonSummaries;
  }

  try {
    const result = await dbQuery(
      `
      SELECT s.code, s.slug, s.name, COUNT(p.id)::int AS place_count
      FROM states s
      LEFT JOIN places p ON p.state_code = s.code
      GROUP BY s.code, s.slug, s.name
      ORDER BY s.name ASC
      `
    );

    const byCode = new Map(jsonSummaries.map(state => [state.code, { ...state }]));

    result.rows.forEach(row => {
      const code = row.code;
      const existing = byCode.get(code);

      if (existing) {
        existing.placeCount = Math.max(existing.placeCount, Number(row.place_count || 0));
        return;
      }

      byCode.set(code, {
        code,
        slug: row.slug,
        name: row.name,
        placeCount: Number(row.place_count || 0)
      });
    });

    return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return jsonSummaries;
    }

    throw error;
  }
};

export const getStateBySlug = async slug => {
  if (isDbEnabled) {
    try {
      const result = await dbQuery("SELECT code, slug, name FROM states WHERE slug = $1", [slug]);
      if (result.rows[0]) {
        return result.rows[0];
      }
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error;
      }
    }
  }

  const state = await getJsonState(slug);
  if (!state) {
    return null;
  }

  return {
    code: state.code,
    slug: state.slug,
    name: state.name
  };
};

export const getDistrictsByState = async slug => {
  const places = await getPlacesByState(slug, { source: "hybrid" });
  const grouped = new Map();

  places.forEach(place => {
    const districtName = String(place.districtName || "").trim() || "Unknown";
    const districtSlug = districtName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const key = districtSlug || "unknown";
    const current = grouped.get(key);

    if (current) {
      current.placeCount += 1;
      return;
    }

    grouped.set(key, {
      id: null,
      slug: key,
      name: districtName,
      stateCode: place.stateCode,
      stateSlug: place.stateSlug,
      stateName: place.stateName,
      placeCount: 1
    });
  });

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const getPlacesByState = async (slug, options = {}) => {
  const [dbPlaces, jsonPlaces] = await Promise.all([
    getDbPlacesByState(slug),
    getJsonPlacesByState(slug)
  ]);

  const merged = dedupePlaces([...dbPlaces, ...jsonPlaces]);
  return filterPlaces(merged, options);
};

export const getPlaceById = async id => {
  const target = String(id || "").trim();
  if (!target) {
    return null;
  }

  if (isDbEnabled) {
    try {
      const result = await dbQuery(
        `
        SELECT
          p.*,
          s.name AS state_name,
          s.slug AS state_slug
        FROM places p
        JOIN states s ON s.code = p.state_code
        WHERE p.id = $1
        LIMIT 1
        `,
        [target]
      );

      if (result.rows[0]) {
        return normalizePlace(result.rows[0]);
      }
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error;
      }
    }
  }

  const dataset = await getDataset();
  const place = flattenPlaces(dataset.states).find(item => item.id === target);
  return place ? normalizeJsonPlace(place) : null;
};

export const getCategories = async () => {
  const places = await getAllPlacesDetailed();
  return [...new Set(places.map(place => place.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
};

export const getAllPlacesDetailed = async () => {
  const dataset = await getDataset();
  const jsonPlaces = flattenPlaces(dataset.states).map(normalizeJsonPlace);

  if (!isDbEnabled) {
    return dedupePlaces(jsonPlaces);
  }

  try {
    const result = await dbQuery(
      `
      SELECT
        p.*,
        s.name AS state_name,
        s.slug AS state_slug
      FROM places p
      JOIN states s ON s.code = p.state_code
      `
    );

    return dedupePlaces([...result.rows.map(normalizePlace), ...jsonPlaces]);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return dedupePlaces(jsonPlaces);
    }

    throw error;
  }
};

export const getNearbyPlaces = async ({ lat, lng, radiusKm = 200, limit = 5, excludeId = null }) => {
  const places = await getAllPlacesDetailed();

  return places
    .filter(place => (excludeId ? place.id !== excludeId : true))
    .map(place => ({
      ...place,
      distanceKm: haversineDistanceKm(lat, lng, place.coordinates.lat, place.coordinates.lng)
    }))
    .filter(place => place.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(place => ({
      id: place.id,
      name: place.name,
      stateName: place.stateName,
      category: place.category,
      distanceKm: Number(place.distanceKm.toFixed(1)),
      coordinates: place.coordinates,
      estimatedCostRange: place.estimatedCostRange,
      popularityScore: place.popularityScore,
      tags: place.tags
    }));
};
