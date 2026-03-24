"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BookingSkeleton from "@/components/BookingSkeleton";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/components/AuthProvider";
import { fetchAdminBookings, updateBookingStatus } from "@/lib/api";
import { Booking, BookingStatus } from "@/lib/types";

const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@tourmind.ai").toLowerCase();

const isAuthErrorMessage = (message: string) =>
  /invalid or expired token|missing bearer token|unauthorized|session expired/i.test(message);

const nextActions: Record<BookingStatus, Array<{ label: string; status: BookingStatus; className: string }>> = {
  pending: [
    { label: "Mark Reviewed", status: "reviewed", className: "bg-blue-600 hover:bg-blue-700" },
    { label: "Confirm", status: "confirmed", className: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Cancel", status: "cancelled", className: "bg-rose-600 hover:bg-rose-700" }
  ],
  reviewed: [
    { label: "Confirm", status: "confirmed", className: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Cancel", status: "cancelled", className: "bg-rose-600 hover:bg-rose-700" }
  ],
  confirmed: [
    { label: "Mark Completed", status: "completed", className: "bg-teal-600 hover:bg-teal-700" },
    { label: "Cancel", status: "cancelled", className: "bg-rose-600 hover:bg-rose-700" }
  ],
  completed: [],
  cancelled: []
};

export default function AdminBookingsPage() {
  const router = useRouter();
  const { user, loading, getAccessToken, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState("");
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [error, setError] = useState("");

  const canAccess = useMemo(() => (user?.email || "").toLowerCase() === adminEmail, [user?.email]);

  const loadBookings = async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Admin session expired.");
    }

    const payload = await fetchAdminBookings(token);
    setBookings(payload);
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
      return;
    }

    if (!loading && user && !canAccess) {
      router.replace("/dashboard");
      return;
    }

    if (!user || !canAccess) {
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setLoadingBookings(true);
        setError("");
        await loadBookings();
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "Failed to load admin bookings.";

        if (active && isAuthErrorMessage(message)) {
          await signOut();
          router.replace("/auth");
          return;
        }

        if (active) {
          setError(message);
        }
      } finally {
        if (active) {
          setLoadingBookings(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [canAccess, loading, router, signOut, user]);

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus) => {
    try {
      setBusyId(bookingId);
      setError("");
      const token = await getAccessToken();

      if (!token) {
        throw new Error("Admin session expired.");
      }

      const updated = await updateBookingStatus(token, { bookingId, status });
      setBookings(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Unable to update booking status.";

      if (isAuthErrorMessage(message)) {
        await signOut();
        router.replace("/auth");
        return;
      }

      setError(message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">Admin Control</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Manage Booking Workflow</h1>
        <p className="mt-2 text-sm text-base/75">Progress bookings through reviewed, confirmed, completed, or cancelled states.</p>
      </section>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {loadingBookings ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <BookingSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map(booking => (
            <article key={booking.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-base">{booking.serviceName}</p>
                  <p className="text-sm text-base/75">{booking.userEmail}</p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-2 text-sm text-base/75">
                {booking.startDate} to {booking.endDate} | {booking.guests} guest(s)
              </p>
              <p className="text-sm text-base/70">{booking.serviceLocation}</p>
              <p className="mt-1 text-xs text-base/60">Booking ID: {booking.id}</p>

              {nextActions[booking.status].length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {nextActions[booking.status].map(action => (
                    <button
                      key={`${booking.id}-${action.status}`}
                      type="button"
                      disabled={busyId === booking.id}
                      onClick={() => handleStatusUpdate(booking.id, action.status)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-70 ${action.className}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}


