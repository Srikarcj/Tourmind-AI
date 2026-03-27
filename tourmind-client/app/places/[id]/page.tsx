"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import BookingModal from "@/components/BookingModal";
import { createBooking, fetchPlace, savePlace, trackPlaceViewed } from "@/lib/api";
import { Place, ServiceType } from "@/lib/types";

const MapSingle = dynamic(() => import("@/components/MapSingle"), {
  ssr: false,
  loading: () => <p className="text-sm text-base/70">Loading map...</p>
});

const bookingTypeOptions: Array<{ value: ServiceType; label: string }> = [
  { value: "travel", label: "Travel Assistance" },
  { value: "hotel", label: "Stay Assistance" }
];

export default function PlaceDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, getAccessToken } = useAuth();

  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookingType, setBookingType] = useState<ServiceType>("travel");
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!id) {
        return;
      }

      try {
        const payload = await fetchPlace(id);
        if (active) {
          setPlace(payload);
        }

        if (user) {
          const token = await getAccessToken();
          if (token) {
            await trackPlaceViewed(token, id);
          }
        }
      } catch (err) {
        if (active) {
          setPageError(err instanceof Error ? err.message : "Unable to load place");
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
  }, [getAccessToken, id, user]);

  const modalService = useMemo(() => {
    if (!place || !bookingModalOpen) {
      return null;
    }

    const location = place.districtName ? `${place.districtName}, ${place.stateName}` : place.stateName;

    return {
      id: `place-${place.id}-${bookingType}`,
      name: bookingType === "hotel" ? `${place.name} Stay Assistance` : `${place.name} Travel Assistance`,
      location,
      priceRange: "On request",
      type: bookingType,
      contactInfo: "TourMind Internal Operations",
      createdAt: new Date().toISOString()
    };
  }, [bookingModalOpen, bookingType, place]);

  const handleSave = async () => {
    if (!place) {
      return;
    }

    try {
      setError("");
      const token = await getAccessToken();
      if (!token) {
        setNotice("Sign in to save places.");
        return;
      }

      await savePlace(token, place.id);
      setNotice("Place saved to your wishlist.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save place.");
    }
  };

  const handleBookNowClick = () => {
    if (!user) {
      setNotice("Sign in to submit a booking request.");
      return;
    }

    setBookingModalOpen(true);
  };

  const handleBookingSubmit = async (payload: { startDate: string; endDate: string; guests: number }) => {
    if (!place) {
      return;
    }

    try {
      setSubmittingBooking(true);
      setError("");
      setNotice("");

      const token = await getAccessToken();
      if (!token) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      await createBooking(token, {
        serviceType: bookingType,
        placeId: place.id,
        placeName: place.name,
        stateName: place.stateName,
        districtName: place.districtName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        guests: payload.guests,
        userNote: `Place request: ${place.name}, ${place.stateName}`
      });

      setBookingModalOpen(false);
      setNotice(`Booking request submitted for ${place.name}. You can track status in Dashboard.`);
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Booking request failed.");
    } finally {
      setSubmittingBooking(false);
    }
  };

  if (loading) {
    return <div className="w-full px-4 py-10 text-sm text-base/70">Loading place details...</div>;
  }

  if (pageError || !place) {
    return (
      <div className="w-full px-4 py-10">
        <p className="text-sm text-red-700">{pageError || "Place not found"}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <Link href={`/states/${place.stateSlug}`} className="inline-flex text-sm font-medium text-accent hover:text-base">
        Back to {place.stateName}
      </Link>

      <section className="rounded-3xl border border-base/15 bg-white p-6 shadow-soft">
        <p className="text-xs uppercase tracking-[0.18em] text-base/55">{place.category}</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">{place.name}</h1>
        <p className="mt-3 text-sm leading-relaxed text-base/80">{place.fullDescription}</p>
      </section>

      {notice && <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-base">Best Time to Visit</h2>
          <p className="mt-2 text-sm text-base/75">{place.bestTimeToVisit}</p>
        </article>
        <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-base">Travel Tips</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-base/75">
            {place.travelTips.map(tip => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-base">Nearby Places</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-base/75">
          {place.nearbyPlaces.map(nearby => (
            <li key={nearby}>{nearby}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-base">Location Map</h2>
        <MapSingle lat={place.coordinates.lat} lng={place.coordinates.lng} label={place.name} />
      </section>

      <section className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-base">Book This Place</h2>
        <p className="mt-2 text-sm text-base/75">
          Your booking is now created against this exact place. No unrelated route/service will be used.
        </p>

        <div className="mt-4 max-w-sm">
          <label className="text-sm font-medium text-base/80">
            Booking Type
            <select
              value={bookingType}
              onChange={event => setBookingType(event.target.value as ServiceType)}
              className="mt-1 w-full rounded-xl border border-base/20 bg-white/90 px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            >
              {bookingTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleBookNowClick}
            className="rounded-full bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
          >
            {user ? "Book This Place" : "Sign In to Book"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full border border-base px-4 py-2 text-sm font-semibold text-base transition hover:bg-base hover:text-white"
          >
            Save Place
          </button>
        </div>
      </section>

      <BookingModal
        service={modalService}
        open={Boolean(modalService)}
        busy={submittingBooking}
        onClose={() => {
          if (!submittingBooking) {
            setBookingModalOpen(false);
          }
        }}
        onSubmit={handleBookingSubmit}
      />
    </div>
  );
}
