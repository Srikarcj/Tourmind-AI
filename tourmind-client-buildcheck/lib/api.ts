import {
  AdminAnalytics,
  AdvancedTripResponse,
  BudgetEstimate,
  ChatAssistantResponse,
  Booking,
  BookingHistoryEvent,
  BookingMessage,
  BookingStatus,
  DistrictSummary,
  MultiStopRoutePlan,
  NotificationItem,
  OptimizedRouteResult,
  Place,
  Recommendation,
  RoutePlan,
  SavedItinerary,
  SavedPlace,
  Service,
  StateSummary,
  TripResponse,
  UserPreferences
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const parseTimeoutMs = (
  rawValue: string | undefined,
  fallbackMs: number,
  minMs = 1000,
  maxMs = 120000
): number => {
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < minMs) {
    return fallbackMs;
  }

  return Math.min(normalized, maxMs);
};

const API_DEFAULT_TIMEOUT_MS = parseTimeoutMs(process.env.NEXT_PUBLIC_API_TIMEOUT_MS, 12000);
const API_QUICK_TIMEOUT_MS = parseTimeoutMs(process.env.NEXT_PUBLIC_API_QUICK_TIMEOUT_MS, 8000);
const API_AI_TIMEOUT_MS = parseTimeoutMs(process.env.NEXT_PUBLIC_API_AI_TIMEOUT_MS, 45000, 5000, 180000);

const API_UNREACHABLE_MESSAGE =
  "Cannot connect to the TourMind API. Make sure tourmind-api is running on http://localhost:5000.";
const API_TIMEOUT_MESSAGE = "TourMind API request timed out. Please try again.";

const API_SERVICE_UNAVAILABLE_MESSAGE =
  "Some TourMind features are temporarily unavailable while the database is offline. Please try again shortly.";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /failed to fetch|fetch failed|networkerror|network request failed|err_connection_refused/i.test(message);
};

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  /aborted|aborterror/i.test(error instanceof Error ? error.message : "");

const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 1,
  timeoutMs = API_DEFAULT_TIMEOUT_MS
): Promise<Response> => {
  const method = String(init?.method || "GET").toUpperCase();
  const isIdempotentRequest = ["GET", "HEAD", "OPTIONS"].includes(method);
  const effectiveRetries = isIdempotentRequest ? retries : 0;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= effectiveRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });

      if (
        response.status >= 500 &&
        response.status < 600 &&
        response.status !== 503 &&
        attempt < effectiveRetries
      ) {
        await sleep(250 * (attempt + 1));
        attempt += 1;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= effectiveRetries) {
        if (isAbortError(error)) {
          throw new Error(API_TIMEOUT_MESSAGE);
        }

        if (isNetworkError(error)) {
          throw new Error(API_UNREACHABLE_MESSAGE);
        }

        throw error;
      }

      await sleep(250 * (attempt + 1));
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || payload.detail || "Request failed");
  }

  return payload as T;
};

const withAuth = (token?: string): Record<string, string> =>
  token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};

export const fetchStates = async (): Promise<StateSummary[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/states`, { cache: "no-store" });
  const payload = await parseResponse<{ data: StateSummary[] }>(response);
  return payload.data;
};

export const fetchCategories = async (): Promise<string[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/categories`, { cache: "no-store" });
  const payload = await parseResponse<{ data: string[] }>(response);
  return payload.data;
};

export const fetchStateDistricts = async (slug: string): Promise<DistrictSummary[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/states/${slug}/districts`, { cache: "no-store" });
  const payload = await parseResponse<{ data: DistrictSummary[] }>(response);
  return payload.data;
};

export const fetchStatePlaces = async (
  slug: string,
  options: {
    category?: string;
    search?: string;
    discover?: boolean;
    source?: "manual" | "api" | "hybrid";
    refreshApi?: boolean;
    maxPlaces?: number;
    perQueryLimit?: number;
  } = {}
): Promise<{
  state: { code: string; slug: string; name: string };
  data: Place[];
  meta?: { discovered?: boolean; discoveredPlaceId?: string | null };
}> => {
  const url = new URL(`${API_URL}/api/states/${slug}/places`);

  if (options.category) {
    url.searchParams.set("category", options.category);
  }

  if (options.search) {
    url.searchParams.set("search", options.search);
  }

  if (typeof options.discover === "boolean") {
    url.searchParams.set("discover", String(options.discover));
  }

  if (options.source) {
    url.searchParams.set("source", options.source);
  }

  if (options.refreshApi) {
    url.searchParams.set("refreshApi", "true");
  }

  if (typeof options.maxPlaces === "number") {
    url.searchParams.set("maxPlaces", String(options.maxPlaces));
  }

  if (typeof options.perQueryLimit === "number") {
    url.searchParams.set("perQueryLimit", String(options.perQueryLimit));
  }

  const response = await fetchWithRetry(url, { cache: "no-store" });
  return parseResponse<{
    state: { code: string; slug: string; name: string };
    data: Place[];
    meta?: { discovered?: boolean; discoveredPlaceId?: string | null };
  }>(response);
};
export const fetchDiscoveredStatePlaces = async (slug: string): Promise<Place[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/states/${slug}/discovered`, { cache: "no-store" });
  const payload = await parseResponse<{ data: Place[] }>(response);
  return payload.data;
};

