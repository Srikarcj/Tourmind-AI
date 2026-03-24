import { dbQuery, isDbEnabled } from "../lib/db.js";
import { normalizeBudgetCategory } from "../lib/placeIntelligence.js";
import { getAllPlacesDetailed } from "./dataService.js";
import { getUserPreferences, listRecentlyViewedPlaces, listSavedPlaces } from "./preferenceService.js";

const DEFAULT_INTEREST_WEIGHTS = {
  adventure: 1,
  cultural: 1,
  food: 1,
  nature: 1,
  nightlife: 1,
  spiritual: 1,
  relaxation: 1
};

const normalizeTag = value => String(value || "").trim().toLowerCase();

const loadPopularityBoostMap = async () => {
  if (!isDbEnabled) {
    return new Map();
  }

  const result = await dbQuery(
    `
    SELECT
      COALESCE(entity_id, metadata->>'placeId') AS place_id,
      COUNT(*)::int AS score
    FROM analytics_events
    WHERE event_type IN ('place_view', 'search_click', 'recommendation_click')
      AND created_at >= NOW() - INTERVAL '45 days'
    GROUP BY COALESCE(entity_id, metadata->>'placeId')
    `
  );

  return new Map(result.rows.map(row => [row.place_id, Number(row.score)]));
};

const buildInterestWeights = interests => {
  const initial = { ...DEFAULT_INTEREST_WEIGHTS };

  (Array.isArray(interests) ? interests : []).forEach((tag, index) => {
    initial[normalizeTag(tag)] = 1.6 + Math.max(0, 4 - index) * 0.35;
  });

  return initial;
};

const calculateBudgetFitScore = (place, budgetCategory) => {
  const placeCost = String(place.estimatedCostRange || "medium").toLowerCase();

  if (budgetCategory === placeCost) {
    return 1.4;
  }

  if (budgetCategory === "low" && placeCost === "high") {
    return -1.2;
  }

  if (budgetCategory === "high" && placeCost === "low") {
    return 0.4;
  }

  return 0.7;
};

const scorePlaces = ({
  places,
  requestedTags = [],
  interests = [],
  budget,
  viewedSet = new Set(),
  savedSet = new Set(),
  popularityMap = new Map(),
  limit = 12
}) => {
  const normalizedTags = requestedTags.map(normalizeTag).filter(Boolean);
  const interestWeights = buildInterestWeights(interests);
  const budgetCategory = normalizeBudgetCategory(budget);

  return places
    .filter(place => !savedSet.has(place.id))
    .filter(place => (normalizedTags.length > 0 ? normalizedTags.some(tag => place.tags?.includes(tag)) : true))
    .map(place => {
      const placeTags = Array.isArray(place.tags) ? place.tags.map(normalizeTag) : [];
      const tagMatches = placeTags.reduce((sum, tag) => sum + (interestWeights[tag] || 0), 0);
      const popularityScore = Number(place.popularityScore || 0) + (popularityMap.get(place.id) || 0) * 0.05;
      const seasonalScore = Number(place.seasonalScore || 1);
      const budgetFitScore = calculateBudgetFitScore(place, budgetCategory);
      const viewedPenalty = viewedSet.has(place.id) ? -0.8 : 0;

      const score = (tagMatches * 1.2) + popularityScore + seasonalScore + budgetFitScore + viewedPenalty;

      return {
        ...place,
        score: Number(score.toFixed(2))
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 30)));
};

export const getPersonalizedRecommendations = async ({ userId, tags = [], limit = 12 }) => {
  const [places, preferences, savedPlaces, recentlyViewed, popularityMap] = await Promise.all([
    getAllPlacesDetailed(),
    getUserPreferences(userId),
    listSavedPlaces(userId),
    listRecentlyViewedPlaces({ userId, limit: 15 }),
    loadPopularityBoostMap()
  ]);

  const savedSet = new Set(savedPlaces.map(item => item.placeId));
  const viewedSet = new Set(recentlyViewed.map(item => item.placeId));

  return scorePlaces({
    places,
    requestedTags: tags,
    interests: preferences.interests || [],
    budget: preferences.budget || "medium",
    viewedSet,
    savedSet,
    popularityMap,
    limit
  });
};

export const getPreferenceBasedRecommendations = async ({
  tags = [],
  interests = [],
  budget = "medium",
  limit = 12
}) => {
  const [places, popularityMap] = await Promise.all([getAllPlacesDetailed(), loadPopularityBoostMap()]);

  return scorePlaces({
    places,
    requestedTags: tags,
    interests,
    budget,
    popularityMap,
    limit
  });
};
