import { haversineDistanceKm } from "../lib/math.js";
import { getNearbyPlaces } from "./dataService.js";
import { geocodeLocation } from "./geocodeService.js";

const DEFAULT_AVG_SPEED_KMPH = 42;
const DEFAULT_FUEL_EFFICIENCY = 14;

const resolvePoint = async ({ name, lat, lng }) => {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      name: name || "Custom location",
      lat,
      lng
    };
  }

  if (!name) {
    throw new Error("Location name or coordinates are required.");
  }

  const geocoded = await geocodeLocation(name);

  if (!geocoded) {
    throw new Error(`Could not geocode location: ${name}`);
  }

  return geocoded;
};

const estimateTravelTimeHours = distanceKm => Number((distanceKm / DEFAULT_AVG_SPEED_KMPH).toFixed(2));
const estimateFuelLiters = (distanceKm, fuelEfficiencyKmPerLiter = DEFAULT_FUEL_EFFICIENCY) =>
  Number((distanceKm / Math.max(1, fuelEfficiencyKmPerLiter)).toFixed(2));

const suggestStopsForPoint = async point => {
  const nearbySpots = await getNearbyPlaces({
    lat: point.lat,
    lng: point.lng,
    radiusKm: 80,
    limit: 6
  });

  return {
    foodStops: nearbySpots.filter(item => /food|market|street/i.test(item.name)).slice(0, 2),
    scenicSpots: nearbySpots.filter(item => /lake|valley|beach|falls|hill/i.test(item.name)).slice(0, 2),
    restPoints: nearbySpots.slice(0, 2)
  };
};

export const buildRoutePlan = async ({ start, destination }) => {
  const startPoint = await resolvePoint(start);
  const destinationPoint = await resolvePoint(destination);

  const distanceKm = haversineDistanceKm(
    startPoint.lat,
    startPoint.lng,
    destinationPoint.lat,
    destinationPoint.lng
  );

  const nearbySpots = await getNearbyPlaces({
    lat: destinationPoint.lat,
    lng: destinationPoint.lng,
    radiusKm: 180,
    limit: 6
  });

  const travelTimeHours = estimateTravelTimeHours(distanceKm);

  return {
    start: startPoint,
    destination: destinationPoint,
    distanceKm: Number(distanceKm.toFixed(1)),
    travelTimeHours,
    polyline: [
      [startPoint.lat, startPoint.lng],
      [destinationPoint.lat, destinationPoint.lng]
    ],
    nearbySpots
  };
};

export const buildMultiStopRoutePlan = async ({ start, stops = [], destination, fuelEfficiencyKmPerLiter }) => {
  const startPoint = await resolvePoint(start);
  const resolvedStops = [];

  for (const stop of stops) {
    resolvedStops.push(await resolvePoint(stop));
  }

  const destinationPoint = await resolvePoint(destination);
  const allPoints = [startPoint, ...resolvedStops, destinationPoint];

  let totalDistanceKm = 0;
  const segments = [];

  for (let index = 0; index < allPoints.length - 1; index += 1) {
    const from = allPoints[index];
    const to = allPoints[index + 1];

    const distanceKm = haversineDistanceKm(from.lat, from.lng, to.lat, to.lng);
    totalDistanceKm += distanceKm;

    segments.push({
      from,
      to,
      distanceKm: Number(distanceKm.toFixed(1)),
      travelTimeHours: estimateTravelTimeHours(distanceKm)
    });
  }

  const roundedDistance = Number(totalDistanceKm.toFixed(1));
  const totalTimeHours = estimateTravelTimeHours(totalDistanceKm);
  const fuelEstimateLiters = estimateFuelLiters(totalDistanceKm, fuelEfficiencyKmPerLiter);

  const suggestionAnchor = resolvedStops.length > 0 ? resolvedStops[resolvedStops.length - 1] : destinationPoint;
  const suggestions = await suggestStopsForPoint(suggestionAnchor);

  return {
    start: startPoint,
    stops: resolvedStops,
    destination: destinationPoint,
    segments,
    totalDistanceKm: roundedDistance,
    totalTimeHours,
    fuelEstimateLiters,
    polyline: allPoints.map(point => [point.lat, point.lng]),
    suggestions
  };
};