export const discoverPlace = async (body: { stateSlug: string; query: string }): Promise<Place> => {
  const response = await fetchWithRetry(`${API_URL}/api/places/discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: Place }>(response);
  return payload.data;
};

export const fetchPlace = async (
  id: string,
  options: { enrich?: boolean; refresh?: boolean } = {}
): Promise<Place> => {
  const url = new URL(`${API_URL}/api/places/${id}`);

  if (options.enrich) {
    url.searchParams.set("enrich", "true");
  }

  if (options.refresh) {
    url.searchParams.set("refresh", "true");
  }

  const response = await fetchWithRetry(url, { cache: "no-store" });
  const payload = await parseResponse<{ data: Place }>(response);
  return payload.data;
};

export const fetchRoutePlan = async (start: string, destination: string): Promise<RoutePlan> => {
  const url = new URL(`${API_URL}/api/routes`);
  url.searchParams.set("start", start);
  url.searchParams.set("destination", destination);

  const response = await fetchWithRetry(url, { cache: "no-store" });
  const payload = await parseResponse<{ data: RoutePlan }>(response);
  return payload.data;
};

export const fetchMultiStopRoutePlan = async (body: {
  start: { name?: string; lat?: number; lng?: number };
  stops: Array<{ name?: string; lat?: number; lng?: number }>;
  destination: { name?: string; lat?: number; lng?: number };
  fuelEfficiencyKmPerLiter?: number;
}): Promise<MultiStopRoutePlan> => {
  const response = await fetchWithRetry(`${API_URL}/api/routes/multi-stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: MultiStopRoutePlan }>(response);
  return payload.data;
};

export const generateTripPlan = async (body: {
  location: string;
  days: number;
  budget?: string;
  travelStyle?: string;
  interests?: string[];
}): Promise<TripResponse> => {
  const response = await fetchWithRetry(`${API_URL}/api/ai/generate-trip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: TripResponse }>(response);
  return payload.data;
};

const runTripAction = async (
  action: "regenerate-day" | "optimize-route" | "shorten-trip",
  body: {
    location: string;
    days: number;
    budget?: string;
    travelStyle?: string;
    interests?: string[];
  }
): Promise<TripResponse> => {
  const response = await fetchWithRetry(`${API_URL}/api/ai/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: TripResponse }>(response);
  return payload.data;
};

export const regenerateTripDay = (body: {
  location: string;
  days: number;
  budget?: string;
  travelStyle?: string;
  interests?: string[];
}) => runTripAction("regenerate-day", body);

export const optimizeTripRoute = (body: {
  location: string;
  days: number;
  budget?: string;
  travelStyle?: string;
  interests?: string[];
}) => runTripAction("optimize-route", body);

export const shortenTrip = (body: {
  location: string;
  days: number;
  budget?: string;
  travelStyle?: string;
  interests?: string[];
}) => runTripAction("shorten-trip", body);

