"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BookingSkeleton from "@/components/BookingSkeleton";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/components/AuthProvider";
import { fetchRecommendations, fetchUserBookings } from "@/lib/api";
import { Booking, Recommendation } from "@/lib/types";

const isAuthErrorMessage = (message: string) =>
  /invalid or expired token|missing bearer token|unauthorized|session expired/i.test(message);

const isServiceUnavailableMessage = (message: string) =>
  /database is currently unavailable|temporarily unavailable|service unavailable|database.*offline/i.test(message);

const isApiUnavailableMessage = (message: string) =>
  /cannot connect to the tourmind api|network request failed|err_connection_refused|temporarily unavailable|service unavailable/i.test(
    message
  );

const DASHBOARD_FETCH_THROTTLE_MS = 5000;

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, getAccessToken, signOut } = useAuth();
  const lastFetchRef = useRef<{ userId: string | null; at: number }>({ userId: null, at: 0 });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      lastFetchRef.current = { userId: null, at: 0 };
      router.replace("/auth");
      return;
    }

    if (!user) {
      return;
    }

    const now = Date.now();
    const isSameUser = lastFetchRef.current.userId === user.id;

    // Guard against repeated effect runs in development Strict Mode and unstable deps.
    if (isSameUser && now - lastFetchRef.current.at < DASHBOARD_FETCH_THROTTLE_MS) {
      return;
    }

    lastFetchRef.current = { userId: user.id, at: now };

    let active = true;

    const run = async () => {
      try {
        setFetching(true);
        setError("");
        const token = await getAccessToken();

        if (!token) {
          throw new Error("Session expired. Please sign in again.");
        }

        let nextError = "";
        let skipRecommendations = false;

        try {
          const bookingPayload = await fetchUserBookings(token);
          if (active) {
            setBookings(bookingPayload);
          }
        } catch (bookingError) {
          const message = bookingError instanceof Error ? bookingError.message : "Unable to load your bookings.";

          if (active && isAuthErrorMessage(message)) {
            lastFetchRef.current = { userId: null, at: 0 };
            await signOut();
            router.replace("/auth");
            return;
          }

          if (isServiceUnavailableMessage(message)) {
            if (active) {
              setBookings([]);
            }
            nextError = "Booking features are temporarily unavailable while database connectivity is down.";
            skipRecommendations = true;
          } else if (isApiUnavailableMessage(message)) {
            if (active) {
              setBookings([]);
              setRecommendations([]);
            }
            nextError = "TourMind API is currently unreachable. Please make sure the backend server is running.";
            skipRecommendations = true;
          } else {
            nextError = message;
          }
        }

        if (!skipRecommendations) {
          try {
            const recommendationPayload = await fetchRecommendations(token, { limit: 6 });
            if (active) {
              setRecommendations(recommendationPayload);
            }
          } catch (recommendationError) {
            const message =
              recommendationError instanceof Error ? recommendationError.message : "Unable to load recommendations.";

            if (active && isAuthErrorMessage(message)) {
              lastFetchRef.current = { userId: null, at: 0 };
              await signOut();
              router.replace("/auth");
              return;
            }

            if (!nextError) {
              nextError = message;
            }
          }
        }

        if (active) {
          setError(nextError);
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "Unable to load your dashboard.";

        if (active && isAuthErrorMessage(message)) {
          lastFetchRef.current = { userId: null, at: 0 };
          await signOut();
          router.replace("/auth");
          return;
        }

        if (active) {
          setError(message);
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
  }, [getAccessToken, loading, router, signOut, user]);

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">User Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Your Booking Requests</h1>
        <p className="mt-2 text-sm text-base/75">Track pending, reviewed, confirmed, completed, and cancelled statuses.</p>
      </section>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {fetching ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <BookingSkeleton key={index} />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="glass-card p-6 text-sm text-base/75">
          No bookings yet. <Link href="/bookings" className="font-semibold text-accent underline">Create your first booking request</Link>.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bookings.map(booking => (
            <article key={booking.id} className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-base">{booking.serviceName}</p>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-2 text-sm text-base/75">{booking.serviceLocation}</p>
              <p className="mt-1 text-sm text-base/75">
                {booking.startDate} to {booking.endDate} | {booking.guests} guest(s)
              </p>
              <p className="mt-1 text-sm text-base/70">Type: {booking.serviceType}</p>
              <p className="mt-4 text-xs text-base/60">Booking ID: {booking.id}</p>
            </article>
          ))}
        </div>
      )}

      {!fetching && recommendations.length > 0 && (
        <section className="glass-card p-6">
          <h2 className="text-xl font-semibold text-base">Recommended For You</h2>
          <p className="mt-1 text-sm text-base/70">AI-ranked places based on your activity and preferences.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map(item => (
              <Link
                key={item.id}
                href={`/places/${item.id}`}
                className="rounded-xl border border-base/15 bg-white/80 p-4 transition hover:border-accent"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-base/55">{item.category}</p>
                <p className="mt-1 font-semibold text-base">{item.name}</p>
                <p className="mt-1 text-sm text-base/70">{item.stateName}</p>
                <p className="mt-2 text-xs text-accent">Score: {item.score.toFixed(2)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
