import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tourismDatasetPath = path.join(__dirname, "../data/tourismData.json");
const manualOverridesPath = path.join(__dirname, "../data/tourismManualOverrides.json");
const apiCachePath = path.join(__dirname, "../data/tourismApiCache.json");
const serviceDatasetPath = path.join(__dirname, "../data/servicesData.json");

let tourismCache = null;
let servicesCache = null;
let manualOverrideCache = null;
let apiCache = null;

const parseJsonFile = async (filePath, fallback = null) => {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileContent.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error && error.code === "ENOENT" && fallback !== null) {
      return fallback;
    }
    throw error;
  }
};

const ensureOverlayShape = value => {
  if (!value || typeof value !== "object") {
    return { states: {} };
  }

  const states = value.states && typeof value.states === "object" ? value.states : {};
  return { states };
};

const cloneDataset = dataset => ({
  states: Array.isArray(dataset?.states)
    ? dataset.states.map(state => ({
        ...state,
        places: Array.isArray(state.places) ? state.places.map(place => ({ ...place })) : []
      }))
    : []
});

const mergeOverlayIntoDataset = (baseDataset, overlay) => {
  const merged = cloneDataset(baseDataset);
  const bySlug = new Map(merged.states.map(state => [state.slug, state]));

  Object.entries(overlay.states || {}).forEach(([stateSlug, places]) => {
    const state = bySlug.get(stateSlug);
    if (!state || !Array.isArray(places)) {
      return;
    }

    const statePlaces = new Map((state.places || []).map(place => [place.id, { ...place }]));

    places.forEach(place => {
      if (!place || typeof place !== "object" || !place.id) {
        return;
      }
      statePlaces.set(place.id, { ...statePlaces.get(place.id), ...place });
    });

    state.places = [...statePlaces.values()];
  });

  return merged;
};

const writeOverlayFile = async (filePath, payload) => {
  await fs.writeFile(filePath, `${JSON.stringify(ensureOverlayShape(payload), null, 2)}\n`, "utf-8");
};

const upsertPlacesInOverlay = async (filePath, stateSlug, places) => {
  const cleanSlug = String(stateSlug || "").trim().toLowerCase();
  if (!cleanSlug || !Array.isArray(places) || places.length === 0) {
    return;
  }

  const current = ensureOverlayShape(await parseJsonFile(filePath, { states: {} }));
  const existing = Array.isArray(current.states[cleanSlug]) ? current.states[cleanSlug] : [];

  const byId = new Map(existing.map(place => [place.id, { ...place }]));
  places.forEach(place => {
    if (!place || typeof place !== "object" || !place.id) {
      return;
    }
    byId.set(place.id, { ...byId.get(place.id), ...place });
  });

  current.states[cleanSlug] = [...byId.values()];
  await writeOverlayFile(filePath, current);
};

export const invalidateDatasetCache = () => {
  tourismCache = null;
  manualOverrideCache = null;
  apiCache = null;
};

export const getManualOverrideDataset = async () => {
  if (manualOverrideCache) {
    return manualOverrideCache;
  }

  manualOverrideCache = ensureOverlayShape(await parseJsonFile(manualOverridesPath, { states: {} }));
  return manualOverrideCache;
};

export const getApiCacheDataset = async () => {
  if (apiCache) {
    return apiCache;
  }

  apiCache = ensureOverlayShape(await parseJsonFile(apiCachePath, { states: {} }));
  return apiCache;
};

export const upsertManualPlacesByState = async (stateSlug, places) => {
  await upsertPlacesInOverlay(manualOverridesPath, stateSlug, places);
  invalidateDatasetCache();
};

export const upsertApiPlacesByState = async (stateSlug, places) => {
  await upsertPlacesInOverlay(apiCachePath, stateSlug, places);
  invalidateDatasetCache();
};

export const getDataset = async () => {
  if (tourismCache) {
    return tourismCache;
  }

  const [baseDataset, manualOverlay, apiOverlay] = await Promise.all([
    parseJsonFile(tourismDatasetPath),
    getManualOverrideDataset(),
    getApiCacheDataset()
  ]);

  const mergedManual = mergeOverlayIntoDataset(baseDataset, manualOverlay);
  tourismCache = mergeOverlayIntoDataset(mergedManual, apiOverlay);
  return tourismCache;
};

export const getServiceDataset = async () => {
  if (servicesCache) {
    return servicesCache;
  }

  servicesCache = await parseJsonFile(serviceDatasetPath);
  return servicesCache;
};

export const flattenPlaces = states =>
  states.flatMap(state =>
    state.places.map(place => ({
      ...place,
      stateCode: state.code,
      stateName: state.name,
      stateSlug: state.slug
    }))
  );
