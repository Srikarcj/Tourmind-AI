import { withRetry } from "../utils/retry.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

export const geocodeLocation = async query =>
  withRetry(
    async () => {
      const url = new URL(NOMINATIM_BASE);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "in");

      const response = await fetch(url, {
        headers: {
          "User-Agent": "TourMindAI/1.0 (Educational MVP)",
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed with status ${response.status}`);
      }

      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        return null;
      }

      const best = results[0];
      return {
        name: best.display_name,
        lat: Number(best.lat),
        lng: Number(best.lon)
      };
    },
    {
      retries: 2,
      delayMs: 450,
      shouldRetry: error => /failed|status 5\d\d|network/i.test(String(error?.message || ""))
    }
  );
