import crypto from "node:crypto";
import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { haversineDistanceKm } from "../lib/math.js";
import {
  normalizeBudgetCategory,
  normalizeTravelType
} from "../lib/placeIntelligence.js";
import { getAllPlacesDetailed, getNearbyPlaces } from "./dataService.js";
import { geocodeLocation } from "./geocodeService.js";
import { getPreferenceBasedRecommendations } from "./recommendationService.js";

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

const AVG_SPEED_KMPH = 38;
const MAX_STOPS_PER_DAY = 3;
const CHAT_MEMORY_TTL_MS = 30 * 60 * 1000;
const CHAT_MAX_HISTORY = 10;

const chatMemory = new Map();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const timeout = ms => new Promise((_, reject) => {
  setTimeout(() => reject(new Error("Timed out")), ms);
});

const pick = (list, count) => list.slice(0, Math.max(0, count));

const toPlaceLite = place => ({
  id: place.id,
  name: place.name,
  category: place.category,
  stateName: place.stateName,
  stateSlug: place.stateSlug,
  coordinates: place.coordinates,
  tags: place.tags || [],
  popularityScore: Number(place.popularityScore || 0),
  seasonalScore: Number(place.seasonalScore || 0),
  estimatedCostRange: place.estimatedCostRange || "medium",
  shortDescription: place.shortDescription || "No description available."
});

const buildRouteMetrics = orderedPlaces => {
  let totalDistanceKm = 0;
  let totalTravelTimeHours = 0;

  for (let index = 0; index < orderedPlaces.length - 1; index += 1) {
    const current = orderedPlaces[index];
    const next = orderedPlaces[index + 1];

    const distance = haversineDistanceKm(
      current.coordinates.lat,
      current.coordinates.lng,
      next.coordinates.lat,
      next.coordinates.lng
    );

    totalDistanceKm += distance;
    totalTravelTimeHours += distance / AVG_SPEED_KMPH;
  }

  return {
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    totalTravelTimeHours: Number(totalTravelTimeHours.toFixed(2))
  };
};

const optimizePlaceOrderNearestNeighbor = ({ places, startPoint = null }) => {
  if (!Array.isArray(places) || places.length === 0) {
    return [];
  }

  const remaining = [...places];
  const ordered = [];

  let anchor = startPoint
    ? { coordinates: { lat: startPoint.lat, lng: startPoint.lng } }
    : remaining.shift();

  if (!startPoint && anchor) {
    ordered.push(anchor);
  }

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const distance = haversineDistanceKm(
        anchor.coordinates.lat,
        anchor.coordinates.lng,
        remaining[index].coordinates.lat,
        remaining[index].coordinates.lng
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    anchor = next;
  }

  return ordered;
};

const clusterOrderedPlaces = (orderedPlaces, radiusKm = 120) => {
  const clusters = [];

  orderedPlaces.forEach(place => {
    const existing = clusters.find(cluster => {
      const distance = haversineDistanceKm(
        cluster.center.lat,
        cluster.center.lng,
        place.coordinates.lat,
        place.coordinates.lng
      );

      return distance <= radiusKm;
    });

    if (!existing) {
      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        label: `Cluster ${clusters.length + 1}`,
        center: { ...place.coordinates },
        placeIds: [place.id],
        places: [toPlaceLite(place)]
      });
      return;
    }

    existing.placeIds.push(place.id);
    existing.places.push(toPlaceLite(place));

    const size = existing.placeIds.length;
    existing.center = {
      lat: Number(((existing.center.lat * (size - 1) + place.coordinates.lat) / size).toFixed(5)),
      lng: Number(((existing.center.lng * (size - 1) + place.coordinates.lng) / size).toFixed(5))
    };
  });

  return clusters;
};

const resolveStartPoint = async startLocation => {
  if (!startLocation) {
    return null;
  }

  if (Number.isFinite(Number(startLocation.lat)) && Number.isFinite(Number(startLocation.lng))) {
    return {
      name: startLocation.name || "Start",
      lat: Number(startLocation.lat),
      lng: Number(startLocation.lng)
    };
  }

  if (startLocation.name) {
    return geocodeLocation(startLocation.name);
  }

  return null;
};

