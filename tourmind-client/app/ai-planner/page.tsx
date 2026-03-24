"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  exportTripItineraryEmail,
  generateTripPlan,
  optimizeTripRoute,
  regenerateTripDay,
  saveItinerary,
  shortenTrip
} from "@/lib/api";
import { TripResponse } from "@/lib/types";

const DEFAULT_INTERESTS = ["nature", "cultural"];

export default function AIPlannerPage() {
  const { getAccessToken } = useAuth();
  const [location, setLocation] = useState("Kerala");
  const [days, setDays] = useState(4);
  const [budget, setBudget] = useState("");
  const [travelStyle, setTravelStyle] = useState("family");
  const [interests, setInterests] = useState<string[]>(DEFAULT_INTERESTS);
  const [result, setResult] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const getPayload = () => ({
    location,
    days,
    budget: budget || undefined,
    travelStyle,
    interests
  });

  const runPlannerAction = async (
    fn: (body: { location: string; days: number; budget?: string; travelStyle?: string; interests?: string[] }) => Promise<TripResponse>
  ) => {
    try {
      setLoading(true);
      setError("");
      setNotice("");
      const payload = await fn(getPayload());
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate itinerary");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runPlannerAction(generateTripPlan);
  };

  const toggleInterest = (tag: string) => {
    setInterests(prev => (prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]));
  };

  const handleSaveItinerary = async () => {
    if (!result) {
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      await saveItinerary(token, `${location} ${days}-day plan`, result.itinerary);
      setNotice("Itinerary saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save itinerary.");
    }
  };

  const handleExportEmail = async () => {
    if (!result) {
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      await exportTripItineraryEmail(token, {
        location,
        itinerary: result.itinerary
      });
      setNotice("Itinerary emailed to your account.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export itinerary.");
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section>
        <h1 className="text-3xl font-semibold text-base">AI Trip Generator</h1>
        <p className="mt-2 text-sm text-base/70">
          Generate context-aware itineraries with budget, style, interests, route optimization, and daily cost hints.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            value={location}
            onChange={event => setLocation(event.target.value)}
            placeholder="Location or state"
            className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            required
          />
          <input
            type="number"
            min={1}
            max={15}
            value={days}
            onChange={event => setDays(Number(event.target.value))}
            className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            required
          />
          <input
            value={budget}
            onChange={event => setBudget(event.target.value)}
            placeholder="Budget (optional)"
            className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
          />
          <select
            value={travelStyle}
            onChange={event => setTravelStyle(event.target.value)}
            className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
          >
            <option value="family">Family</option>
            <option value="luxury">Luxury</option>
            <option value="backpack">Backpack</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {["adventure", "cultural", "food", "nature", "nightlife"].map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleInterest(tag)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                interests.includes(tag)
                  ? "border-accent bg-accent text-white"
                  : "border-base/20 bg-white text-base/70 hover:border-accent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Generating..." : "Generate Trip"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => runPlannerAction(regenerateTripDay)}
            className="rounded-xl border border-base px-4 py-2.5 text-sm font-semibold text-base transition hover:bg-base hover:text-white disabled:opacity-70"
          >
            Regenerate Day
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => runPlannerAction(optimizeTripRoute)}
            className="rounded-xl border border-base px-4 py-2.5 text-sm font-semibold text-base transition hover:bg-base hover:text-white disabled:opacity-70"
          >
            Optimize Route
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => runPlannerAction(shortenTrip)}
            className="rounded-xl border border-base px-4 py-2.5 text-sm font-semibold text-base transition hover:bg-base hover:text-white disabled:opacity-70"
          >
            Shorten Trip
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {result && (
        <section className="space-y-4">
          <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
            <p className="text-xs uppercase tracking-[0.16em] text-base/55">Provider: {result.provider}</p>
            <h2 className="mt-2 text-2xl font-semibold text-base">{result.itinerary.summary}</h2>
            <p className="mt-2 text-sm text-base/75">{result.itinerary.budgetNotes}</p>
            <p className="mt-2 text-sm font-semibold text-accent">
              Estimated Total: {result.itinerary.totalEstimatedCost.currency} {result.itinerary.totalEstimatedCost.amount}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveItinerary}
                className="rounded-xl bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
              >
                Save Itinerary
              </button>
              <button
                type="button"
                onClick={handleExportEmail}
                className="rounded-xl border border-base px-4 py-2 text-sm font-semibold text-base transition hover:bg-base hover:text-white"
              >
                Email Export
              </button>
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.itinerary.days.map(day => (
              <article key={day.day} className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
                <h3 className="text-lg font-semibold text-base">
                  Day {day.day}: {day.title}
                </h3>
                <p className="mt-2 text-sm font-medium text-accent">Time Slots</p>
                <p className="text-sm text-base/75">Morning: {day.timeSlots.morning}</p>
                <p className="text-sm text-base/75">Afternoon: {day.timeSlots.afternoon}</p>
                <p className="text-sm text-base/75">Evening: {day.timeSlots.evening}</p>
                <p className="mt-3 text-sm font-medium text-accent">Route Optimization</p>
                <p className="text-sm text-base/75">{day.routeOptimization}</p>
                <p className="mt-3 text-sm font-medium text-accent">Estimated Cost</p>
                <p className="text-sm text-base/75">
                  {day.estimatedCost.currency} {day.estimatedCost.amount} - {day.estimatedCost.notes}
                </p>
                <p className="mt-3 text-sm font-medium text-accent">Places</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-base/75">
                  {day.places.map(place => (
                    <li key={`${day.day}-${place}`}>{place}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-medium text-accent">Tips</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-base/75">
                  {day.tips.map(tip => (
                    <li key={`${day.day}-${tip}`}>{tip}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
            <h3 className="text-lg font-semibold text-base">General Travel Tips</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-base/75">
              {result.itinerary.generalTips.map(tip => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </div>
  );
}


