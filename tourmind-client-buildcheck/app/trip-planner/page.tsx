"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchMultiStopRoutePlan, fetchRoutePlan } from "@/lib/api";
import { MultiStopRoutePlan, RoutePlan } from "@/lib/types";

const MapRoute = dynamic(() => import("@/components/MapRoute"), {
  ssr: false,
  loading: () => <p className="text-sm text-base/70">Loading route map...</p>
});

type PlannerMode = "auto" | "simple" | "multi";

type RecentPlan = {
  id: string;
  mode: "simple" | "multi";
  start: string;
  destination: string;
  stopsInput: string;
  fuelEfficiency: number;
  fuelPricePerLiter: number;
  breakMinutes: number;
  departureTime: string;
  includeReturnTrip: boolean;
  distanceKm: number;
  createdAt: string;
};

type SegmentView = {
  fromName: string;
  toName: string;
  distanceKm: number;
  travelTimeHours: number;
};

type PresetRoute = {
  label: string;
  description: string;
  start: string;
  destination: string;
  stops: string[];
};

const RECENT_PLANS_KEY = "tourmind.tripPlanner.recent.v2";

const PRESET_ROUTES: PresetRoute[] = [
  {
    label: "Golden Triangle",
    description: "Classic North India loop",
    start: "New Delhi",
    destination: "Jaipur",
    stops: ["Agra", "Fatehpur Sikri"]
  },
  {
    label: "Coastal Andhra",
    description: "Beach + city hopping",
    start: "Visakhapatnam",
    destination: "Vijayawada",
    stops: ["Kakinada", "Rajahmundry"]
  },
  {
    label: "Hill Escape",
    description: "Bengaluru to Western Ghats",
    start: "Bengaluru",
    destination: "Mysuru",
    stops: ["Ramanagara", "Coorg"]
  },
  {
    label: "Quick Direct",
    description: "Simple no-stop route",
    start: "Hyderabad",
    destination: "Warangal",
    stops: []
  }
];

const distanceFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const toClockMinutes = (value: string) => {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 8 * 60;
  }

  return hours * 60 + minutes;
};

const toClockLabel = (minutes: number) => {
  const dayOffset = Math.floor(minutes / (24 * 60));
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const min = Math.floor(normalized % 60)
    .toString()
    .padStart(2, "0");

  return dayOffset > 0 ? `Day +${dayOffset} ${hour}:${min}` : `${hour}:${min}`;
};

const estimateDriveHours = (distanceKm: number) => {
  if (distanceKm <= 0) {
    return 0;
  }

  return Number((distanceKm / 42).toFixed(2));
};