export const optimizeRouteFromPlaces = async ({
  places,
  startLocation = null,
  clusterRadiusKm = 120
}) => {
  const normalized = (Array.isArray(places) ? places : [])
    .filter(item => item && Number.isFinite(Number(item?.coordinates?.lat)) && Number.isFinite(Number(item?.coordinates?.lng)))
    .map(item => ({
      ...item,
      coordinates: {
        lat: Number(item.coordinates.lat),
        lng: Number(item.coordinates.lng)
      }
    }));

  if (normalized.length === 0) {
    return {
      orderedPlaces: [],
      clusters: [],
      totalDistanceKm: 0,
      totalTravelTimeHours: 0,
      polyline: []
    };
  }

  const startPoint = await resolveStartPoint(startLocation);
  const ordered = optimizePlaceOrderNearestNeighbor({ places: normalized, startPoint });
  const routeMetrics = buildRouteMetrics(ordered);

  return {
    orderedPlaces: ordered.map(toPlaceLite),
    clusters: clusterOrderedPlaces(ordered, clamp(Number(clusterRadiusKm) || 120, 40, 260)),
    totalDistanceKm: routeMetrics.totalDistanceKm,
    totalTravelTimeHours: routeMetrics.totalTravelTimeHours,
    polyline: ordered.map(place => [place.coordinates.lat, place.coordinates.lng]),
    start: startPoint,
    end: ordered.length > 0 ? toPlaceLite(ordered[ordered.length - 1]) : null
  };
};

const BUDGET_BASE = {
  low: {
    transportPerDay: 450,
    stayPerDay: 900,
    foodPerDay: 500,
    miscPerDay: 250
  },
  medium: {
    transportPerDay: 900,
    stayPerDay: 1800,
    foodPerDay: 850,
    miscPerDay: 420
  },
  high: {
    transportPerDay: 1600,
    stayPerDay: 3200,
    foodPerDay: 1400,
    miscPerDay: 760
  }
};

const TRAVEL_TYPE_MULTIPLIER = {
  solo: 1,
  friends: 1.45,
  family: 1.9
};

export const estimateTripBudget = ({
  days,
  budget,
  budgetType,
  travelType,
  distanceKm = 0,
  location = ""
}) => {
  const safeDays = clamp(Number(days) || 1, 1, 20);
  const normalizedBudget = normalizeBudgetCategory(budgetType || budget);
  const normalizedTravelType = normalizeTravelType(travelType);
  const budgetBase = BUDGET_BASE[normalizedBudget];
  const multiplier = TRAVEL_TYPE_MULTIPLIER[normalizedTravelType] || 1;

  const travelDistanceCost = Math.max(0, Number(distanceKm || 0)) * (normalizedBudget === "low" ? 2.2 : normalizedBudget === "medium" ? 3 : 4.2);

  const transport = Math.round((budgetBase.transportPerDay * safeDays + travelDistanceCost) * multiplier);
  const accommodation = Math.round(budgetBase.stayPerDay * safeDays * multiplier);
  const food = Math.round(budgetBase.foodPerDay * safeDays * multiplier);
  const misc = Math.round(budgetBase.miscPerDay * safeDays * multiplier);

  const total = transport + accommodation + food + misc;

  return {
    currency: "INR",
    budgetCategory: normalizedBudget,
    travelType: normalizedTravelType,
    location,
    days: safeDays,
    total,
    dailyAverage: Math.round(total / safeDays),
    breakdown: {
      transport,
      accommodation,
      food,
      misc
    },
    notes: [
      "Transport includes local transfers and approximate inter-place movement.",
      "Accommodation assumes standard hotels/hostels depending on selected budget category.",
      "Food estimate includes 3 meals per day with local variation."
    ]
  };
};

