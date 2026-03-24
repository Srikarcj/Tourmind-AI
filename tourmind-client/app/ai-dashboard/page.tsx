"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import BudgetBreakdown from "@/components/BudgetBreakdown";
import PreferencesForm from "@/components/PreferencesForm";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchPreferenceRecommendations,
  generateAdvancedTrip,
  saveItinerary,
  updateUserPreferences
} from "@/lib/api";
import { AdvancedTripResponse, Recommendation } from "@/lib/types";

const MapOptimizedRoute = dynamic(() => import("@/components/MapOptimizedRoute"), {
  ssr: false,
  loading: () => <p className="text-sm text-base/70">Loading optimized route map...</p>
});

export default function AIPlannerDashboardPage() {
  const { user, getAccessToken } = useAuth();

  const [location, setLocation] = useState("Andhra Pradesh");
  const [days, setDays] = useState(3);
  const [budgetType, setBudgetType] = useState("medium");
  const [travelType, setTravelType] = useState("solo");
  const [interests, setInterests] = useState<string[]>(["cultural", "nature"]);
  const [trip, setTrip] = useState<AdvancedTripResponse | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [suggestedDurationDays, setSuggestedDurationDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canSave = useMemo(() => Boolean(user && trip), [trip, user]);

  const toggleInterest = (tag: string) => {
    setInterests(prev => (prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const [advancedTrip, recommendationPayload] = await Promise.all([
        generateAdvancedTrip({
          location,
          days,
          budgetType,
          travelType,
          interests
        }),
        fetchPreferenceRecommendations({
          budget: budgetType,
          interests,
          tags: interests,
          limit: 10
        })
      ]);

      setTrip(advancedTrip);
      setRecommendations(recommendationPayload.recommendations);
      setSuggestedDurationDays(recommendationPayload.suggestedDurationDays);

      const token = await getAccessToken();
      if (token) {
        await updateUserPreferences(token, {
          budget: budgetType,
          travelStyle: travelType,
          interests
        });
      }
    } catch (submitError) {
      setTrip(null);
      setRecommendations([]);
      setSuggestedDurationDays(null);
      setError(submitError instanceof Error ? submitError.message : "Unable to build advanced plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItinerary = async () => {
    if (!trip) {
      return;
    }

    try {
      const token = await getAccessToken();

      if (!token) {
        setError("Sign in to save itinerary.");
        return;
      }

      await saveItinerary(token, `${location} ${days}-day advanced plan`, trip.itinerary);
      setNotice("Itinerary saved to your account.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save itinerary.");
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">AI Planner Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Smart Travel Assistant</h1>
        <p className="mt-2 text-sm text-base/75">
          Generate realistic day-wise itineraries, optimize route order, estimate budget, and discover hidden gems.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="glass-card p-6">
          <h2 className="text-xl font-semibold text-base">Trip Inputs</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              value={location}
              onChange={event => setLocation(event.target.value)}
              className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
              placeholder="Location"
              required
            />
            <input
              type="number"
              value={days}
              min={1}
              max={15}
              onChange={event => setDays(Number(event.target.value))}
              className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-70"
            >
              {loading ? "Generating..." : "Generate Advanced Plan"}
            </button>
          </div>
        </section>

        <PreferencesForm
          budgetType={budgetType}
          travelType={travelType}
          interests={interests}
          onBudgetTypeChange={setBudgetType}
          onTravelTypeChange={setTravelType}
          onToggleInterest={toggleInterest}
        />
      </form>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {recommendations.length > 0 && (
        <section className="glass-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-base">Personalized Recommendations</h2>
            {suggestedDurationDays && (
              <p className="text-sm font-medium text-accent">Suggested duration: {suggestedDurationDays} days</p>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recommendations.map(item => (
              <article key={item.id} className="rounded-xl border border-base/15 bg-white/85 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-base/55">{item.category}</p>
                <p className="mt-1 font-semibold text-base">{item.name}</p>
                <p className="text-sm text-base/70">{item.stateName}</p>
                <p className="mt-2 text-xs text-accent">Score: {item.score.toFixed(2)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {trip && (
        <>
          {!trip.validation.isRealistic && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <h3 className="text-base font-semibold text-amber-900">Smart Day Planner Validation</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {trip.validation.warnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          <BudgetBreakdown budget={trip.budgetEstimate} />

          <section className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-base">Route Optimization Map View</h2>
              <p className="text-sm text-base/70">
                {trip.optimizedRoute.totalDistanceKm} km | {trip.optimizedRoute.totalTravelTimeHours} h
              </p>
            </div>

            <div className="mt-4">
              <MapOptimizedRoute
                places={trip.optimizedRoute.orderedPlaces}
                polyline={trip.optimizedRoute.polyline}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {trip.optimizedRoute.clusters.map(cluster => (
                <article key={cluster.id} className="rounded-xl border border-base/15 bg-white/80 p-3">
                  <p className="text-sm font-semibold text-base">{cluster.label}</p>
                  <p className="text-xs text-base/60">{cluster.placeIds.length} place(s)</p>
                  <p className="mt-1 text-sm text-base/75">{cluster.places.map(item => item.name).join(", ")}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-base">Enhanced Itinerary</h2>
              {canSave && (
                <button
                  type="button"
                  onClick={handleSaveItinerary}
                  className="rounded-xl bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
                >
                  Save Itinerary
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-base/75">{trip.itinerary.summary}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {trip.itinerary.days.map(day => (
                <article key={day.day} className="rounded-xl border border-base/15 bg-white/85 p-4">
                  <h3 className="text-lg font-semibold text-base">
                    Day {day.day}: {day.title}
                  </h3>
                  <p className="mt-2 text-sm text-base/75">Morning: {day.timeSlots.morning}</p>
                  <p className="text-sm text-base/75">Afternoon: {day.timeSlots.afternoon}</p>
                  <p className="text-sm text-base/75">Evening: {day.timeSlots.evening}</p>
                  <p className="mt-2 text-sm text-base/80">{day.travelSequence}</p>
                  <p className="mt-2 text-sm text-accent">INR {day.estimatedCost.amount}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <h2 className="text-xl font-semibold text-base">Hidden Gems Suggestion</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {trip.hiddenGems.map(group => (
                <article key={group.anchorPlaceId} className="rounded-xl border border-base/15 bg-white/80 p-4">
                  <p className="text-sm font-semibold text-base">Near {group.anchorPlaceName}</p>
                  {group.gems.length === 0 ? (
                    <p className="mt-2 text-sm text-base/70">No nearby hidden gems found in current dataset.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-base/75">
                      {group.gems.map(gem => (
                        <li key={gem.id}>{gem.name} ({gem.category})</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
