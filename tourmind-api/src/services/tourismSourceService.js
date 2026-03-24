import crypto from "node:crypto";
import { ApiError } from "../lib/apiError.js";
import {
  getApiCacheDataset,
  upsertApiPlacesByState,
  upsertManualPlacesByState
} from "../lib/dataset.js";
import {
  inferEstimatedCostRange,
  inferPlaceTags,
  inferPopularityScore,
  inferSeasonalScore
} from "../lib/placeIntelligence.js";
import { withRetry } from "../utils/retry.js";
import { geocodeLocation } from "./geocodeService.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const API_SYNC_TTL_MS = 6 * 60 * 60 * 1000;

const syncMemory = new Map();

const slugify = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";

const hashShort = value => crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 8);

const toStringList = value =>
  Array.isArray(value)
    ? value.map(item => String(item || "").trim()).filter(Boolean)
    : [];

const getDistrictFromDisplayName = (displayName, stateName) => {
  const parts = String(displayName || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const maybeDistrict = parts.find(part =>
    /district|city|tehsil|taluk|division/i.test(part)
  );

  if (maybeDistrict) {
    return maybeDistrict;
  }

  const fallback = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (fallback && !/india/i.test(fallback) && !new RegExp(stateName, "i").test(fallback)) {
    return `${fallback} District`;
  }

  return `${stateName} Central`;
};

const guessCategory = ({ name, type, className }) => {
  const raw = `${name} ${type} ${className}`.toLowerCase();

  if (/temple|mandir|mosque|dargah|church|gurudwara|monastery/.test(raw)) {
    return "Temple";
  }

  if (/beach|coast|seashore/.test(raw)) {
    return "Beach";
  }

  if (/fort|palace|museum|monument|archaeological|heritage|tomb|castle|memorial/.test(raw)) {
    return "Historical";
  }

  if (/national park|wildlife|sanctuary|zoo/.test(raw)) {
    return "Wildlife";
  }

  if (/waterfall|falls|cave|valley|lake|dam|park|garden|peak|hill|island/.test(raw)) {
    return "Nature";
  }

  return "General";
};

const normalizeExternalPlace = ({ state, item }) => {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const name = String(item?.display_name || item?.name || "").split(",")[0].trim();
  if (!name) {
    return null;
  }

  const category = guessCategory({
    name,
    type: String(item?.type || ""),
    className: String(item?.class || "")
  });

  const id = `api-${slugify(name)}-${hashShort(`${state.code}-${lat.toFixed(4)}-${lng.toFixed(4)}`)}`;
  const districtName = getDistrictFromDisplayName(item.display_name, state.name);
  const bestTimeToVisit = category === "Hill" ? "March to June and September to November" : "October to March";

  const place = {
    id,
    name,
    category,
    shortDescription: `${name} is a notable tourist attraction in ${state.name}.`,
    fullDescription: `${name} is a tourism place in ${state.name} discovered from open map data and merged into TourMind's catalog.`,
    bestTimeToVisit,
    nearbyPlaces: [],
    travelTips: [
      "Verify local opening hours before your visit.",
      "Use local transport options for flexible travel.",
      "Check weather and crowd levels before planning."
    ],
    coordinates: { lat, lng },
    stateCode: state.code,
    stateSlug: state.slug,
    stateName: state.name,
    districtName,
    source: "api-osm",
    isAIGenerated: false,
    discoveredAt: new Date().toISOString()
  };

  return {
    ...place,
    tags: inferPlaceTags(place),
    popularityScore: inferPopularityScore(place),
    seasonalScore: inferSeasonalScore(bestTimeToVisit),
    estimatedCostRange: inferEstimatedCostRange(place)
  };
};

const dedupePlaces = places => {
  const byKey = new Map();

  places.forEach(place => {
    if (!place) {
      return;
    }

    const key = `${place.name.toLowerCase()}|${place.coordinates.lat.toFixed(3)}|${place.coordinates.lng.toFixed(3)}`;
    if (!byKey.has(key)) {
      byKey.set(key, place);
    }
  });

  return [...byKey.values()];
};

const searchNominatim = async (query, limit) =>
  withRetry(
    async () => {
      const url = new URL(NOMINATIM_BASE);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("countrycodes", "in");

      const response = await fetch(url, {
        headers: {
          "User-Agent": "TourMindAI/1.0 (Open Data Sync)",
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim request failed with status ${response.status}`);
      }

      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
    {
      retries: 2,
      delayMs: 500,
      shouldRetry: error => /failed|status 5\d\d|network/i.test(String(error?.message || ""))
    }
  );

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const buildQueriesForState = stateName => {
  const keywords = [
    "tourist attraction",
    "historical place",
    "temple",
    "fort",
    "museum",
    "waterfall",
    "hill station",
    "beach",
    "wildlife sanctuary",
    "lake"
  ];

  return keywords.map(keyword => `${keyword} in ${stateName}, India`);
};

const normalizeManualPlace = async ({ state, payload }) => {
  const name = String(payload?.name || "").trim();
  if (!name) {
    throw new ApiError(400, "name is required.");
  }

  const category = String(payload?.category || "General").trim() || "General";
  const bestTimeToVisit = String(payload?.bestTimeToVisit || "October to March").trim() || "October to March";

  let lat = Number(payload?.coordinates?.lat);
  let lng = Number(payload?.coordinates?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const geocoded = await geocodeLocation(`${name}, ${state.name}, India`);
    if (!geocoded) {
      throw new ApiError(400, "coordinates are required if geocoding fails.");
    }

    lat = Number(geocoded.lat);
    lng = Number(geocoded.lng);
  }

  const id = String(payload?.id || "").trim() || `manual-${slugify(name)}-${hashShort(`${state.code}-${lat}-${lng}`)}`;
  const districtName = String(payload?.districtName || "").trim() || `${state.name} Central`;

  const place = {
    id,
    name,
    category,
    shortDescription:
      String(payload?.shortDescription || "").trim() || `${name} is a tourist destination in ${state.name}.`,
    fullDescription:
      String(payload?.fullDescription || "").trim() || `${name} is listed as a curated tourist place in ${state.name}.`,
    bestTimeToVisit,
    nearbyPlaces: toStringList(payload?.nearbyPlaces),
    travelTips:
      toStringList(payload?.travelTips).length > 0
        ? toStringList(payload?.travelTips)
        : [
            "Check local timings before travel.",
            "Start early for better sightseeing coverage.",
            "Use local transport where possible."
          ],
    coordinates: {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6))
    },
    stateCode: state.code,
    stateSlug: state.slug,
    stateName: state.name,
    districtName,
    source: "manual-admin",
    isAIGenerated: false,
    discoveredAt: new Date().toISOString()
  };

  return {
    ...place,
    tags: inferPlaceTags(place),
    popularityScore: Number(payload?.popularityScore || inferPopularityScore(place)),
    seasonalScore: Number(payload?.seasonalScore || inferSeasonalScore(bestTimeToVisit)),
    estimatedCostRange: String(payload?.estimatedCostRange || inferEstimatedCostRange(place))
  };
};

export const listApiCachedPlacesByState = async stateSlug => {
  const cache = await getApiCacheDataset();
  const list = cache?.states?.[String(stateSlug || "").toLowerCase()];
  return Array.isArray(list) ? list : [];
};

export const syncApiPlacesForState = async (state, options = {}) => {
  const stateKey = String(state?.slug || "").toLowerCase();
  if (!state?.name || !state?.code || !stateKey) {
    throw new ApiError(400, "Valid state is required for sync.");
  }

  const force = Boolean(options.force);
  const perQueryLimit = Number.isFinite(Number(options.perQueryLimit)) ? Math.max(5, Number(options.perQueryLimit)) : 25;
  const maxPlaces = Number.isFinite(Number(options.maxPlaces)) ? Math.max(20, Number(options.maxPlaces)) : 280;

  const cached = syncMemory.get(stateKey);
  if (!force && cached && Date.now() - cached.syncedAt < API_SYNC_TTL_MS) {
    return cached.places;
  }

  const queries = buildQueriesForState(state.name);
  const collected = [];

  for (const query of queries) {
    try {
      const items = await searchNominatim(query, perQueryLimit);
      items.forEach(item => {
        const normalized = normalizeExternalPlace({ state, item });
        if (normalized) {
          collected.push(normalized);
        }
      });
    } catch (_error) {
      // Continue syncing from other queries even if one external call fails.
    }

    if (collected.length >= maxPlaces) {
      break;
    }

    await sleep(180);
  }

  const uniquePlaces = dedupePlaces(collected).slice(0, maxPlaces);

  if (uniquePlaces.length === 0) {
    const cachedFilePlaces = await listApiCachedPlacesByState(state.slug);
    if (cachedFilePlaces.length > 0) {
      return cachedFilePlaces;
    }

    throw new ApiError(503, "External tourism APIs are currently unreachable for sync.");
  }

  await upsertApiPlacesByState(state.slug, uniquePlaces);

  syncMemory.set(stateKey, {
    syncedAt: Date.now(),
    places: uniquePlaces
  });

  return uniquePlaces;
};

export const addManualPlaceForState = async ({ state, payload }) => {
  if (!state?.slug || !state?.name || !state?.code) {
    throw new ApiError(400, "Valid state is required.");
  }

  const place = await normalizeManualPlace({ state, payload });
  await upsertManualPlacesByState(state.slug, [place]);
  return place;
};