const resolveLocationCandidates = async location => {
  const places = await getAllPlacesDetailed();
  const key = String(location || "").trim().toLowerCase();

  if (!key) {
    return pick(places.sort((a, b) => Number(b.popularityScore || 0) - Number(a.popularityScore || 0)), 12);
  }

  const exact = places.filter(place =>
    [place.stateName, place.stateSlug, place.name].some(value => String(value || "").toLowerCase().includes(key))
  );

  if (exact.length > 0) {
    return exact;
  }

  const geocoded = await geocodeLocation(location);

  if (!geocoded) {
    return pick(places.sort((a, b) => Number(b.popularityScore || 0) - Number(a.popularityScore || 0)), 12);
  }

  return places
    .map(place => ({
      ...place,
      distanceKm: haversineDistanceKm(geocoded.lat, geocoded.lng, place.coordinates.lat, place.coordinates.lng)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 18);
};

const toSlotText = (placeNames, fallbackLabel) => {
  if (placeNames.length === 0) {
    return fallbackLabel;
  }

  if (placeNames.length === 1) {
    return `${placeNames[0]} visit`;
  }

  return `${placeNames.join(" -> ")}`;
};

const splitPlacesByDay = ({ orderedPlaces, days }) => {
  const totalDays = clamp(Number(days) || 1, 1, 15);
  const limit = Math.min(orderedPlaces.length, totalDays * MAX_STOPS_PER_DAY);
  const selected = orderedPlaces.slice(0, limit);
  const chunks = [];

  let cursor = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const remainingPlaces = selected.length - cursor;
    const remainingDays = totalDays - day + 1;
    const take = remainingPlaces > 0 ? clamp(Math.ceil(remainingPlaces / remainingDays), 1, MAX_STOPS_PER_DAY) : 0;
    const placesForDay = selected.slice(cursor, cursor + take);

    cursor += take;
    chunks.push({ day, places: placesForDay });
  }

  return chunks;
};

const validateDayPlan = dayPlans => {
  const warnings = [];

  dayPlans.forEach(day => {
    if (day.places.length > MAX_STOPS_PER_DAY) {
      warnings.push(`Day ${day.day} has too many locations. Consider reducing stops.`);
    }

    let travelHours = 0;

    for (let index = 0; index < day.places.length - 1; index += 1) {
      const current = day.places[index];
      const next = day.places[index + 1];
      const distance = haversineDistanceKm(
        current.coordinates.lat,
        current.coordinates.lng,
        next.coordinates.lat,
        next.coordinates.lng
      );
      travelHours += distance / AVG_SPEED_KMPH;
    }

    if (travelHours > 8) {
      warnings.push(`Day ${day.day} may involve high travel time (${travelHours.toFixed(1)}h).`);
    }
  });

  return {
    isRealistic: warnings.length === 0,
    warnings
  };
};

const buildHiddenGems = async anchors => {
  const gems = [];

  for (const anchor of anchors) {
    const nearby = await getNearbyPlaces({
      lat: anchor.coordinates.lat,
      lng: anchor.coordinates.lng,
      radiusKm: 220,
      limit: 6,
      excludeId: anchor.id
    });

    const filtered = nearby
      .filter(item => Number(item.popularityScore || 0) <= Number(anchor.popularityScore || 3.5))
      .slice(0, 3)
      .map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        stateName: item.stateName,
        coordinates: item.coordinates,
        popularityScore: Number(item.popularityScore || 0),
        estimatedCostRange: item.estimatedCostRange || "medium",
        tags: item.tags || []
      }));

    gems.push({
      anchorPlaceId: anchor.id,
      anchorPlaceName: anchor.name,
      gems: filtered
    });
  }

  return gems;
};

