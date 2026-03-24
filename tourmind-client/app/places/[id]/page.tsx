"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchPlace, savePlace, trackPlaceViewed } from "@/lib/api";
import { Place } from "@/lib/types";

const MapSingle = dynamic(() => import("@/components/MapSingle"), {
  ssr: false,
  loading: () => <p className="text-sm text-base/70">Loading map...</p>
});

export default function PlaceDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, getAccessToken } = useAuth();

  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          setError(err instanceof Error ? err.message : "Unable to load place");
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

  if (loading) {
    return <div className="w-full px-4 py-10 text-sm text-base/70">Loading place details...</div>;
  }

  if (error || !place) {
    return (
      <div className="w-full px-4 py-10">
        <p className="text-sm text-red-700">{error || "Place not found"}</p>
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
        <h2 className="text-lg font-semibold text-base">Internal TourMind Booking</h2>
        <p className="mt-2 text-sm text-base/75">
          Create your booking request directly in TourMind. Your request will be handled by your internal admin workflow.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/bookings" className="rounded-full bg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent">Request Booking</Link>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full border border-base px-4 py-2 text-sm font-semibold text-base transition hover:bg-base hover:text-white"
          >
            Save Place
          </button>
        </div>
      </section>
    </div>
  );
}


