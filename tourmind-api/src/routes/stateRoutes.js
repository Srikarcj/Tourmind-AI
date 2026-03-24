import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireInternalKey } from "../middleware/requireInternalKey.js";
import {
  getCategories,
  getDistrictsByState,
  getPlaceById,
  getPlacesByState,
  getStateBySlug,
  getStates
} from "../services/dataService.js";
import {
  discoverUnknownPlaceForState,
  getDiscoveredPlaceById,
  getEnrichedPlace,
  listDiscoveredPlacesByState
} from "../services/enrichmentService.js";
import {
  addManualPlaceForState,
  listApiCachedPlacesByState,
  syncApiPlacesForState
} from "../services/tourismSourceService.js";

const router = Router();

const toBoolean = value => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

router.get("/states", async (_req, res, next) => {
  try {
    const states = await getStates();
    res.json({ data: states });
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (_req, res, next) => {
  try {
    const categories = await getCategories();
    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

router.get("/states/:slug/districts", async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      return res.status(404).json({ message: "State not found" });
    }

    const districts = await getDistrictsByState(req.params.slug);

    return res.json({
      state: {
        code: state.code,
        slug: state.slug,
        name: state.name
      },
      data: districts
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/states/:slug/places", async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      return res.status(404).json({ message: "State not found" });
    }

    const search = String(req.query.search || "").trim();
    const discover = String(req.query.discover || "true").toLowerCase() !== "false";
    const source = String(req.query.source || "hybrid").toLowerCase();

    if (!["manual", "api", "hybrid"].includes(source)) {
      throw new ApiError(400, "source must be manual, api, or hybrid.");
    }

    if (source !== "manual" && toBoolean(req.query.refreshApi)) {
      await syncApiPlacesForState(state, {
        force: true,
        maxPlaces: req.query.maxPlaces,
        perQueryLimit: req.query.perQueryLimit
      });
    }

    let places = await getPlacesByState(req.params.slug, {
      category: req.query.category || "",
      search,
      source
    });

    let discovered = null;
    if (search && places.length === 0 && discover) {
      discovered = await discoverUnknownPlaceForState({ state, query: search });
      if (discovered) {
        places = [discovered];
      }
    }

    return res.json({
      state: {
        code: state.code,
        slug: state.slug,
        name: state.name
      },
      data: places,
      meta: {
        source,
        discovered: Boolean(discovered),
        discoveredPlaceId: discovered?.id || null,
        total: places.length
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/states/:slug/places/api-cache", async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      return res.status(404).json({ message: "State not found" });
    }

    const data = await listApiCachedPlacesByState(req.params.slug);
    return res.json({
      state: {
        code: state.code,
        slug: state.slug,
        name: state.name
      },
      data
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/states/:slug/places/manual", requireInternalKey, async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      throw new ApiError(404, "State not found.");
    }

    const place = await addManualPlaceForState({
      state,
      payload: req.body || {}
    });

    return res.status(201).json({ data: place });
  } catch (error) {
    return next(error);
  }
});

router.post("/states/:slug/places/sync-api", requireInternalKey, async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      throw new ApiError(404, "State not found.");
    }

    const data = await syncApiPlacesForState(state, {
      force: toBoolean(req.body?.force),
      maxPlaces: req.body?.maxPlaces,
      perQueryLimit: req.body?.perQueryLimit
    });

    return res.json({
      state: {
        code: state.code,
        slug: state.slug,
        name: state.name
      },
      data,
      meta: {
        synced: true,
        total: data.length
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/states/sync-api", requireInternalKey, async (req, res, next) => {
  try {
    const requestedSlugs = Array.isArray(req.body?.stateSlugs)
      ? req.body.stateSlugs.map(item => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];

    const allStates = await getStates();
    const targets =
      requestedSlugs.length > 0
        ? allStates.filter(state => requestedSlugs.includes(state.slug))
        : allStates;

    const results = [];

    for (const state of targets) {
      const synced = await syncApiPlacesForState(state, {
        force: toBoolean(req.body?.force),
        maxPlaces: req.body?.maxPlaces,
        perQueryLimit: req.body?.perQueryLimit
      });

      results.push({
        stateCode: state.code,
        stateSlug: state.slug,
        stateName: state.name,
        total: synced.length
      });
    }

    return res.json({
      data: results,
      meta: {
        syncedStates: results.length,
        totalImportedPlaces: results.reduce((sum, item) => sum + item.total, 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/states/:slug/discovered", async (req, res, next) => {
  try {
    const state = await getStateBySlug(req.params.slug);

    if (!state) {
      return res.status(404).json({ message: "State not found" });
    }

    const data = listDiscoveredPlacesByState(req.params.slug);
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/places/discover", async (req, res, next) => {
  try {
    const stateSlug = String(req.body.stateSlug || "").trim();
    const query = String(req.body.query || "").trim();

    if (!stateSlug || !query) {
      throw new ApiError(400, "stateSlug and query are required.");
    }

    const state = await getStateBySlug(stateSlug);
    if (!state) {
      throw new ApiError(404, "State not found.");
    }

    const place = await discoverUnknownPlaceForState({ state, query });

    if (!place) {
      throw new ApiError(404, "Could not discover this place right now.");
    }

    return res.status(201).json({ data: place });
  } catch (error) {
    return next(error);
  }
});

router.get("/places/:id", async (req, res, next) => {
  try {
    const enrich = String(req.query.enrich || "false").toLowerCase() === "true";
    const refresh = String(req.query.refresh || "false").toLowerCase() === "true";

    let place = await getPlaceById(req.params.id);

    if (!place) {
      place = getDiscoveredPlaceById(req.params.id);
    }

    if (!place) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (enrich) {
      const enriched = await getEnrichedPlace(place, { forceRefresh: refresh });
      return res.json({ data: enriched });
    }

    return res.json({ data: place });
  } catch (error) {
    return next(error);
  }
});

export default router;