const enrichWithGroq = async ({ itinerary, location, days, budgetCategory, travelType, interests }) => {
  if (!groq) {
    return { itinerary, provider: "heuristic" };
  }

  const prompt = {
    location,
    days,
    budgetCategory,
    travelType,
    interests,
    itinerary: {
      summary: itinerary.summary,
      dayTitles: itinerary.days.map(day => ({ day: day.day, title: day.title, places: day.places }))
    }
  };

  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: env.GROQ_MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Improve travel itinerary quality. Return JSON only with keys: summary, generalTips (array), dayTitles (array of {day,title}), dayTips (array of {day,tip}). Keep practical and concise."
          },
          {
            role: "user",
            content: JSON.stringify(prompt)
          }
        ]
      }),
      timeout(2200)
    ]);

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      return { itinerary, provider: "heuristic" };
    }

    const parsed = JSON.parse(content);
    const dayTitleMap = new Map((Array.isArray(parsed.dayTitles) ? parsed.dayTitles : []).map(item => [Number(item.day), String(item.title)]));
    const dayTipMap = new Map((Array.isArray(parsed.dayTips) ? parsed.dayTips : []).map(item => [Number(item.day), String(item.tip)]));

    const enhanced = {
      ...itinerary,
      summary: String(parsed.summary || itinerary.summary),
      generalTips: Array.isArray(parsed.generalTips) ? parsed.generalTips.map(item => String(item)) : itinerary.generalTips,
      days: itinerary.days.map(day => ({
        ...day,
        title: dayTitleMap.get(day.day) || day.title,
        tips: dayTipMap.get(day.day) ? [dayTipMap.get(day.day), ...day.tips].slice(0, 4) : day.tips
      }))
    };

    return { itinerary: enhanced, provider: "groq+heuristic" };
  } catch (_error) {
    return { itinerary, provider: "heuristic" };
  }
};

export const generateAdvancedTripPlan = async ({
  location,
  days,
  budget,
  budgetType,
  travelType,
  interests = []
}) => {
  const safeDays = clamp(Number(days) || 1, 1, 15);
  const normalizedTravelType = normalizeTravelType(travelType);
  const normalizedBudget = normalizeBudgetCategory(budgetType || budget);

  const locationCandidates = await resolveLocationCandidates(location);
  const recommendations = await getPreferenceBasedRecommendations({
    tags: interests,
    interests,
    budget: normalizedBudget,
    limit: 18
  });

  const uniquePlaces = [...locationCandidates, ...recommendations]
    .reduce((acc, place) => {
      if (!acc.find(item => item.id === place.id)) {
        acc.push(place);
      }
      return acc;
    }, []);

  const tourismFirst = uniquePlaces.filter(place => {
    const category = String(place.category || "").toLowerCase();
    return category && category !== "general";
  });

  const prioritizedPlaces = (tourismFirst.length >= Math.min(6, safeDays * 3) ? tourismFirst : uniquePlaces).slice(0, 18);

  const routeOptimization = await optimizeRouteFromPlaces({
    places: prioritizedPlaces,
    clusterRadiusKm: 120
  });

  const dayBuckets = splitPlacesByDay({
    orderedPlaces: routeOptimization.orderedPlaces,
    days: safeDays
  });

  const budgetEstimate = estimateTripBudget({
    days: safeDays,
    budget,
    budgetType: normalizedBudget,
    travelType: normalizedTravelType,
    distanceKm: routeOptimization.totalDistanceKm,
    location
  });

  const itinerary = {
    summary: `${safeDays}-day smart itinerary for ${location} with ${normalizedBudget} budget (${normalizedTravelType}).`,
    budgetNotes: `Estimated total spend is INR ${budgetEstimate.total}. Daily average INR ${budgetEstimate.dailyAverage}.`,
    totalEstimatedCost: {
      currency: "INR",
      amount: budgetEstimate.total
    },
    days: dayBuckets.map(({ day, places }) => {
      const names = places.map(place => place.name);
      const morning = pick(names, 1);
      const afternoon = names.length > 1 ? [names[1]] : morning;
      const evening = names.length > 2 ? [names[2]] : names.length > 0 ? [names[names.length - 1]] : [];

      return {
        day,
        title: names.length > 0 ? `${names[0]} and nearby highlights` : `Flexible exploration in ${location}`,
        places: names.length > 0 ? names : [`Explore local markets in ${location}`, `Try regional food trail`],
        timeSlots: {
          morning: toSlotText(morning, "Leisurely breakfast and local orientation"),
          afternoon: toSlotText(afternoon, "Main sightseeing and lunch break"),
          evening: toSlotText(evening, "Sunset point, local cuisine, and rest")
        },
        travelSequence: names.length > 0 ? names.join(" -> ") : `City center -> local neighborhood -> food district`,
        routeOptimization: "Places are ordered using nearest-neighbor distance minimization.",
        estimatedCost: {
          currency: "INR",
          amount: Math.round(budgetEstimate.total / safeDays),
          notes: `${normalizedBudget} budget profile with ${normalizedTravelType} travel multiplier applied.`
        },
        tips: [
          "Start early to avoid traffic and heat.",
          "Keep 30-45 mins buffer between attractions.",
          "Use local transport for better cost efficiency."
        ]
      };
    }),
    generalTips: [
      "Carry ID proofs and digital booking copies.",
      "Check local weather and opening hours every morning.",
      "Keep hydration and emergency contacts handy."
    ]
  };

  const validation = validateDayPlan(dayBuckets);
  const hiddenGems = await buildHiddenGems(routeOptimization.orderedPlaces.slice(0, Math.min(safeDays, 5)));
  const enhanced = await enrichWithGroq({
    itinerary,
    location,
    days: safeDays,
    budgetCategory: normalizedBudget,
    travelType: normalizedTravelType,
    interests
  });

  return {
    provider: enhanced.provider,
    itinerary: enhanced.itinerary,
    budgetEstimate,
    optimizedRoute: routeOptimization,
    recommendedDurationDays: clamp(Math.round(routeOptimization.orderedPlaces.length / 2), 2, 8),
    recommendedPlaces: routeOptimization.orderedPlaces.slice(0, Math.min(safeDays * MAX_STOPS_PER_DAY, 12)),
    hiddenGems,
    validation
  };
};