export const exportTripItineraryEmail = async (token: string, body: { location: string; itinerary: unknown }) => {
  const response = await fetchWithRetry(`${API_URL}/api/ai/export-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: { success: boolean } }>(response);
  return payload.data;
};

export const fetchServices = async (type?: "hotel" | "travel"): Promise<Service[]> => {
  const url = new URL(`${API_URL}/api/bookings/services`);
  if (type) {
    url.searchParams.set("type", type);
  }

  const response = await fetchWithRetry(url, { cache: "no-store" });
  const payload = await parseResponse<{ data: Service[] }>(response);
  return payload.data;
};

export const createBooking = async (
  token: string,
  body: {
    serviceId?: string;
    serviceType?: "hotel" | "travel";
    placeId?: string;
    placeName?: string;
    stateName?: string;
    districtName?: string;
    startDate: string;
    endDate: string;
    guests: number;
    userNote?: string;
  }
): Promise<Booking> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: Booking }>(response);
  return payload.data;
};

export const fetchUserBookings = async (token: string): Promise<Booking[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/user`, {
    headers: withAuth(token),
    cache: "no-store"
  }, 0, API_QUICK_TIMEOUT_MS);

  const payload = await parseResponse<{ data: Booking[] }>(response);
  return payload.data;
};

export const fetchAdminBookings = async (token: string): Promise<Booking[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/admin`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: Booking[] }>(response);
  return payload.data;
};

export const fetchBookingHistory = async (token: string, bookingId: string): Promise<BookingHistoryEvent[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/${bookingId}/history`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: BookingHistoryEvent[] }>(response);
  return payload.data;
};

export const updateBookingNotes = async (
  token: string,
  body: { bookingId: string; userNote?: string; adminNote?: string }
): Promise<Booking> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/notes`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: Booking }>(response);
  return payload.data;
};

export const updateBookingStatus = async (
  token: string,
  body: { bookingId: string; status: BookingStatus; note?: string }
): Promise<Booking> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: Booking }>(response);
  return payload.data;
};

export const softDeleteBooking = async (token: string, bookingId: string) => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/${bookingId}`, {
    method: "DELETE",
    headers: withAuth(token)
  });

  const payload = await parseResponse<{ data: { success: boolean } }>(response);
  return payload.data;
};

export const fetchBookingMessages = async (token: string, bookingId: string): Promise<BookingMessage[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/${bookingId}/messages`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: BookingMessage[] }>(response);
  return payload.data;
};

export const sendBookingMessage = async (
  token: string,
  bookingId: string,
  message: string
): Promise<BookingMessage> => {
  const response = await fetchWithRetry(`${API_URL}/api/bookings/${bookingId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify({ message })
  });

  const payload = await parseResponse<{ data: BookingMessage }>(response);
  return payload.data;
};

export const fetchRecommendations = async (
  token: string,
  options: { tags?: string[]; limit?: number } = {}
): Promise<Recommendation[]> => {
  const url = new URL(`${API_URL}/api/recommendations`);

  if (options.tags && options.tags.length > 0) {
    url.searchParams.set("tags", options.tags.join(","));
  }

  if (options.limit) {
    url.searchParams.set("limit", String(options.limit));
  }

  const response = await fetchWithRetry(url, {
    headers: withAuth(token),
    cache: "no-store"
  }, 0, API_QUICK_TIMEOUT_MS);

  const payload = await parseResponse<{ data: Recommendation[] }>(response);
  return payload.data;
};

export const fetchUserPreferences = async (token: string): Promise<UserPreferences> => {
  const response = await fetchWithRetry(`${API_URL}/api/preferences`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: UserPreferences }>(response);
  return payload.data;
};

export const updateUserPreferences = async (
  token: string,
  body: {
    budget?: string;
    weatherPreference?: string;
    travelStyle?: string;
    interests?: string[];
  }
): Promise<UserPreferences> => {
  const response = await fetchWithRetry(`${API_URL}/api/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: UserPreferences }>(response);
  return payload.data;
};

export const fetchSavedPlaces = async (token: string): Promise<SavedPlace[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/saved-places`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: SavedPlace[] }>(response);
  return payload.data;
};

export const savePlace = async (token: string, placeId: string): Promise<SavedPlace> => {
  const response = await fetchWithRetry(`${API_URL}/api/saved-places`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify({ placeId })
  });

  const payload = await parseResponse<{ data: SavedPlace }>(response);
  return payload.data;
};

export const unsavePlace = async (token: string, placeId: string) => {
  const response = await fetchWithRetry(`${API_URL}/api/saved-places/${placeId}`, {
    method: "DELETE",
    headers: withAuth(token)
  });

  const payload = await parseResponse<{ data: { success: boolean } }>(response);
  return payload.data;
};

export const trackPlaceViewed = async (token: string, placeId: string) => {
  const response = await fetchWithRetry(`${API_URL}/api/places/${placeId}/viewed`, {
    method: "POST",
    headers: withAuth(token)
  });

  const payload = await parseResponse<{ data: { userId: string; placeId: string; viewedAt: string } }>(response);
  return payload.data;
};

