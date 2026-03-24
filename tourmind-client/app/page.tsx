"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import StateCard from "@/components/StateCard";
import { fetchStates } from "@/lib/api";
import { StateSummary } from "@/lib/types";

const pulseBadges = [
  "Route Optimization",
  "AI Itinerary Engine",
  "Smart Budget Breakdown",
  "Live Booking Workflow",
  "Personalized Recommendations",
  "Trip Assistant Chat"
];

const quickLaunch = [
  {
    title: "Trip Planner",
    description: "Build routes, estimate fuel, and optimize stop order.",
    href: "/trip-planner"
  },
  {
    title: "AI Planner",
    description: "Generate full day-wise trips with budget and hidden gems.",
    href: "/ai-planner"
  },
  {
    title: "AI Assistant",
    description: "Get conversational travel plans with structured insights.",
    href: "/assistant"
  },
  {
    title: "Booking Desk",
    description: "Submit and track booking requests in one workflow.",
    href: "/bookings"
  }
];

export default function HomePage() {
  const [states, setStates] = useState<StateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        const response = await fetchStates();
        if (active) {
          setStates(response);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load states.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  const featuredStates = useMemo(() => states.slice(0, 8), [states]);
  const pulseTrack = useMemo(() => [...pulseBadges, ...pulseBadges], []);

  return (
    <div className="flex w-full flex-col gap-10 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden glass-card mesh-bg px-6 py-12 sm:px-10"
      >
        <div className="pointer-events-none absolute -left-10 top-6 h-32 w-32 rounded-full bg-accent/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 top-10 h-32 w-32 rounded-full bg-highlight/35 blur-3xl" />

        <p className="text-sm uppercase tracking-[0.2em] text-highlight">Plan Better, Travel Smarter</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
          Explore India, generate AI itineraries, and send booking requests with email updates.
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-base/85 sm:text-base">
          Open-source map stack, Supabase-backed reservation workflows, and internal booking operations in one platform.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="pulse-chip">{states.length || "--"} states available</span>
          <span className="pulse-chip">AI + Route + Budget</span>
          <span className="pulse-chip">End-to-end travel workflow</span>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/states"
            className="rounded-full bg-highlight px-5 py-2.5 text-sm font-semibold text-base transition hover:bg-accent hover:text-white"
          >
            Explore States
          </Link>
          <Link
            href="/bookings"
            className="rounded-full bg-base px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent"
          >
            Book Services
          </Link>
          <Link
            href="/ai-planner"
            className="rounded-full border border-base/25 px-5 py-2.5 text-sm font-semibold text-base transition hover:border-highlight"
          >
            Generate AI Trip
          </Link>
          <Link
            href="/ai-dashboard"
            className="rounded-full border border-accent/60 px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-white"
          >
            Open AI Dashboard
          </Link>
        </div>
      </motion.section>

      <section className="glass-card overflow-hidden p-3 sm:p-4">
        <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-base/65">Travel Pulse</p>
        <div className="mt-2 overflow-hidden">
          <motion.div
            className="flex w-max items-center gap-2"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            {pulseTrack.map((item, index) => (
              <span key={`${item}-${index}`} className="pulse-chip whitespace-nowrap">
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-base">Quick Launch</h2>
          <p className="text-sm text-base/70">Jump into your most-used tools</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLaunch.map((item, index) => (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.28, delay: index * 0.05 }}
            >
              <Link
                href={item.href}
                className="group spotlight-card flex min-h-[152px] flex-col justify-between transition hover:-translate-y-1"
              >
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent">{item.title}</p>
                  <p className="mt-2 text-sm text-base/75">{item.description}</p>
                </div>
                <p className="mt-3 text-sm font-semibold text-base transition group-hover:text-accent">Open module</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-base">Featured States</h2>
          <Link href="/states" className="text-sm font-semibold text-accent hover:text-base">
            View all states
          </Link>
        </div>

        {loading && <p className="text-sm text-base/70">Loading state data...</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {!loading && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featuredStates.map(state => (
              <StateCard key={state.slug} state={state} />
            ))}
          </div>
        )}
      </section>

      <section className="glass-card p-6">
        <h2 className="text-2xl font-semibold text-base">Internal Booking Workflow</h2>
        <p className="mt-2 text-sm text-base/75">
          All booking requests are handled inside TourMind and reviewed through your admin dashboard.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/bookings"
            className="rounded-full bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
          >
            Request Booking
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-base px-4 py-2 text-sm font-semibold text-base transition hover:bg-base hover:text-white"
          >
            View My Bookings
          </Link>
        </div>
      </section>
    </div>
  );
}