const cleanupChatMemory = () => {
  const now = Date.now();

  for (const [key, value] of chatMemory.entries()) {
    if (now - value.updatedAt > CHAT_MEMORY_TTL_MS) {
      chatMemory.delete(key);
    }
  }
};

const getConversation = conversationId => {
  cleanupChatMemory();
  const id = conversationId || crypto.randomUUID();

  if (!chatMemory.has(id)) {
    chatMemory.set(id, {
      messages: [],
      updatedAt: Date.now()
    });
  }

  return { id, memory: chatMemory.get(id) };
};

const detectIntent = message => {
  const text = String(message || "").toLowerCase();

  if (/plan|itinerary|trip/.test(text)) {
    return "trip_plan";
  }

  if (/(budget|cost|under\s*(inr|rs|rupees|\d))/.test(text)) {
    return "budget";
  }

  if (/best places|recommend|where should i visit|hidden gems/.test(text)) {
    return "recommend";
  }

  if (/route|order|sequence/.test(text)) {
    return "route";
  }

  return "general";
};

const inferTravelTypeFromMessage = text => {
  if (/family|kids|children|parents/i.test(text)) {
    return "family";
  }

  if (/friends|group|couple/i.test(text)) {
    return "friends";
  }

  return "solo";
};

const inferBudgetTypeFromMessage = text => {
  if (/luxury|premium|high/i.test(text)) {
    return "high";
  }

  if (/cheap|low|budget|backpack|economy/i.test(text)) {
    return "low";
  }

  return "medium";
};

const inferInterestsFromMessage = text => {
  const interests = [];

  if (/nature|hill|trek|waterfall|wildlife|beach/i.test(text)) {
    interests.push("nature");
  }

  if (/culture|temple|history|heritage|museum/i.test(text)) {
    interests.push("cultural");
  }

  if (/adventure|rafting|hike|camp|safari/i.test(text)) {
    interests.push("adventure");
  }

  if (/food|street food|cuisine|restaurant/i.test(text)) {
    interests.push("food");
  }

  return interests.length > 0 ? interests : ["nature", "cultural"];
};

