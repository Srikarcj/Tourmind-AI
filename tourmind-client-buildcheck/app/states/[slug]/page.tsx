"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PlaceCard from "@/components/PlaceCard";
import { fetchCategories, fetchStatePlaces } from "@/lib/api";
import { Place } from "@/lib/types";

export default function StateDetailsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [places, setPlaces] = useState<Place[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stateName, setStateName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!slug) {
        return;
      }

      try {
        setLoading(true);
        const [placesPayload, categoryPayload] = await Promise.all([
          fetchStatePlaces(slug, {
            category: selectedCategory,
            search
          }),
          fetchCategories()
        ]);

        if (active) {
          setPlaces(placesPayload.data);
          setStateName(placesPayload.state.name);
          setCategories(categoryPayload);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load places");
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
  }, [search, selectedCategory, slug]);

  const hasResults = useMemo(() => places.length > 0, [places]);

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <Link href="/states" className="inline-flex text-sm font-medium text-accent hover:text-base">
        Back to states
      </Link>
      <div>
        <h1 className="text-3xl font-semibold text-base">{stateName || "State Attractions"}</h1>
        <p className="mt-2 text-sm text-base/70">
          Filter by category and search for places in this state.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search places"
          className="rounded-xl border border-base/20 bg-white px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
        />
        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="rounded-xl border border-base/20 bg-white px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-base/70">Loading places...</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!loading && !error && !hasResults && (
        <p className="rounded-xl border border-base/20 bg-white p-4 text-sm text-base/75">
          No places found for the current filters.
        </p>
      )}

      {!loading && !error && hasResults && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}



