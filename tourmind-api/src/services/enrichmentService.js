import crypto from "node:crypto";
import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { dbQuery, isDbEnabled } from "../lib/db.js";
import {
  inferEstimatedCostRange,
  inferPlaceTags,
  inferPopularityScore,
  inferSeasonalScore
} from "../lib/placeIntelligence.js";
import { getNearbyPlaces } from "./dataService.js";
import { geocodeLocation } from "./geocodeService.js";

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const memoryEnrichmentCache = new Map();
const discoveredPlacesMemory = new Map();

const slugify = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";

const hashShort = value => crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 8);

const isMissingSchemaError = error => ["42P01", "42703"].includes(String(error?.code || ""));

const mergeUniqueStrings = (...groups) => {
  const seen = new Set();
  const result = [];

  groups.flat().forEach(item => {
    const value = String(item || "").trim();
    if (!value) {
      return;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(value);
  });

  return result;
};

const fetchOsmDetails = async ({ name, stateName, coordinates }) => {
  try {
    if (Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng))) {
      const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
      reverseUrl.searchParams.set("format", "json");
      reverseUrl.searchParams.set("lat", String(coordinates.lat));
      reverseUrl.searchParams.set("lon", String(coordinates.lng));
      reverseUrl.searchParams.set("addressdetails", "1");

      const response = await fetch(reverseUrl, {
        headers: {
          "User-Agent": "TourMindAI/1.0 (Educational MVP)",
          Accept: "application/json"
        }
      });

      if (response.ok) {
        const payload = await response.json();
        return {
          displayName: payload.display_name || "",
          type: payload.type || "",
          className: payload.class || "",
          source: "osm-reverse"
        };
      }
    }

    const query = `${name}, ${stateName}, India`;
    const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("limit", "1");

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "TourMindAI/1.0 (Educational MVP)",
        Accept: "application/json"
      }
    });

    if (!searchResponse.ok) {
      return null;
    }

    const list = await searchResponse.json();
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }

    return {
      displayName: list[0].display_name || "",
      type: list[0].type || "",
      className: list[0].class || "",
      source: "osm-search"
    };
  } catch (_error) {
    return null;
  }
};

const fetchWikipediaSummary = async ({ name, stateName }) => {
  const candidates = [`${name}, ${stateName}`, name];

  for (const title of candidates) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TourMindAI/1.0 (Educational MVP)",
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      if (payload?.extract) {
        return {
          title: payload.title || title,
          extract: payload.extract,
          url: payload?.content_urls?.desktop?.page || ""
        };
      }
    } catch (_error) {
      // continue to next candidate
    }
  }

  return null;
};

const generateAIFallbackDetails = async ({ name, stateName, category }) => {
  if (!groq) {
    return null;
  }

  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: env.GROQ_MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an India travel data enrichment assistant. Return JSON only with keys: description, travelTips (array), nearbyPlaces (array), itinerarySuggestions (array)."
          },
          {
            role: "user",
            content: JSON.stringify({ name, stateName, category })
          }
        ]
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2200))
    ]);

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);
    return {
      description: String(parsed.description || ""),
      travelTips: Array.isArray(parsed.travelTips) ? parsed.travelTips.map(item => String(item)) : [],
      nearbyPlaces: Array.isArray(parsed.nearbyPlaces) ? parsed.nearbyPlaces.map(item => String(item)) : [],
      itinerarySuggestions: Array.isArray(parsed.itinerarySuggestions)
        ? parsed.itinerarySuggestions.map(item => String(item))
        : []
    };
  } catch (_error) {
    return null;
  }
};

const readEnrichmentCache = async placeId => {
  if (!placeId) {
    return null;
  }

  const memory = memoryEnrichmentCache.get(placeId);
  if (memory && Date.now() - memory.refreshedAt < CACHE_TTL_MS) {
    return memory.payload;
  }

  if (!isDbEnabled) {
    return null;
  }

  try {
    const result = await dbQuery(
      `
      SELECT merged_payload, refreshed_at
      FROM place_enrichment_cache
      WHERE place_id = $1
      LIMIT 1
      `,
      [placeId]
    );

    if (!result.rows[0]) {
      return null;
    }

    const refreshedAt = new Date(result.rows[0].refreshed_at).getTime();
    if (Date.now() - refreshedAt > CACHE_TTL_MS) {
      return null;
    }

    memoryEnrichmentCache.set(placeId, {
      refreshedAt,
      payload: result.rows[0].merged_payload
    });

    return result.rows[0].merged_payload;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return null;
    }
    throw error;
  }
};

