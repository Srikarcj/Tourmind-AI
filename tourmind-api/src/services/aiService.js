import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { dbQuery, isDbEnabled } from "../lib/db.js";

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

const toDailySlots = location => ({
  morning: `Visit iconic attraction in ${location}`,
  afternoon: `Explore local culture and food trail in ${location}`,
  evening: `Relaxed neighborhood walk and dinner in ${location}`
});

const buildFallbackItinerary = ({ location, days, budget, travelStyle, interests }) => {
  const interestSummary = Array.isArray(interests) && interests.length > 0 ? interests.join(", ") : "general travel";

  const dayPlans = Array.from({ length: days }, (_, index) => {
    const dayNumber = index + 1;
    return {
      day: dayNumber,
      title: `${travelStyle || "balanced"} exploration - Day ${dayNumber}`,
      places: [
        `${location} city center highlights`,
        `Local cultural attraction ${dayNumber}`,
        `Popular food street or market`
      ],
      timeSlots: toDailySlots(location),
      travelSequence: "Morning sightseeing -> Lunch break -> Evening local experience",
      routeOptimization: "Use clustered places to reduce travel time.",
      estimatedCost: {
        currency: "INR",
        amount: 2500 + dayNumber * 600,
        notes: budget ? `Budget aligned toward ${budget}.` : "Balanced spend plan."
      },
      tips: [
        "Start early to reduce travel delays.",
        "Use local transport or shared cabs for budget efficiency.",
        `Prioritize ${interestSummary} experiences today.`
      ]
    };
  });

  return {
    summary: `${days}-day itinerary for ${location} tuned for ${travelStyle || "balanced"} travel style and ${interestSummary}.`,
    budgetNotes: budget
      ? `Plan is adjusted for an approximate budget of ${budget}.`
      : "Budget not provided. Plan balances cost and coverage.",
    totalEstimatedCost: {
      currency: "INR",
      amount: dayPlans.reduce((sum, day) => sum + day.estimatedCost.amount, 0)
    },
    days: dayPlans,
    generalTips: [
      "Check weather and opening hours before each day.",
      "Keep digital and offline maps ready.",
      "Book intercity transport early in peak season."
    ]
  };
};

const parseJsonContent = content => {
  try {
    return JSON.parse(content);
  } catch (_error) {
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "");

    return JSON.parse(cleaned);
  }
};

const validateTripResponse = itinerary => {
  if (!itinerary || typeof itinerary !== "object") {
    throw new Error("Invalid itinerary payload.");
  }

  if (!Array.isArray(itinerary.days) || itinerary.days.length === 0) {
    throw new Error("Itinerary must include non-empty days array.");
  }

  itinerary.days = itinerary.days.map((day, index) => ({
    day: Number(day.day || index + 1),
    title: String(day.title || `Day ${index + 1}`),
    places: Array.isArray(day.places) ? day.places.map(item => String(item)) : [],
    timeSlots: {
      morning: String(day?.timeSlots?.morning || "Morning activity"),
      afternoon: String(day?.timeSlots?.afternoon || "Afternoon activity"),
      evening: String(day?.timeSlots?.evening || "Evening activity")
    },
    travelSequence: String(day.travelSequence || "Morning -> Afternoon -> Evening"),
    routeOptimization: String(day.routeOptimization || "Keep attractions grouped by area."),
    estimatedCost: {
      currency: String(day?.estimatedCost?.currency || "INR"),
      amount: Number(day?.estimatedCost?.amount || 0),
      notes: String(day?.estimatedCost?.notes || "")
    },
    tips: Array.isArray(day.tips) ? day.tips.map(item => String(item)) : []
  }));

  itinerary.summary = String(itinerary.summary || "Trip itinerary");
  itinerary.budgetNotes = String(itinerary.budgetNotes || "Budget notes unavailable.");
  itinerary.generalTips = Array.isArray(itinerary.generalTips)
    ? itinerary.generalTips.map(item => String(item))
    : [];

  const totalFromDays = itinerary.days.reduce((sum, day) => sum + Number(day.estimatedCost.amount || 0), 0);

  itinerary.totalEstimatedCost = {
    currency: String(itinerary?.totalEstimatedCost?.currency || "INR"),
    amount: Number(itinerary?.totalEstimatedCost?.amount || totalFromDays)
  };

  return itinerary;
};

const saveTripRequest = async ({ location, days, budget, itinerary }) => {
  if (!isDbEnabled) {
    return;
  }

  await dbQuery(
    `
    INSERT INTO ai_trip_requests (location, days, budget, itinerary)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [location, days, budget || null, JSON.stringify(itinerary)]
  );
};

const buildPrompt = ({ location, days, budget, travelStyle, interests, action }) => {
  const interestsText = Array.isArray(interests) && interests.length > 0 ? interests.join(", ") : "general";

  const actionText =
    action === "regenerate_day"
      ? "Regenerate at least one day with a fresh option while keeping rest coherent."
      : action === "optimize_route"
      ? "Prioritize route optimization and reduce backtracking."
      : action === "shorten_trip"
      ? "Condense high-impact activities and reduce travel overhead."
      : "Generate a balanced plan.";

  return `Create a ${days}-day travel itinerary for ${location} with ${budget || "flexible"} budget, travel style ${travelStyle || "balanced"}, and interests ${interestsText}. ${actionText}`;
};

export const generateTripPlan = async ({ location, days, budget, travelStyle, interests, action }) => {
  const fallback = buildFallbackItinerary({ location, days, budget, travelStyle, interests });

  if (!groq) {
    await saveTripRequest({ location, days, budget, itinerary: fallback });
    return {
      itinerary: fallback,
      provider: "fallback"
    };
  }

  const prompt = buildPrompt({ location, days, budget, travelStyle, interests, action });

  const completion = await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You are a professional India travel planner. Return valid JSON only with keys: summary, budgetNotes, totalEstimatedCost, days (array), generalTips. Each day must include: day,title,places,timeSlots{morning,afternoon,evening},travelSequence,routeOptimization,estimatedCost{currency,amount,notes},tips."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" }
  });

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    await saveTripRequest({ location, days, budget, itinerary: fallback });
    return {
      itinerary: fallback,
      provider: "fallback"
    };
  }

  let itinerary;

  try {
    itinerary = validateTripResponse(parseJsonContent(content));
  } catch (_error) {
    itinerary = fallback;
  }

  await saveTripRequest({ location, days, budget, itinerary });

  return {
    itinerary,
    provider: "groq"
  };
};
