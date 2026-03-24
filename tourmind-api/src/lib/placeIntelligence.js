const normalizeText = value => String(value || "").trim().toLowerCase();

const CATEGORY_TO_TAGS = {
  temple: ["spiritual", "cultural"],
  historical: ["cultural"],
  heritage: ["cultural"],
  museum: ["cultural"],
  beach: ["nature", "relaxation"],
  hill: ["nature", "adventure"],
  waterfall: ["nature", "adventure"],
  wildlife: ["nature", "adventure"],
  adventure: ["adventure"],
  food: ["food"],
  market: ["food", "cultural"]
};

const hashCode = value => {
  const text = String(value || "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

export const inferPlaceTags = place => {
  const tags = new Set(Array.isArray(place?.tags) ? place.tags.map(normalizeText).filter(Boolean) : []);
  const category = normalizeText(place?.category);

  Object.entries(CATEGORY_TO_TAGS).forEach(([keyword, keywordTags]) => {
    if (category.includes(keyword)) {
      keywordTags.forEach(tag => tags.add(tag));
    }
  });

  const textBlob = `${place?.name || ""} ${place?.shortDescription || place?.short_description || ""} ${place?.fullDescription || place?.full_description || ""}`.toLowerCase();

  if (/(trek|hike|rafting|climb|trail|adventure)/.test(textBlob)) {
    tags.add("adventure");
  }

  if (/(peace|retreat|calm|relax|sunset|lake)/.test(textBlob)) {
    tags.add("relaxation");
  }

  if (/(temple|monastery|pilgrim|spiritual|shrine)/.test(textBlob)) {
    tags.add("spiritual");
  }

  if (/(food|street food|cuisine|market|restaurant)/.test(textBlob)) {
    tags.add("food");
  }

  if (/(night|nightlife|club|pub|party)/.test(textBlob)) {
    tags.add("nightlife");
  }

  if (tags.size === 0) {
    tags.add("cultural");
  }

  return Array.from(tags);
};

export const inferSeasonalScore = bestTimeToVisit => {
  const bestTime = normalizeText(bestTimeToVisit);

  if (!bestTime) {
    return 1;
  }

  const month = new Date().getUTCMonth() + 1;
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];

  const currentMonthName = monthNames[month - 1];
  const currentMonthShort = currentMonthName.slice(0, 3);

  if (bestTime.includes(currentMonthName) || bestTime.includes(currentMonthShort)) {
    return 2.2;
  }

  if (/(october|november|december|january|february|march)/.test(bestTime)) {
    return 1.3;
  }

  return 0.9;
};

export const inferEstimatedCostRange = place => {
  const category = normalizeText(place?.category);
  const name = normalizeText(place?.name);

  if (/(resort|premium|luxury|palace)/.test(name)) {
    return "high";
  }

  if (/(temple|museum|monastery|park)/.test(category)) {
    return "low";
  }

  if (/(beach|historical|heritage|hill|nature)/.test(category)) {
    return "medium";
  }

  return "medium";
};

export const inferPopularityScore = place => {
  if (Number.isFinite(Number(place?.popularityScore))) {
    return Number(place.popularityScore);
  }

  if (Number.isFinite(Number(place?.popularity_score))) {
    return Number(place.popularity_score);
  }

  const base = (hashCode(place?.id || place?.name || "") % 40) / 10;
  const seasonalBoost = inferSeasonalScore(place?.bestTimeToVisit || place?.best_time);
  return Number((1.2 + base + seasonalBoost * 0.4).toFixed(2));
};

export const normalizeBudgetCategory = value => {
  const raw = normalizeText(value);

  if (!raw) {
    return "medium";
  }

  if (/(budget|low|cheap|economy|under|backpack)/.test(raw)) {
    return "low";
  }

  if (/(high|premium|luxury|expensive)/.test(raw)) {
    return "high";
  }

  if (/(medium|mid|standard|balanced)/.test(raw)) {
    return "medium";
  }

  const numeric = Number(raw.replace(/[^0-9.]/g, ""));

  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric <= 3000) {
      return "low";
    }

    if (numeric <= 9000) {
      return "medium";
    }

    return "high";
  }

  return "medium";
};

export const normalizeTravelType = value => {
  const raw = normalizeText(value);

  if (/(solo|single)/.test(raw)) {
    return "solo";
  }

  if (/(family|kids|parents)/.test(raw)) {
    return "family";
  }

  if (/(friends|group|buddy)/.test(raw)) {
    return "friends";
  }

  return "solo";
};