const writeEnrichmentCache = async ({ placeId, sourcePayload, mergedPayload }) => {
  if (!placeId) {
    return;
  }

  const now = Date.now();
  memoryEnrichmentCache.set(placeId, {
    refreshedAt: now,
    payload: mergedPayload
  });

  if (!isDbEnabled) {
    return;
  }

  try {
    await dbQuery(
      `
      INSERT INTO place_enrichment_cache (place_id, source_payload, merged_payload, refreshed_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (place_id)
      DO UPDATE SET
        source_payload = EXCLUDED.source_payload,
        merged_payload = EXCLUDED.merged_payload,
        refreshed_at = NOW()
      `,
      [placeId, JSON.stringify(sourcePayload || {}), JSON.stringify(mergedPayload || {})]
    );
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return;
    }
    throw error;
  }
};

export const getEnrichedPlace = async (place, { forceRefresh = false } = {}) => {
  const placeId = String(place?.id || "").trim();

  if (!forceRefresh) {
    const cached = await readEnrichmentCache(placeId);
    if (cached && typeof cached === "object") {
      return {
        ...place,
        ...cached
      };
    }
  }

  const [osm, wikipedia, aiFallback, nearby] = await Promise.all([
    fetchOsmDetails({
      name: place.name,
      stateName: place.stateName,
      coordinates: place.coordinates
    }),
    fetchWikipediaSummary({
      name: place.name,
      stateName: place.stateName
    }),
    generateAIFallbackDetails({
      name: place.name,
      stateName: place.stateName,
      category: place.category
    }),
    Number.isFinite(Number(place?.coordinates?.lat)) && Number.isFinite(Number(place?.coordinates?.lng))
      ? getNearbyPlaces({
          lat: Number(place.coordinates.lat),
          lng: Number(place.coordinates.lng),
          radiusKm: 120,
          limit: 5,
          excludeId: place.id
        })
      : []
  ]);

  const mergedPayload = {
    districtName: place.districtName || "Unknown",
    fullDescription:
      wikipedia?.extract ||
      aiFallback?.description ||
      place.fullDescription,
    nearbyPlaces: mergeUniqueStrings(
      place.nearbyPlaces || [],
      nearby.map(item => item.name),
      aiFallback?.nearbyPlaces || []
    ).slice(0, 10),
    travelTips: mergeUniqueStrings(
      place.travelTips || [],
      aiFallback?.travelTips || [],
      osm?.displayName ? [`Verify local details around ${osm.displayName}.`] : []
    ).slice(0, 10),
    itinerarySuggestions: mergeUniqueStrings(
      aiFallback?.itinerarySuggestions || [],
      [
        `Morning: Visit ${place.name}`,
        `Afternoon: Explore nearby highlights in ${place.stateName}`,
        "Evening: Local food walk and relaxed city tour"
      ]
    ).slice(0, 6),
    tags: Array.isArray(place.tags) ? place.tags : inferPlaceTags(place),
    popularityScore: Number(place.popularityScore || inferPopularityScore(place)),
    seasonalScore: Number(place.seasonalScore || inferSeasonalScore(place.bestTimeToVisit)),
    estimatedCostRange: String(place.estimatedCostRange || inferEstimatedCostRange(place)),
    enriched: {
      source: [osm?.source, wikipedia ? "wikipedia" : "", aiFallback ? "ai-fallback" : ""]
        .filter(Boolean)
        .join(", "),
      wikipediaUrl: wikipedia?.url || "",
      osmDisplayName: osm?.displayName || "",
      refreshedAt: new Date().toISOString()
    }
  };

  await writeEnrichmentCache({
    placeId,
    sourcePayload: {
      osm,
      wikipedia,
      nearby
    },
    mergedPayload
  });

  return {
    ...place,
    ...mergedPayload
  };
};

const upsertDistrictForDiscovery = async (stateCode, districtName) => {
  if (!isDbEnabled) {
    return null;
  }

  try {
    const result = await dbQuery(
      `
      INSERT INTO districts (state_code, slug, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (state_code, slug)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
      `,
      [stateCode, slugify(districtName), districtName]
    );

    return result.rows[0]?.id || null;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return null;
    }
    throw error;
  }
};

const persistDiscoveryLog = async ({ query, stateCode, placeId, source }) => {
  if (!isDbEnabled) {
    return;
  }

  try {
    await dbQuery(
      `
      INSERT INTO place_discovery_log (query, state_code, place_id, source)
      VALUES ($1, $2, $3, $4)
      `,
      [query, stateCode || null, placeId || null, source || "api"]
    );
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return;
    }
    throw error;
  }
};

