export type StateSummary = {
  code: string;
  slug: string;
  name: string;
  placeCount: number;
};

export type DistrictSummary = {
  id: string | null;
  slug: string;
  name: string;
  stateCode: string;
  stateSlug: string;
  stateName: string;
  placeCount: number;
};

export type Place = {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  bestTimeToVisit: string;
  nearbyPlaces: string[];
  travelTips: string[];
  itinerarySuggestions?: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  stateCode: string;
  stateName: string;
  stateSlug: string;
  districtName?: string;
  tags?: string[];
  popularityScore?: number;
  seasonalScore?: number;
  estimatedCostRange?: "low" | "medium" | "high" | string;
  source?: string;
  isAIGenerated?: boolean;
  discoveredAt?: string | null;
  enriched?: {
    source?: string;
    wikipediaUrl?: string;
    osmDisplayName?: string;
    refreshedAt?: string;
  };
};

export type Recommendation = Place & {
  score: number;
};

export type NearbySpot = {
  id: string;
  name: string;
  stateName: string;
  category: string;
  distanceKm: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  estimatedCostRange?: string;
  popularityScore?: number;
  tags?: string[];
};

export type RoutePlan = {
  start: {
    name: string;
    lat: number;
    lng: number;
  };
  destination: {
    name: string;
    lat: number;
    lng: number;
  };
  distanceKm: number;
  travelTimeHours?: number;
  polyline: [number, number][];
  nearbySpots: NearbySpot[];
};

export type MultiStopRoutePlan = {
  start: {
    name: string;
    lat: number;
    lng: number;
  };
  stops: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
  destination: {
    name: string;
    lat: number;
    lng: number;
  };
  segments: Array<{
    from: { name: string; lat: number; lng: number };
    to: { name: string; lat: number; lng: number };
    distanceKm: number;
    travelTimeHours: number;
  }>;
  totalDistanceKm: number;
  totalTimeHours: number;
  fuelEstimateLiters: number;
  polyline: [number, number][];
  suggestions: {
    foodStops: NearbySpot[];
    scenicSpots: NearbySpot[];
    restPoints: NearbySpot[];
  };
};

export type ItineraryDay = {
  day: number;
  title: string;
  places: string[];
  timeSlots: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  travelSequence: string;
  routeOptimization: string;
  estimatedCost: {
    currency: string;
    amount: number;
    notes: string;
  };
  tips: string[];
};

export type Itinerary = {
  summary: string;
  budgetNotes: string;
  totalEstimatedCost: {
    currency: string;
    amount: number;
  };
  days: ItineraryDay[];
  generalTips: string[];
};

export type TripResponse = {
  itinerary: Itinerary;
  provider: string;
};

export type OptimizedRouteResult = {
  orderedPlaces: Array<{
    id: string;
    name: string;
    category: string;
    stateName: string;
    stateSlug: string;
    coordinates: {
      lat: number;
      lng: number;
    };
    tags: string[];
    popularityScore: number;
    seasonalScore: number;
    estimatedCostRange: string;
    shortDescription: string;
  }>;
  clusters: Array<{
    id: string;
    label: string;
    center: { lat: number; lng: number };
    placeIds: string[];
    places: Array<{
      id: string;
      name: string;
      category: string;
      stateName: string;
      stateSlug: string;
      coordinates: { lat: number; lng: number };
      tags: string[];
      popularityScore: number;
      seasonalScore: number;
      estimatedCostRange: string;
      shortDescription: string;
    }>;
  }>;
  totalDistanceKm: number;
  totalTravelTimeHours: number;
  polyline: [number, number][];
  start: { name: string; lat: number; lng: number } | null;
  end: {
    id: string;
    name: string;
    category: string;
    stateName: string;
    stateSlug: string;
    coordinates: { lat: number; lng: number };
    tags: string[];
    popularityScore: number;
    seasonalScore: number;
    estimatedCostRange: string;
    shortDescription: string;
  } | null;
};

export type BudgetEstimate = {
  currency: string;
  budgetCategory: "low" | "medium" | "high";
  travelType: "solo" | "family" | "friends";
  location: string;
  days: number;
  total: number;
  dailyAverage: number;
  breakdown: {
    transport: number;
    accommodation: number;
    food: number;
    misc: number;
  };
  notes: string[];
};

export type AdvancedTripResponse = {
  provider: string;
  itinerary: Itinerary;
  budgetEstimate: BudgetEstimate;
  optimizedRoute: OptimizedRouteResult;
  recommendedDurationDays: number;
  recommendedPlaces: OptimizedRouteResult["orderedPlaces"];
  hiddenGems: Array<{
    anchorPlaceId: string;
    anchorPlaceName: string;
    gems: Array<{
      id: string;
      name: string;
      category: string;
      stateName: string;
      coordinates: { lat: number; lng: number };
      popularityScore: number;
      estimatedCostRange: string;
      tags: string[];
    }>;
  }>;
  validation: {
    isRealistic: boolean;
    warnings: string[];
  };
};

export type ChatAssistantResponse = {
  conversationId: string;
  intent: string;
  reply: string;
  data: {
    type: "trip_plan" | "budget" | "recommendations" | "general";
    trip?: AdvancedTripResponse;
    budget?: BudgetEstimate;
    recommendations?: OptimizedRouteResult["orderedPlaces"];
  };
};

export type ServiceType = "hotel" | "travel";

export type Service = {
  id: string;
  name: string;
  location: string;
  priceRange: string;
  type: ServiceType;
  contactInfo: string;
  createdAt: string;
};

export type BookingStatus = "pending" | "reviewed" | "confirmed" | "completed" | "cancelled";

export type Booking = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  serviceId: string;
  serviceName: string;
  serviceType: ServiceType;
  serviceLocation: string;
  serviceContactInfo: string;
  servicePriceRange: string;
  startDate: string;
  endDate: string;
  guests: number;
  status: BookingStatus;
  userNote?: string | null;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByEmail: string | null;
  deletedAt?: string | null;
};

export type BookingHistoryEvent = {
  id: number;
  bookingId: string;
  previousStatus: BookingStatus | null;
  newStatus: BookingStatus;
  note: string | null;
  changedByEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type BookingMessage = {
  id: string;
  bookingId: string;
  senderId: string;
  senderRole: "user" | "admin" | "system";
  message: string;
  createdAt: string;
};

export type UserPreferences = {
  userId: string;
  budget: string | null;
  weatherPreference: string | null;
  travelStyle: string | null;
  interests: string[];
  updatedAt: string | null;
};

export type NotificationItem = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

export type SavedPlace = {
  id: string;
  userId: string;
  placeId: string;
  createdAt: string;
};

export type SavedItinerary = {
  id: string;
  userId: string;
  title: string;
  itinerary: Itinerary;
  createdAt: string;
  updatedAt: string;
};

export type AdminAnalytics = {
  totals: {
    bookings: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    conversionRate: number;
  };
  popularDestinations: Array<{
    location: string;
    bookings: number;
  }>;
  bookingsByStatus: Array<{
    status: string;
    count: number;
  }>;
  recentEvents: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};
