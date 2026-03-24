"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { fetchAdminAnalytics } from "@/lib/api";
import { AdminAnalytics } from "@/lib/types";

const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@tourmind.ai").toLowerCase();

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { user, loading, getAccessToken } = useAuth();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
      return;
    }

    if (!loading && user && (user.email || "").toLowerCase() !== adminEmail) {
      router.replace("/dashboard");
      return;
    }

    if (!user || (user.email || "").toLowerCase() !== adminEmail) {
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setFetching(true);
        setError("");
        const token = await getAccessToken();

        if (!token) {
          throw new Error("Session expired.");
        }

        const payload = await fetchAdminAnalytics(token);
        if (active) {
          setAnalytics(payload);
        }
      } catch (analyticsError) {
        if (active) {
          setError(analyticsError instanceof Error ? analyticsError.message : "Unable to load analytics.");
        }
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [getAccessToken, loading, router, user]);

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">Admin Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Booking Intelligence Dashboard</h1>
        <p className="mt-2 text-sm text-base/75">Monitor conversion, destination demand, and behavioral event patterns.</p>
      </section>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {fetching ? (
        <p className="text-sm text-base/70">Loading analytics...</p>
      ) : analytics ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <article className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-base/60">Total Bookings</p>
              <p className="mt-2 text-2xl font-semibold text-base">{analytics.totals.bookings}</p>
            </article>
            <article className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-base/60">Confirmed</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">{analytics.totals.confirmed}</p>
            </article>
            <article className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-base/60">Completed</p>
              <p className="mt-2 text-2xl font-semibold text-teal-700">{analytics.totals.completed}</p>
            </article>
            <article className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-base/60">Cancelled</p>
              <p className="mt-2 text-2xl font-semibold text-rose-700">{analytics.totals.cancelled}</p>
            </article>
            <article className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-base/60">Conversion</p>
              <p className="mt-2 text-2xl font-semibold text-accent">{analytics.totals.conversionRate}%</p>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="glass-card p-5">
              <h2 className="text-lg font-semibold text-base">Bookings by Status</h2>
              <div className="mt-4 space-y-3">
                {analytics.bookingsByStatus.map(item => {
                  const width = analytics.totals.bookings > 0 ? (item.count / analytics.totals.bookings) * 100 : 0;

                  return (
                    <div key={item.status}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="capitalize text-base/80">{item.status}</span>
                        <span className="text-base/70">{item.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-base/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="glass-card p-5">
              <h2 className="text-lg font-semibold text-base">Popular Destinations</h2>
              <div className="mt-3 space-y-2 text-sm text-base/80">
                {analytics.popularDestinations.map(item => (
                  <div key={item.location} className="rounded-xl border border-base/15 p-3">
                    <p className="font-semibold text-base">{item.location}</p>
                    <p className="text-base/70">Bookings: {item.bookings}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}