export default function TripPlannerPage() {
  const [start, setStart] = useState("New Delhi");
  const [destination, setDestination] = useState("Agra");
  const [stopsInput, setStopsInput] = useState("Mathura");
  const [fuelEfficiency, setFuelEfficiency] = useState(14);
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState(104);
  const [departureTime, setDepartureTime] = useState("07:30");
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("auto");
  const [includeReturnTrip, setIncludeReturnTrip] = useState(false);

  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [advancedRoute, setAdvancedRoute] = useState<MultiStopRoutePlan | null>(null);
  const [baselineDirectRoute, setBaselineDirectRoute] = useState<RoutePlan | null>(null);

  const [recentPlans, setRecentPlans] = useState<RecentPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const parsedStops = useMemo(
    () =>
      stopsInput
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean)
        .map(name => ({ name })),
    [stopsInput]
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_PLANS_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as RecentPlan[];
      if (Array.isArray(parsed)) {
        setRecentPlans(parsed.slice(0, 6));
      }
    } catch (_error) {
      setRecentPlans([]);
    }
  }, []);

  const activeMode = useMemo(() => {
    if (plannerMode === "auto") {
      return parsedStops.length > 0 ? "multi" : "simple";
    }

    return plannerMode;
  }, [parsedStops.length, plannerMode]);

  const activeSegments = useMemo<SegmentView[]>(() => {
    if (advancedRoute) {
      return advancedRoute.segments.map(segment => ({
        fromName: segment.from.name,
        toName: segment.to.name,
        distanceKm: segment.distanceKm,
        travelTimeHours: segment.travelTimeHours
      }));
    }

    if (route) {
      return [
        {
          fromName: route.start.name,
          toName: route.destination.name,
          distanceKm: route.distanceKm,
          travelTimeHours: route.travelTimeHours || estimateDriveHours(route.distanceKm)
        }
      ];
    }

    return [];
  }, [advancedRoute, route]);

  const timeline = useMemo(() => {
    if (activeSegments.length === 0) {
      return [];
    }

    let cursor = toClockMinutes(departureTime);

    return activeSegments.map((segment, index) => {
      const departAt = cursor;
      const travelMinutes = Math.max(10, Math.round(segment.travelTimeHours * 60));
      const arriveAt = departAt + travelMinutes;

      cursor = arriveAt + (index < activeSegments.length - 1 ? breakMinutes : 0);

      return {
        ...segment,
        departLabel: toClockLabel(departAt),
        arriveLabel: toClockLabel(arriveAt)
      };
    });
  }, [activeSegments, breakMinutes, departureTime]);

  const activeDistanceKm = advancedRoute ? advancedRoute.totalDistanceKm : route?.distanceKm || 0;
  const activeDriveHours = advancedRoute
    ? advancedRoute.totalTimeHours
    : route?.travelTimeHours || estimateDriveHours(activeDistanceKm);

  const roundTripFactor = includeReturnTrip ? 2 : 1;
  const adjustedDistanceKm = Number((activeDistanceKm * roundTripFactor).toFixed(1));
  const adjustedDriveHours = Number((activeDriveHours * roundTripFactor).toFixed(2));

  const oneWayFuelLiters = advancedRoute
    ? advancedRoute.fuelEstimateLiters
    : activeDistanceKm > 0 && fuelEfficiency > 0
      ? activeDistanceKm / fuelEfficiency
      : 0;

  const fuelLiters = Number((oneWayFuelLiters * roundTripFactor).toFixed(1));
  const fuelCost = Math.round(fuelLiters * fuelPricePerLiter);
  const co2Kg = Number((fuelLiters * 2.31).toFixed(1));

  const directRouteDetourKm =
    advancedRoute && baselineDirectRoute ? Number((advancedRoute.totalDistanceKm - baselineDirectRoute.distanceKm).toFixed(1)) : null;

  const mapStart = advancedRoute ? advancedRoute.start : route?.start;
  const mapDestination = advancedRoute ? advancedRoute.destination : route?.destination;
  const mapPolyline = advancedRoute ? advancedRoute.polyline : route?.polyline;

  const pushRecentPlan = (distanceKm: number, mode: "simple" | "multi") => {
    const entry: RecentPlan = {
      id: `${Date.now()}`,
      mode,
      start,
      destination,
      stopsInput,
      fuelEfficiency,
      fuelPricePerLiter,
      breakMinutes,
      departureTime,
      includeReturnTrip,
      distanceKm,
      createdAt: new Date().toISOString()
    };

    const next = [entry, ...recentPlans].slice(0, 6);
    setRecentPlans(next);
    window.localStorage.setItem(RECENT_PLANS_KEY, JSON.stringify(next));
  };

  const applyPreset = (preset: PresetRoute) => {
    setStart(preset.start);
    setDestination(preset.destination);
    setStopsInput(preset.stops.join("\n"));
    setPlannerMode(preset.stops.length > 0 ? "multi" : "simple");
    setNotice(`Loaded preset: ${preset.label}`);
    setError("");
  };

  const addStop = (name: string) => {
    const normalized = name.trim();
    if (!normalized) {
      return;
    }

    const existing = parsedStops.some(item => item.name.toLowerCase() === normalized.toLowerCase());
    if (existing) {
      return;
    }

    setStopsInput(previous => (previous.trim() ? `${previous.trim()}\n${normalized}` : normalized));
    setNotice(`Added ${normalized} to your stops.`);
  };

  const copyRouteBrief = async () => {
    if (!route && !advancedRoute) {
      return;
    }

    const summaryLines = [
      `Trip Plan: ${start} to ${destination}`,
      `Mode: ${advancedRoute ? "Multi-stop" : "Direct"}`,
      `Distance: ${distanceFormatter.format(adjustedDistanceKm)} km${includeReturnTrip ? " (round trip)" : ""}`,
      `Drive Time: ${adjustedDriveHours} h`,
      `Fuel: ${fuelLiters} L`,
      `Fuel Cost: INR ${currencyFormatter.format(fuelCost)}`,
      "",
      "Segments:",
      ...activeSegments.map(
        (segment, index) =>
          `${index + 1}. ${segment.fromName} to ${segment.toName} (${distanceFormatter.format(segment.distanceKm)} km, ${segment.travelTimeHours} h)`
      )
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join("\n"));
      setNotice("Route summary copied.");
    } catch (_error) {
      setError("Unable to copy route summary right now.");
    }
  };

  const exportRouteJson = () => {
    if (!route && !advancedRoute) {
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      planner: {
        start,
        destination,
        mode: advancedRoute ? "multi" : "simple",
        stops: parsedStops.map(item => item.name),
        fuelEfficiency,
        fuelPricePerLiter,
        departureTime,
        breakMinutes,
        includeReturnTrip
      },
      metrics: {
        distanceKm: adjustedDistanceKm,
        driveHours: adjustedDriveHours,
        fuelLiters,
        fuelCost,
        co2Kg
      },
      route: advancedRoute || route
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `tourmind-route-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setNotice("Route JSON exported.");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!start.trim() || !destination.trim()) {
      setError("Start and destination are required.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      if (activeMode === "multi") {
        if (parsedStops.length === 0) {
          throw new Error("Add at least one stop or switch to Direct mode.");
        }

        const [multiRoute, directRoute] = await Promise.all([
          fetchMultiStopRoutePlan({
            start: { name: start },
            stops: parsedStops,
            destination: { name: destination },
            fuelEfficiencyKmPerLiter: fuelEfficiency
          }),
          fetchRoutePlan(start, destination)
        ]);

        setAdvancedRoute(multiRoute);
        setBaselineDirectRoute(directRoute);
        setRoute(null);
        pushRecentPlan(multiRoute.totalDistanceKm, "multi");
        setNotice("Multi-stop route generated with timeline and fuel projection.");
      } else {
        const simpleRoute = await fetchRoutePlan(start, destination);
        setRoute(simpleRoute);
        setAdvancedRoute(null);
        setBaselineDirectRoute(null);
        pushRecentPlan(simpleRoute.distanceKm, "simple");
        setNotice("Direct route generated.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to generate route.");
      setRoute(null);
      setAdvancedRoute(null);
      setBaselineDirectRoute(null);
    } finally {
      setLoading(false);
    }
  };

  const restorePlan = (plan: RecentPlan) => {
    setStart(plan.start);
    setDestination(plan.destination);
    setStopsInput(plan.stopsInput);
    setFuelEfficiency(plan.fuelEfficiency);
    setFuelPricePerLiter(plan.fuelPricePerLiter);
    setBreakMinutes(plan.breakMinutes);
    setDepartureTime(plan.departureTime);
    setIncludeReturnTrip(plan.includeReturnTrip);
    setPlannerMode(plan.mode);
    setNotice("Loaded recent plan. Click Plan Route to regenerate with live data.");
  };

  const clearRecentPlans = () => {
    setRecentPlans([]);
    window.localStorage.removeItem(RECENT_PLANS_KEY);
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="relative overflow-hidden rounded-[28px] border border-base/10 bg-white/80 p-6 shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -left-20 top-0 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-8 h-48 w-48 rounded-full bg-highlight/25 blur-3xl" />
        <p className="text-xs uppercase tracking-[0.2em] text-base/55">Trip Planner Pro</p>
        <h1 className="mt-2 max-w-3xl font-[var(--font-lora)] text-3xl font-semibold text-base sm:text-4xl">
          Build, stress-test, and export smarter road routes
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-base/75 sm:text-base">
          Use a control-deck workflow with presets, multi-stop intelligence, timeline planning, and fuel/cost forecasting.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {PRESET_ROUTES.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-full border border-base/20 bg-white/80 px-3 py-1.5 text-xs font-semibold text-base transition hover:border-accent hover:text-accent"
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-base/15 bg-white/85 p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "auto", label: "Auto" },
            { key: "simple", label: "Direct" },
            { key: "multi", label: "Multi-stop" }
          ].map(mode => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setPlannerMode(mode.key as PlannerMode)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                plannerMode === mode.key
                  ? "bg-base text-white"
                  : "border border-base/20 bg-white text-base hover:border-accent hover:text-accent"
              }`}
            >
              {mode.label}
            </button>
          ))}
          <p className="self-center text-xs text-base/60">Current planner mode: {activeMode === "multi" ? "Multi-stop" : "Direct"}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Start</span>
            <input
              value={start}
              onChange={event => setStart(event.target.value)}
              placeholder="Start location"
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Destination</span>
            <input
              value={destination}
              onChange={event => setDestination(event.target.value)}
              placeholder="Destination"
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Fuel efficiency (km/l)</span>
            <input
              type="number"
              min={5}
              max={55}
              value={fuelEfficiency}
              onChange={event => setFuelEfficiency(Number(event.target.value))}
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Fuel price (INR/L)</span>
            <input
              type="number"
              min={60}
              max={200}
              value={fuelPricePerLiter}
              onChange={event => setFuelPricePerLiter(Number(event.target.value))}
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Stops (one per line)</span>
          <textarea
            value={stopsInput}
            onChange={event => setStopsInput(event.target.value)}
            placeholder="Optional stops (one per line)"
            className="min-h-24 w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Departure</span>
            <input
              type="time"
              value={departureTime}
              onChange={event => setDepartureTime(event.target.value)}
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base/60">Buffer after each segment</span>
            <select
              value={breakMinutes}
              onChange={event => setBreakMinutes(Number(event.target.value))}
              className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>

          <label className="mt-6 flex items-center gap-2 rounded-xl border border-base/15 bg-white/70 px-3 py-2 text-sm text-base/75">
            <input
              type="checkbox"
              checked={includeReturnTrip}
              onChange={event => setIncludeReturnTrip(event.target.checked)}
              className="h-4 w-4 accent-base"
            />
            Include round trip cost estimate
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-base px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Planning..." : activeMode === "multi" ? "Generate Multi-stop Route" : "Generate Route"}
          </button>

          <button
            type="button"
            onClick={() => {
              setRoute(null);
              setAdvancedRoute(null);
              setBaselineDirectRoute(null);
              setError("");
              setNotice("Cleared current route result.");
            }}
            className="rounded-xl border border-base/20 bg-white px-5 py-2.5 text-sm font-semibold text-base transition hover:border-accent hover:text-accent"
          >
            Clear Result
          </button>
        </div>
      </form>

      {recentPlans.length > 0 && (
        <section className="rounded-2xl border border-base/15 bg-white/80 p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-base">Recent Control Decks</h2>
            <button
              type="button"
              onClick={clearRecentPlans}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-base/55 hover:text-rose-700"
            >
              Clear history
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentPlans.map(plan => (
              <button
                key={plan.id}
                type="button"
                onClick={() => restorePlan(plan)}
                className="rounded-xl border border-base/15 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-accent"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-base/50">{plan.mode === "multi" ? "Multi-stop" : "Direct"}</p>
                <p className="mt-1 text-sm font-semibold text-base">
                  {plan.start} to {plan.destination}
                </p>
                <p className="mt-1 text-xs text-base/65">{distanceFormatter.format(plan.distanceKm)} km</p>
                <p className="mt-1 text-xs text-base/50">{new Date(plan.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {(route || advancedRoute) && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <article className="rounded-2xl border border-base/15 bg-white p-4 shadow-soft">
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">Distance</p>
              <p className="mt-2 text-2xl font-semibold text-base">{distanceFormatter.format(adjustedDistanceKm)} km</p>
              <p className="mt-1 text-xs text-base/60">{includeReturnTrip ? "Round trip enabled" : "One way"}</p>
            </article>

            <article className="rounded-2xl border border-base/15 bg-white p-4 shadow-soft">
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">Drive Time</p>
              <p className="mt-2 text-2xl font-semibold text-base">{adjustedDriveHours} h</p>
              <p className="mt-1 text-xs text-base/60">Includes traffic-safe estimate</p>
            </article>

            <article className="rounded-2xl border border-base/15 bg-white p-4 shadow-soft">
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">Fuel</p>
              <p className="mt-2 text-2xl font-semibold text-base">{fuelLiters} L</p>
              <p className="mt-1 text-xs text-base/60">{fuelEfficiency} km/l vehicle profile</p>
            </article>

            <article className="rounded-2xl border border-base/15 bg-white p-4 shadow-soft">
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">Fuel Cost</p>
              <p className="mt-2 text-2xl font-semibold text-base">INR {currencyFormatter.format(fuelCost)}</p>
              <p className="mt-1 text-xs text-base/60">At INR {fuelPricePerLiter}/L</p>
            </article>

            <article className="rounded-2xl border border-base/15 bg-white p-4 shadow-soft">
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">CO2 Impact</p>
              <p className="mt-2 text-2xl font-semibold text-base">{co2Kg} kg</p>
              <p className="mt-1 text-xs text-base/60">Approx tailpipe emission</p>
            </article>
          </div>

          <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-base">Route Visualizer</h2>
                <p className="mt-1 text-sm text-base/70">
                  {advancedRoute ? "Multi-stop path" : "Direct path"} from {start} to {destination}
                </p>
                {directRouteDetourKm !== null && (
                  <p className={`mt-1 text-xs font-semibold ${directRouteDetourKm > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    Detour vs direct route: {directRouteDetourKm > 0 ? "+" : ""}
                    {distanceFormatter.format(directRouteDetourKm)} km
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyRouteBrief}
                  className="rounded-xl border border-base/20 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-base hover:border-accent hover:text-accent"
                >
                  Copy Brief
                </button>
                <button
                  type="button"
                  onClick={exportRouteJson}
                  className="rounded-xl border border-base/20 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-base hover:border-accent hover:text-accent"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {mapStart && mapDestination && mapPolyline && (
              <div className="mt-4">
                <MapRoute
                  start={mapStart}
                  destination={mapDestination}
                  polyline={mapPolyline}
                  waypoints={advancedRoute?.stops.map((stop, index) => ({
                    name: stop.name,
                    lat: stop.lat,
                    lng: stop.lng,
                    label: `Stop ${index + 1}`
                  }))}
                />
              </div>
            )}
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-base">Segment Breakdown</h3>
              <div className="mt-3 space-y-2">
                {activeSegments.map((segment, index) => (
                  <div key={`${segment.fromName}-${segment.toName}-${index}`} className="rounded-xl border border-base/10 bg-panel/40 p-3 text-sm">
                    <p className="font-semibold text-base">
                      {index + 1}. {segment.fromName} to {segment.toName}
                    </p>
                    <p className="text-base/70">
                      {distanceFormatter.format(segment.distanceKm)} km | {segment.travelTimeHours} hours
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-base">Drive Timeline</h3>
              <p className="mt-1 text-xs text-base/60">Departure {departureTime}, segment buffer {breakMinutes} mins</p>
              <div className="mt-3 space-y-2">
                {timeline.map((segment, index) => (
                  <div key={`${segment.fromName}-${segment.toName}-${index}-time`} className="rounded-xl border border-base/10 bg-white p-3 text-sm">
                    <p className="font-semibold text-base">
                      {segment.fromName} to {segment.toName}
                    </p>
                    <p className="text-base/70">
                      {segment.departLabel} depart | {segment.arriveLabel} arrive
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          {advancedRoute && (
            <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-base">Smart Suggested Stops</h3>
              <p className="mt-1 text-sm text-base/70">Tap any suggestion to add it to your stop list and re-run planning.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { title: "Food", items: advancedRoute.suggestions.foodStops },
                  { title: "Scenic", items: advancedRoute.suggestions.scenicSpots },
                  { title: "Rest", items: advancedRoute.suggestions.restPoints }
                ].map(group => (
                  <div key={group.title} className="rounded-xl border border-base/15 bg-white/80 p-3">
                    <p className="text-sm font-semibold text-accent">{group.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.items.length === 0 && <p className="text-xs text-base/60">No suggestions in this segment.</p>}
                      {group.items.map(item => (
                        <button
                          key={`${group.title}-${item.id}`}
                          type="button"
                          onClick={() => addStop(item.name)}
                          className="rounded-full border border-base/20 bg-panel/50 px-2.5 py-1 text-xs font-semibold text-base hover:border-accent hover:text-accent"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {route && route.nearbySpots.length > 0 && (
            <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-base">Nearby Discoveries on Route</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {route.nearbySpots.slice(0, 9).map(spot => (
                  <div key={spot.id} className="rounded-xl border border-base/10 bg-white p-3">
                    <p className="font-semibold text-base">{spot.name}</p>
                    <p className="text-xs text-base/60">{spot.category} | {spot.stateName}</p>
                    <p className="mt-1 text-xs text-base/65">{spot.distanceKm.toFixed(1)} km from route corridor</p>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      )}
    </div>
  );
}

