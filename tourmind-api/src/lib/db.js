import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { getDataset, getServiceDataset } from "./dataset.js";
import {
  inferEstimatedCostRange,
  inferPlaceTags,
  inferPopularityScore,
  inferSeasonalScore
} from "./placeIntelligence.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "../../sql/schema.sql");

const dbConfigured = Boolean(env.DATABASE_URL);

const pool = dbConfigured
  ? new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

export let isDbEnabled = dbConfigured;

let disableLogged = false;
let reconnectInFlight = null;
let lastReconnectAttemptAt = 0;
const RECONNECT_THROTTLE_MS = 10_000;

export const isDbConnectionError = error => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"].includes(code)) {
    return true;
  }

  return (
    message.includes("getaddrinfo") ||
    message.includes("could not translate host name") ||
    message.includes("failed to connect") ||
    message.includes("connection terminated") ||
    message.includes("connect timeout")
  );
};

const disableDatabase = reason => {
  isDbEnabled = false;

  if (!disableLogged) {
    disableLogged = true;
    console.warn(reason);
  }
};

export const tryReconnectDatabase = async () => {
  if (!pool) {
    return false;
  }

  if (isDbEnabled) {
    return true;
  }

  const now = Date.now();
  if (now - lastReconnectAttemptAt < RECONNECT_THROTTLE_MS) {
    return isDbEnabled;
  }

  if (reconnectInFlight) {
    return reconnectInFlight;
  }

  lastReconnectAttemptAt = now;

  reconnectInFlight = (async () => {
    try {
      await pool.query("SELECT 1");
      isDbEnabled = true;
      disableLogged = false;
      console.log("Database connectivity restored. Re-enabling DB-backed APIs.");
      return true;
    } catch (_error) {
      return false;
    } finally {
      reconnectInFlight = null;
    }
  })();

  return reconnectInFlight;
};

export const dbQuery = async (text, params = []) => {
  if (!pool || !isDbEnabled) {
    const error = new Error("Database is unavailable.");
    error.code = "DB_UNAVAILABLE";
    throw error;
  }

  try {
    return await pool.query(text, params);
  } catch (error) {
    if (isDbConnectionError(error)) {
      disableDatabase("Database connection lost. Switching API to degraded mode (JSON/static fallback where available).");
      const wrapped = new Error("Database connection unavailable.");
      wrapped.code = "DB_UNAVAILABLE";
      wrapped.cause = error;
      throw wrapped;
    }

    throw error;
  }
};

const isStatementTimeoutError = error =>
  String(error?.code || "") === "57014" || /statement timeout/i.test(String(error?.message || ""));

const isLockTimeoutError = error =>
  String(error?.code || "") === "55P03" || /lock timeout/i.test(String(error?.message || ""));

const isRecoverableStartupDbError = error =>
  isStatementTimeoutError(error) || isLockTimeoutError(error);

const splitSqlStatements = sql =>
  sql
    .replace(/^\uFEFF/, "")
    .split(/;\s*(?:\r?\n|$)/g)
    .map(statement => statement.trim())
    .filter(Boolean);

const slugify = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";

const inferDistrictName = (place, stateName) => {
  const explicit = place?.district || place?.districtName || place?.district_name;
  if (explicit) {
    return String(explicit).trim();
  }

  const fromNearby = Array.isArray(place?.nearbyPlaces) && place.nearbyPlaces[0] ? String(place.nearbyPlaces[0]).trim() : "";
  if (fromNearby) {
    return `${fromNearby.split(" ")[0]} District`;
  }

  return `${stateName} Central`;
};

const runSchemaMigrations = async (client, schemaSql) => {
  const statements = splitSqlStatements(schemaSql);

  for (const statement of statements) {
    await client.query(statement);
  }
};

const readCount = async (client, tableName) => {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
};

const upsertState = async (client, state) => {
  await client.query(
    `
    INSERT INTO states (code, slug, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (code)
    DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name
    `,
    [state.code, state.slug, state.name]
  );
};

const upsertDistrict = async (client, stateCode, districtName) => {
  const cleanName = String(districtName || "").trim();
  if (!cleanName) {
    return null;
  }

  const districtSlug = slugify(cleanName);

  const result = await client.query(
    `
    INSERT INTO districts (state_code, slug, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (state_code, slug)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id
    `,
    [stateCode, districtSlug, cleanName]
  );

  return result.rows[0]?.id || null;
};