export const fetchSavedItineraries = async (token: string): Promise<SavedItinerary[]> => {
  const response = await fetchWithRetry(`${API_URL}/api/saved-itineraries`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: SavedItinerary[] }>(response);
  return payload.data;
};

export const saveItinerary = async (token: string, title: string, itinerary: unknown): Promise<SavedItinerary> => {
  const response = await fetchWithRetry(`${API_URL}/api/saved-itineraries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify({ title, itinerary })
  });

  const payload = await parseResponse<{ data: SavedItinerary }>(response);
  return payload.data;
};

export const fetchNotifications = async (token: string, limit = 50): Promise<NotificationItem[]> => {
  const url = new URL(`${API_URL}/api/notifications`);
  url.searchParams.set("limit", String(limit));

  const response = await fetchWithRetry(url, {
    headers: withAuth(token),
    cache: "no-store"
  }, 0, API_QUICK_TIMEOUT_MS);

  const payload = await parseResponse<{ data: NotificationItem[] }>(response);
  return payload.data;
};

export const markNotificationRead = async (token: string, notificationId: string): Promise<NotificationItem> => {
  const response = await fetchWithRetry(`${API_URL}/api/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: withAuth(token)
  });

  const payload = await parseResponse<{ data: NotificationItem }>(response);
  return payload.data;
};

export const trackAnalyticsEvent = async (
  token: string,
  body: {
    eventType: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
) => {
  const response = await fetchWithRetry(`${API_URL}/api/analytics/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...withAuth(token)
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{ data: { success: boolean } }>(response);
  return payload.data;
};

export const fetchAdminAnalytics = async (token: string): Promise<AdminAnalytics> => {
  const response = await fetchWithRetry(`${API_URL}/api/admin/analytics`, {
    headers: withAuth(token),
    cache: "no-store"
  });

  const payload = await parseResponse<{ data: AdminAnalytics }>(response);
  return payload.data;
};



export const generateAdvancedTrip = async (body: {
  location: string;
  days: number;
  budget?: string;
  budgetType?: "low" | "medium" | "high" | string;
  travelType?: "solo" | "family" | "friends" | string;
  interests?: string[];
}): Promise<AdvancedTripResponse> => {
  const response = await fetchWithRetry(`${API_URL}/api/ai/generate-trip-advanced`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: AdvancedTripResponse }>(response);
  return payload.data;
};

export const optimizeRouteOrder = async (body: {
  placeIds?: string[];
  places?: Array<{
    id?: string;
    name?: string;
    category?: string;
    stateName?: string;
    stateSlug?: string;
    lat: number;
    lng: number;
  }>;
  startLocation?: { name?: string; lat?: number; lng?: number };
  clusterRadiusKm?: number;
}): Promise<OptimizedRouteResult> => {
  const response = await fetchWithRetry(`${API_URL}/api/route/optimize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: OptimizedRouteResult }>(response);
  return payload.data;
};

export const estimateBudget = async (body: {
  location: string;
  days: number;
  budget?: string;
  budgetType?: "low" | "medium" | "high" | string;
  travelType?: "solo" | "family" | "friends" | string;
  distanceKm?: number;
}): Promise<BudgetEstimate> => {
  const response = await fetchWithRetry(`${API_URL}/api/budget/estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: BudgetEstimate }>(response);
  return payload.data;
};

export const fetchPreferenceRecommendations = async (body: {
  tags?: string[];
  interests?: string[];
  budget?: string;
  limit?: number;
}): Promise<{
  recommendations: Recommendation[];
  suggestedDurationDays: number;
  suggestedRoutePlaceIds: string[];
}> => {
  const response = await fetchWithRetry(`${API_URL}/api/recommendations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseResponse<{
    data: {
      recommendations: Recommendation[];
      suggestedDurationDays: number;
      suggestedRoutePlaceIds: string[];
    };
  }>(response);

  return payload.data;
};

export const chatAssistant = async (body: {
  conversationId?: string;
  message: string;
}): Promise<ChatAssistantResponse> => {
  const response = await fetchWithRetry(`${API_URL}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 0, API_AI_TIMEOUT_MS);

  const payload = await parseResponse<{ data: ChatAssistantResponse }>(response);
  return payload.data;
};