const parseTripRequestFromMessage = message => {
  const text = String(message || "").trim();

  const daysMatch = text.match(/(\d+)\s*[- ]?\s*day(?:s)?/i);
  const budgetAmountMatch = text.match(/(?:under|budget(?:\s*of)?|around|within)\s*(?:inr|rs|rupees)?\s*([0-9][0-9,]*)/i);
  const locationMatch = text.match(/\b(?:in|to|for)\s+([a-zA-Z][a-zA-Z\s-]{1,})(?=(?:\s+(?:under|for|with|budget|around|within)\b|$))/i);

  const inferredBudgetType = inferBudgetTypeFromMessage(text);
  const location = locationMatch
    ? String(locationMatch[1] || "").replace(/\s+/g, " ").trim()
    : "Andhra Pradesh";

  return {
    days: clamp(daysMatch ? Number(daysMatch[1]) : 3, 1, 15),
    budget: budgetAmountMatch
      ? `INR ${String(budgetAmountMatch[1] || "").replace(/,/g, "")}`
      : inferredBudgetType,
    budgetType: inferredBudgetType,
    location,
    travelType: inferTravelTypeFromMessage(text),
    interests: inferInterestsFromMessage(text)
  };
};

const formatCurrency = amount => `INR ${Math.round(Number(amount) || 0).toLocaleString("en-IN")}`;

