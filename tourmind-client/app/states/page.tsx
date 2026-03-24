"use client";

import { useEffect, useMemo, useState } from "react";
import StateCard from "@/components/StateCard";
import { fetchStates } from "@/lib/api";
import { StateSummary } from "@/lib/types";

export default function StateExplorerPage() {
  const [states, setStates] = useState<StateSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const data = await fetchStates();
        if (active) {
          setStates(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load states");
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

  const filteredStates = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) {
      return states;
    }

    return states.filter((state) => state.name.toLowerCase().includes(key));
  }, [search, states]);

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <div>
        <h1 className="text-3xl font-semibold text-base">State Explorer</h1>
        <p className="mt-2 text-sm text-base/70">
          Browse all Indian states and open their tourist attractions.
        </p>
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search states..."
        className="w-full rounded-xl border border-base/20 bg-white px-4 py-2.5 text-sm outline-none ring-accent transition focus:ring-2"
      />

      {loading && <p className="text-sm text-base/70">Loading states...</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStates.map((state) => (
            <StateCard key={state.slug} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}


