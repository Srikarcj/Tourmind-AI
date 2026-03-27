"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BookingModal from "@/components/BookingModal";
import BookingSkeleton from "@/components/BookingSkeleton";
import { useAuth } from "@/components/AuthProvider";
import { createBooking, fetchServices } from "@/lib/api";
import { Service, ServiceType } from "@/lib/types";

export default function BookingsPage() {
  const { user, getAccessToken } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | ServiceType>("all");
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        const payload = await fetchServices();
        if (active) {
          setServices(payload);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load services.");
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

  const filteredServices = useMemo(() => {
    if (selectedType === "all") {
      return services;
    }
    return services.filter(service => service.type === selectedType);
  }, [selectedType, services]);

  const handleBookingSubmit = async (payload: {
    startDate: string;
    endDate: string;
    guests: number;
  }) => {
    if (!activeService) {
      return;
    }

    if (!user) {
      setError("Please sign in before creating a booking request.");
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await createBooking(token, {
        serviceId: activeService.id,
        startDate: payload.startDate,
        endDate: payload.endDate,
        guests: payload.guests
      });
      setActiveService(null);
      setSuccessMessage("Booking request sent successfully");
      setTimeout(() => setSuccessMessage(""), 3500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Booking request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">Reservation System</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Book hotels or travel assistance</h1>
        <p className="mt-2 text-sm text-base/75">
          Select a service, choose dates and guest count, and submit your enquiry. You will receive an email update
          once confirmed.
        </p>

        {!user && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            You need to <Link href="/auth" className="font-semibold underline">sign in</Link> before submitting a booking request.
          </p>
        )}

        <div className="mt-5 inline-flex rounded-full border border-base/20 bg-white/75 p-1">
          {[
            { key: "all", label: "All" },
            { key: "hotel", label: "Hotels" },
            { key: "travel", label: "Travel" }
          ].map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedType(item.key as "all" | ServiceType)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                selectedType === item.key ? "bg-base text-white" : "text-base/70 hover:bg-base/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <BookingSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map(service => (
            <motion.article
              key={service.id}
              whileHover={{ y: -4 }}
              className="glass-card p-5"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-base/50">{service.type}</p>
              <h2 className="mt-2 text-xl font-semibold text-base">{service.name}</h2>
              <p className="mt-2 text-sm text-base/75">{service.location}</p>
              <p className="mt-1 text-sm text-base/70">{service.priceRange}</p>
              <p className="mt-3 text-xs text-base/60">Managed by TourMind operations</p>

              <button
                type="button"
                onClick={() => setActiveService(service)}
                className="mt-4 rounded-xl bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
              >
                Request Booking
              </button>
            </motion.article>
          ))}
        </div>
      )}

      <BookingModal
        service={activeService}
        open={Boolean(activeService)}
        busy={submitting}
        onClose={() => {
          if (!submitting) {
            setActiveService(null);
          }
        }}
        onSubmit={handleBookingSubmit}
      />
    </div>
  );
}