const formatTripPlanReply = ({ parsed, plan }) => {
  const dayPlans = plan.itinerary.days
    .map(day => {
      const tips = (Array.isArray(day.tips) ? day.tips : []).slice(0, 3).map(item => `- ${item}`).join("\n");
      const places = (Array.isArray(day.places) ? day.places : []).join(" -> ");

      return [
        `Day ${day.day}: ${day.title}`,
        `- Morning: ${day.timeSlots.morning}`,
        `- Afternoon: ${day.timeSlots.afternoon}`,
        `- Evening: ${day.timeSlots.evening}`,
        `- Places: ${places || "Flexible local exploration"}`,
        `- Route sequence: ${day.travelSequence}`,
        `- Daily estimate: ${formatCurrency(day.estimatedCost.amount)} (${day.estimatedCost.notes})`,
        `- Route optimization note: ${day.routeOptimization}`,
        tips ? `- Tips:\n${tips}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const orderedPlaces = plan.optimizedRoute.orderedPlaces
    .slice(0, 12)
    .map((place, index) => `${index + 1}. ${place.name} (${place.category}, ${place.stateName})`)
    .join("\n");

  const clusterSummary = plan.optimizedRoute.clusters
    .slice(0, 4)
    .map(cluster => `- ${cluster.label}: ${cluster.places.map(place => place.name).join(", ")}`)
    .join("\n");

  const hiddenGemSummary = plan.hiddenGems
    .filter(group => Array.isArray(group.gems) && group.gems.length > 0)
    .slice(0, 4)
    .map(group => `- Near ${group.anchorPlaceName}: ${group.gems.map(gem => gem.name).join(", ")}`)
    .join("\n");

  const generalTips = (Array.isArray(plan.itinerary.generalTips) ? plan.itinerary.generalTips : [])
    .slice(0, 6)
    .map(tip => `- ${tip}`)
    .join("\n");

  const warnings = !plan.validation.isRealistic && Array.isArray(plan.validation.warnings)
    ? plan.validation.warnings.map(item => `- ${item}`).join("\n")
    : "- No realism warnings detected for this plan.";

  return [
    `Complete ${parsed.days}-day trip plan for ${parsed.location} (${parsed.travelType}, ${parsed.budgetType} budget)`,
    "",
    "Overview",
    `- Summary: ${plan.itinerary.summary}`,
    `- Provider: ${plan.provider}`,
    `- Recommended duration window: ${plan.recommendedDurationDays} days`,
    `- Total estimate: ${formatCurrency(plan.budgetEstimate.total)} (daily avg ${formatCurrency(plan.budgetEstimate.dailyAverage)})`,
    `- Budget breakdown: transport ${formatCurrency(plan.budgetEstimate.breakdown.transport)}, accommodation ${formatCurrency(plan.budgetEstimate.breakdown.accommodation)}, food ${formatCurrency(plan.budgetEstimate.breakdown.food)}, misc ${formatCurrency(plan.budgetEstimate.breakdown.misc)}`,
    `- Route metrics: ${plan.optimizedRoute.totalDistanceKm} km and ${plan.optimizedRoute.totalTravelTimeHours} travel hours`,
    "",
    "Day-wise Itinerary",
    dayPlans,
    "",
    "Top Route Order",
    orderedPlaces || "No ordered places available.",
    "",
    "Clustered Route Groups",
    clusterSummary || "- No route clusters available.",
    "",
    "Hidden Gems",
    hiddenGemSummary || "- No hidden gems were found in the current dataset for this request.",
    "",
    "Validation",
    warnings,
    "",
    "General Travel Tips",
    generalTips || "- Keep hydration and emergency contacts handy.",
    "",
    "If you want, I can regenerate this with a different travel style, stricter budget cap, or a shorter/longer day split."
  ].join("\n");
};

const formatBudgetReply = ({ parsed, estimate }) => [
  `Detailed budget estimate for ${parsed.days} days in ${parsed.location} (${estimate.travelType}, ${estimate.budgetCategory} budget):`,
  "",
  `- Total: ${formatCurrency(estimate.total)}`,
  `- Daily average: ${formatCurrency(estimate.dailyAverage)}`,
  `- Transport: ${formatCurrency(estimate.breakdown.transport)}`,
  `- Accommodation: ${formatCurrency(estimate.breakdown.accommodation)}`,
  `- Food: ${formatCurrency(estimate.breakdown.food)}`,
  `- Misc: ${formatCurrency(estimate.breakdown.misc)}`,
  "",
  "Budget Notes",
  ...estimate.notes.map(note => `- ${note}`),
  "",
  "Share your preferred travel style or exact cities, and I will tune this estimate further."
].join("\n");

const formatTripFallbackReply = ({ parsed, estimate }) => {
  const dayBlocks = Array.from({ length: parsed.days }, (_, index) => {
    const day = index + 1;
    return [
      `Day ${day}`,
      `- Morning: Start early with a key landmark/heritage circuit in ${parsed.location}.`,
      "- Afternoon: Local lunch + museum/market + one relaxed attraction nearby.",
      "- Evening: Sunset viewpoint/walk + regional dinner + short buffer for rest.",
      `- Suggested daily spend target: ${formatCurrency(estimate.dailyAverage)}`
    ].join("\n");
  }).join("\n\n");

  return [
    `Complete ${parsed.days}-day trip blueprint for ${parsed.location} (${parsed.travelType}, ${parsed.budgetType} budget)`,
    "",
    "Overview",
    `- Total estimate: ${formatCurrency(estimate.total)}`,
    `- Daily average: ${formatCurrency(estimate.dailyAverage)}`,
    `- Transport: ${formatCurrency(estimate.breakdown.transport)}`,
    `- Accommodation: ${formatCurrency(estimate.breakdown.accommodation)}`,
    `- Food: ${formatCurrency(estimate.breakdown.food)}`,
    `- Misc: ${formatCurrency(estimate.breakdown.misc)}`,
    "",
    "Day-wise Plan",
    dayBlocks,
    "",
    "Route + Execution Strategy",
    "- Keep each day to 2-3 major stops to avoid travel fatigue.",
    "- Group attractions by proximity and keep 30-45 mins transfer buffer.",
    "- Use nearest-neighbor movement (closest next stop first) for time efficiency.",
    "",
    "Stay + Food Strategy",
    "- Stay in a central, transit-friendly area to minimize daily transfer cost.",
    "- Keep one meal slot flexible for local cuisine and crowd-based timing.",
    "",
    "Packing + Safety Checklist",
    "- Valid ID proofs, digital bookings, power bank, hydration, basic meds.",
    "- Confirm opening hours and weather forecast each morning.",
    "",
    "Ask me to regenerate this with exact places, preferred interests, and transport mode, and I will produce a sharper day-by-day route."
  ].join("\n");
};

const formatRecommendationsReply = ({ parsed, recommendations }) => {
  const lines = recommendations.map((item, index) => {
    const tags = Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(", ") : "general";
    return `${index + 1}. ${item.name} (${item.category}, ${item.stateName}) | Cost: ${item.estimatedCostRange || "medium"} | Tags: ${tags}`;
  });

  return [
    `Top recommendation set for ${parsed.location}:`,
    "",
    ...lines,
    "",
    "I can now convert these places into a day-wise itinerary with route order and exact budget split."
  ].join("\n");
};

const buildFallbackChatReply = async ({ intent, message }) => {
  if (intent === "trip_plan" || intent === "route") {
    const parsed = parseTripRequestFromMessage(message);
    let plan = null;

    try {
      plan = await Promise.race([
        generateAdvancedTripPlan({
          location: parsed.location,
          days: parsed.days,
          budget: parsed.budget,
          budgetType: parsed.budgetType,
          travelType: parsed.travelType,
          interests: parsed.interests
        }),
        timeout(30000)
      ]);
    } catch (_error) {
      plan = null;
    }

    if (plan) {
      return {
        reply: formatTripPlanReply({ parsed, plan }),
        data: {
          type: "trip_plan",
          trip: plan
        }
      };
    }

    const estimate = estimateTripBudget({
      days: parsed.days,
      budget: parsed.budget,
      budgetType: parsed.budgetType,
      travelType: parsed.travelType,
      location: parsed.location
    });

    return {
      reply: formatTripFallbackReply({ parsed, estimate }),
      data: {
        type: "budget",
        budget: estimate
      }
    };
  }

  if (intent === "budget") {
    const parsed = parseTripRequestFromMessage(message);
    const estimate = estimateTripBudget({
      days: parsed.days,
      budget: parsed.budget,
      budgetType: parsed.budgetType,
      travelType: parsed.travelType,
      location: parsed.location
    });

    return {
      reply: formatBudgetReply({ parsed, estimate }),
      data: {
        type: "budget",
        budget: estimate
      }
    };
  }

  if (intent === "recommend") {
    const parsed = parseTripRequestFromMessage(message);
    const recommendations = await getPreferenceBasedRecommendations({
      tags: parsed.interests,
      interests: parsed.interests,
      budget: parsed.budgetType,
      limit: 8
    });

    return {
      reply: formatRecommendationsReply({ parsed, recommendations: recommendations.slice(0, 8).map(toPlaceLite) }),
      data: {
        type: "recommendations",
        recommendations: recommendations.slice(0, 8).map(toPlaceLite)
      }
    };
  }

  return {
    reply:
      "I can provide complete trip blueprints with day-wise plans, route optimization, budget breakdowns, hidden gems, and risk warnings. Try: Plan 4-day family trip in Kerala under INR 25000.",
    data: {
      type: "general"
    }
  };
};

const buildGroqReply = async ({ conversationMessages, message }) => {
  if (!groq) {
    return null;
  }

  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: env.GROQ_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are TourMind AI assistant. Give practical India-travel guidance. Use clear structure and be specific."
          },
          ...conversationMessages,
          {
            role: "user",
            content: message
          }
        ]
      }),
      timeout(2200)
    ]);

    return completion.choices?.[0]?.message?.content || null;
  } catch (_error) {
    return null;
  }
};

export const chatWithAssistant = async ({ conversationId, message }) => {
  const safeMessage = String(message || "").trim();

  if (!safeMessage) {
    throw new Error("message is required");
  }

  const { id, memory } = getConversation(conversationId);
  const intent = detectIntent(safeMessage);

  const recentMessages = memory.messages.slice(-CHAT_MAX_HISTORY);
  const groqReply = await buildGroqReply({
    conversationMessages: recentMessages,
    message: safeMessage
  });

  const fallback = await buildFallbackChatReply({
    intent,
    message: safeMessage
  });

  const structuredIntent = ["trip_plan", "budget", "recommend", "route"].includes(intent);
  const reply = structuredIntent ? fallback.reply : groqReply || fallback.reply;

  memory.messages.push({ role: "user", content: safeMessage });
  memory.messages.push({ role: "assistant", content: reply });
  memory.messages = memory.messages.slice(-CHAT_MAX_HISTORY);
  memory.updatedAt = Date.now();

  return {
    conversationId: id,
    intent,
    reply,
    data: fallback.data
  };
};