export const discoverUnknownPlaceForState = async ({ state, query }) => {
  const cleanQuery = String(query || "").trim();
  if (!state || !cleanQuery) {
    return null;
  }

  const geocoded =
    (await geocodeLocation(`${cleanQuery}, ${state.name}, India`)) ||
    (await geocodeLocation(cleanQuery));

  if (!geocoded) {
    return null;
  }

  const districtName = `${state.name} Central`;
  const placeId = `${slugify(cleanQuery)}-${hashShort(`${state.code}-${cleanQuery}`)}`;

  const basePlace = {
    id: placeId,
    stateCode: state.code,
    stateName: state.name,
    stateSlug: state.slug,
    districtName,
    name: cleanQuery,
    category: "General",
    shortDescription: `${cleanQuery} in ${state.name} is now added as a discovered destination.`,
    fullDescription: `${cleanQuery} is a discovered place in ${state.name}.`,
    bestTimeToVisit: "October to March",
    nearbyPlaces: [],
    travelTips: [
      "Confirm local timings before travel.",
      "Use local transport for better flexibility."
    ],
    coordinates: {
      lat: Number(geocoded.lat),
      lng: Number(geocoded.lng)
    },
    tags: inferPlaceTags({ name: cleanQuery, category: "General" }),
    popularityScore: inferPopularityScore({ id: placeId, name: cleanQuery }),
    seasonalScore: inferSeasonalScore("October to March"),
    estimatedCostRange: "medium"
  };

  const enrichedPlace = await getEnrichedPlace(basePlace, { forceRefresh: true });

  if (isDbEnabled) {
    const districtId = await upsertDistrictForDiscovery(state.code, districtName);

    try {
      await dbQuery(
        `
        INSERT INTO places (
          id,
          state_code,
          district_id,
          district_name,
          name,
          category,
          short_description,
          full_description,
          best_time,
          nearby_places,
          travel_tips,
          tags,
          popularity_score,
          seasonal_score,
          estimated_cost_range,
          source,
          is_ai_generated,
          discovered_at,
          lat,
          lng
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, NOW(), $18, $19)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          short_description = EXCLUDED.short_description,
          full_description = EXCLUDED.full_description,
          best_time = EXCLUDED.best_time,
          nearby_places = EXCLUDED.nearby_places,
          travel_tips = EXCLUDED.travel_tips,
          tags = EXCLUDED.tags,
          popularity_score = EXCLUDED.popularity_score,
          seasonal_score = EXCLUDED.seasonal_score,
          estimated_cost_range = EXCLUDED.estimated_cost_range,
          district_id = EXCLUDED.district_id,
          district_name = EXCLUDED.district_name,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          discovered_at = NOW()
        `,
        [
          enrichedPlace.id,
          state.code,
          districtId,
          districtName,
          enrichedPlace.name,
          enrichedPlace.category,
          enrichedPlace.shortDescription,
          enrichedPlace.fullDescription,
          enrichedPlace.bestTimeToVisit,
          JSON.stringify(enrichedPlace.nearbyPlaces || []),
          JSON.stringify(enrichedPlace.travelTips || []),
          JSON.stringify(enrichedPlace.tags || []),
          Number(enrichedPlace.popularityScore || 1),
          Number(enrichedPlace.seasonalScore || 1),
          enrichedPlace.estimatedCostRange || "medium",
          "discovered",
          true,
          enrichedPlace.coordinates.lat,
          enrichedPlace.coordinates.lng
        ]
      );
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error;
      }
    }
  }

  const stateKey = String(state.slug || state.code).toLowerCase();
  const current = discoveredPlacesMemory.get(stateKey) || [];
  discoveredPlacesMemory.set(stateKey, [enrichedPlace, ...current.filter(item => item.id !== enrichedPlace.id)].slice(0, 50));

  await persistDiscoveryLog({
    query: cleanQuery,
    stateCode: state.code,
    placeId: enrichedPlace.id,
    source: "discover-endpoint"
  });

  return enrichedPlace;
};

export const listDiscoveredPlacesByState = stateKey =>
  discoveredPlacesMemory.get(String(stateKey || "").toLowerCase()) || [];


export const getDiscoveredPlaceById = placeId => {
  const targetId = String(placeId || '').trim();
  if (!targetId) {
    return null;
  }

  for (const places of discoveredPlacesMemory.values()) {
    const match = places.find(item => item.id === targetId);
    if (match) {
      return match;
    }
  }

  return null;
};
