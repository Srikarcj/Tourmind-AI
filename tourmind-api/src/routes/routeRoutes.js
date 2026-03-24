import { Router } from "express";
import { getAllPlacesDetailed } from "../services/dataService.js";
import { optimizeRouteFromPlaces } from "../services/advancedTravelService.js";
import { buildMultiStopRoutePlan, buildRoutePlan } from "../services/routeService.js";

const router = Router();

const parseCoordinate = value => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

router.get("/routes", async (req, res, next) => {
  try {
    const startName = req.query.start || "";
    const destinationName = req.query.destination || "";

    if (!startName && (req.query.startLat === undefined || req.query.startLng === undefined)) {
      return res.status(400).json({ message: "Provide start location name or coordinates." });
    }

    if (!destinationName && (req.query.destLat === undefined || req.query.destLng === undefined)) {
      return res.status(400).json({ message: "Provide destination name or coordinates." });
    }

    const routePlan = await buildRoutePlan({
      start: {
        name: startName,
        lat: parseCoordinate(req.query.startLat),
        lng: parseCoordinate(req.query.startLng)
      },
      destination: {
        name: destinationName,
        lat: parseCoordinate(req.query.destLat),
        lng: parseCoordinate(req.query.destLng)
      }
    });

    return res.json({ data: routePlan });
  } catch (error) {
    return next(error);
  }
});

router.post("/routes/multi-stop", async (req, res, next) => {
  try {
    const start = req.body.start || {};
    const destination = req.body.destination || {};
    const stops = Array.isArray(req.body.stops) ? req.body.stops : [];
    const fuelEfficiencyKmPerLiter = req.body.fuelEfficiencyKmPerLiter ? Number(req.body.fuelEfficiencyKmPerLiter) : undefined;

    if (!start.name && (!Number.isFinite(Number(start.lat)) || !Number.isFinite(Number(start.lng)))) {
      return res.status(400).json({ message: "Provide start location name or coordinates." });
    }

    if (!destination.name && (!Number.isFinite(Number(destination.lat)) || !Number.isFinite(Number(destination.lng)))) {
      return res.status(400).json({ message: "Provide destination name or coordinates." });
    }

    const data = await buildMultiStopRoutePlan({
      start: {
        name: start.name || "",
        lat: Number.isFinite(Number(start.lat)) ? Number(start.lat) : null,
        lng: Number.isFinite(Number(start.lng)) ? Number(start.lng) : null
      },
      stops: stops.map(stop => ({
        name: stop.name || "",
        lat: Number.isFinite(Number(stop.lat)) ? Number(stop.lat) : null,
        lng: Number.isFinite(Number(stop.lng)) ? Number(stop.lng) : null
      })),
      destination: {
        name: destination.name || "",
        lat: Number.isFinite(Number(destination.lat)) ? Number(destination.lat) : null,
        lng: Number.isFinite(Number(destination.lng)) ? Number(destination.lng) : null
      },
      fuelEfficiencyKmPerLiter
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.post("/route/optimize", async (req, res, next) => {
  try {
    const placeIds = Array.isArray(req.body.placeIds) ? req.body.placeIds.map(item => String(item).trim()).filter(Boolean) : [];
    const customPlaces = Array.isArray(req.body.places) ? req.body.places : [];

    let selectedPlaces = [];

    if (placeIds.length > 0) {
      const allPlaces = await getAllPlacesDetailed();
      const placeMap = new Map(allPlaces.map(place => [place.id, place]));
      selectedPlaces = placeIds.map(id => placeMap.get(id)).filter(Boolean);
    }

    if (customPlaces.length > 0) {
      const normalizedCustom = customPlaces
        .filter(item => Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng)))
        .map((item, index) => ({
          id: item.id ? String(item.id) : `custom-${index + 1}`,
          name: item.name ? String(item.name) : `Stop ${index + 1}`,
          category: item.category ? String(item.category) : "Custom",
          stateName: item.stateName ? String(item.stateName) : "Custom",
          stateSlug: item.stateSlug ? String(item.stateSlug) : "custom",
          coordinates: {
            lat: Number(item.lat),
            lng: Number(item.lng)
          },
          tags: [],
          popularityScore: 1,
          seasonalScore: 1,
          estimatedCostRange: "medium",
          shortDescription: "Custom route stop"
        }));

      selectedPlaces = [...selectedPlaces, ...normalizedCustom];
    }

    if (selectedPlaces.length < 2) {
      return res.status(400).json({ message: "Provide at least 2 places using placeIds or places." });
    }

    const data = await optimizeRouteFromPlaces({
      places: selectedPlaces,
      startLocation: req.body.startLocation || null,
      clusterRadiusKm: req.body.clusterRadiusKm
    });

    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

export default router;