const upsertPlace = async (client, place, stateCode, stateName) => {
  const tags = inferPlaceTags(place);
  const popularityScore = inferPopularityScore(place);
  const seasonalScore = inferSeasonalScore(place.bestTimeToVisit);
  const estimatedCostRange = inferEstimatedCostRange(place);
  const districtName = inferDistrictName(place, stateName);
  const districtId = await upsertDistrict(client, stateCode, districtName);

  await client.query(
    `
    INSERT INTO places (
      id,
      state_code,
      district_id,
      district_name,
      name,
      category,
      short_description,
      full_description,
      best_time,
      nearby_places,
      travel_tips,
      tags,
      popularity_score,
      seasonal_score,
      estimated_cost_range,
      source,
      is_ai_generated,
      discovered_at,
      lat,
      lng
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (id)
    DO UPDATE SET
      state_code = EXCLUDED.state_code,
      district_id = EXCLUDED.district_id,
      district_name = EXCLUDED.district_name,
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      short_description = EXCLUDED.short_description,
      full_description = EXCLUDED.full_description,
      best_time = EXCLUDED.best_time,
      nearby_places = EXCLUDED.nearby_places,
      travel_tips = EXCLUDED.travel_tips,
      tags = EXCLUDED.tags,
      popularity_score = EXCLUDED.popularity_score,
      seasonal_score = EXCLUDED.seasonal_score,
      estimated_cost_range = EXCLUDED.estimated_cost_range,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng
    `,
    [
      place.id,
      stateCode,
      districtId,
      districtName,
      place.name,
      place.category,
      place.shortDescription,
      place.fullDescription,
      place.bestTimeToVisit,
      JSON.stringify(place.nearbyPlaces),
      JSON.stringify(place.travelTips),
      JSON.stringify(tags),
      popularityScore,
      seasonalScore,
      estimatedCostRange,
      "seed",
      false,
      null,
      place.coordinates.lat,
      place.coordinates.lng
    ]
  );
};

const seedTourismDataset = async client => {
  const dataset = await getDataset();

  for (const state of dataset.states) {
    await upsertState(client, state);

    for (const place of state.places) {
      await upsertPlace(client, place, state.code, state.name);
    }
  }
};

const seedServicesDataset = async client => {
  const dataset = await getServiceDataset();

  for (const service of dataset.services) {
    await client.query(
      `
      INSERT INTO services (id, name, location, price_range, type, contact_info)
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        location = EXCLUDED.location,
        price_range = EXCLUDED.price_range,
        type = EXCLUDED.type,
        contact_info = EXCLUDED.contact_info
      `,
      [
        service.id,
        service.name,
        service.location,
        service.priceRange,
        service.type,
        service.contactInfo
      ]
    );
  }
};

export const initializeDatabase = async () => {
  if (!pool || !isDbEnabled) {
    return;
  }

  const schemaSql = await fs.readFile(schemaPath, "utf-8");
  let client;

  try {
    try {
      client = await pool.connect();
    } catch (connectError) {
      if (isDbConnectionError(connectError)) {
        disableDatabase("Database host could not be reached. Starting API in degraded mode.");
        return;
      }
      throw connectError;
    }

    try {
      await client.query("SET statement_timeout = 0");
      await client.query("SET lock_timeout = '15s'");
    } catch (_error) {
      // Continue with defaults if role settings disallow session overrides.
    }

    try {
      await runSchemaMigrations(client, schemaSql);
    } catch (schemaError) {
      if (isRecoverableStartupDbError(schemaError)) {
        console.warn("Schema sync could not acquire lock in time. Continuing startup with existing schema.");
      } else {
        throw schemaError;
      }
    }

    let statesCount = 0;
    let placesCount = 0;
    let servicesCount = 0;

    try {
      statesCount = await readCount(client, "states");
      placesCount = await readCount(client, "places");
      servicesCount = await readCount(client, "services");
    } catch (countError) {
      if (isRecoverableStartupDbError(countError) || String(countError?.code || "") === "42P01") {
        console.warn("Schema verification skipped due lock/contention. Continuing startup.");
        return;
      }

      throw new Error(`Database schema check failed: ${countError.message}`);
    }

    const shouldSeedTourism = env.DB_SYNC_ON_STARTUP || statesCount === 0 || placesCount === 0;
    const shouldSeedServices = env.DB_SYNC_ON_STARTUP || servicesCount === 0;

    if (shouldSeedTourism) {
      try {
        await seedTourismDataset(client);
      } catch (seedError) {
        if (isRecoverableStartupDbError(seedError)) {
          console.warn("Tourism dataset sync skipped due DB lock/timeout. Starting server without full reseed.");
        } else {
          throw seedError;
        }
      }
    }

    if (shouldSeedServices) {
      try {
        await seedServicesDataset(client);
      } catch (seedError) {
        if (isRecoverableStartupDbError(seedError)) {
          console.warn("Services dataset sync skipped due DB lock/timeout. Starting server without full reseed.");
        } else {
          throw seedError;
        }
      }
    }
  } catch (error) {
    if (isDbConnectionError(error)) {
      disableDatabase("Database became unreachable during initialization. Starting API in degraded mode.");
      return;
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

export const closeDatabase = async () => {
  if (pool) {
    await pool.end();
  }
};


