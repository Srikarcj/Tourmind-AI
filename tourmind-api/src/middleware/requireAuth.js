import { env } from "../config/env.js";
import { isDbEnabled } from "../lib/db.js";
import { hasSupabaseAuthConfig, supabaseAuthClients } from "../lib/supabase.js";
import { upsertUserProfile } from "../services/userService.js";

const AUTH_VERIFY_TIMEOUT_MS = 1600;
const AUTH_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_CACHE_MAX_ITEMS = 1000;
const AUTH_EXP_SKEW_MS = 30 * 1000;
const PROFILE_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const PROFILE_SYNC_TIMEOUT_MS = 500;

const tokenVerificationCache = new Map();
const profileSyncCache = new Map();

const readBearerToken = headerValue => {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return "";
  }

  return headerValue.slice("Bearer ".length).trim();
};

const withTimeout = async (promise, timeoutMs, message, code = "TIMEOUT") => {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const pruneMap = (map, maxItems) => {
  while (map.size > maxItems) {
    const firstKey = map.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    map.delete(firstKey);
  }
};

const decodeTokenExpMs = token => {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload?.exp) {
      return null;
    }

    const expMs = Number(payload.exp) * 1000;
    return Number.isFinite(expMs) ? expMs : null;
  } catch (_error) {
    return null;
  }
};

const getCachedVerifiedUser = token => {
  const now = Date.now();
  const cached = tokenVerificationCache.get(token);

  if (!cached) {
    return null;
  }

  const isExpiredByTime = cached.expiresAtMs && now >= cached.expiresAtMs - AUTH_EXP_SKEW_MS;
  const isExpiredByTtl = now - cached.cachedAt > AUTH_CACHE_TTL_MS;

  if (isExpiredByTime || isExpiredByTtl) {
    tokenVerificationCache.delete(token);
    return null;
  }

  return cached.user;
};

const setCachedVerifiedUser = (token, user) => {
  tokenVerificationCache.set(token, {
    user,
    expiresAtMs: decodeTokenExpMs(token),
    cachedAt: Date.now()
  });

  pruneMap(tokenVerificationCache, AUTH_CACHE_MAX_ITEMS);
};

const shouldSyncProfile = userId => {
  const now = Date.now();
  const lastSyncedAt = profileSyncCache.get(userId) || 0;
  return now - lastSyncedAt >= PROFILE_SYNC_COOLDOWN_MS;
};

const markProfileSynced = userId => {
  profileSyncCache.set(userId, Date.now());
  pruneMap(profileSyncCache, AUTH_CACHE_MAX_ITEMS);
};

export const requireAuth = async (req, res, next) => {
  try {
    if (!hasSupabaseAuthConfig || supabaseAuthClients.length === 0) {
      return res.status(500).json({
        message: "Supabase auth is not configured on the backend."
      });
    }

    const token = readBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: "Missing bearer token." });
    }

    const cachedUser = getCachedVerifiedUser(token);
    let verifiedUser = cachedUser;

    if (!verifiedUser) {
      const verificationResults = await Promise.allSettled(
        supabaseAuthClients.map(async authClient => {
          const { data, error } = await withTimeout(
            authClient.client.auth.getUser(token),
            AUTH_VERIFY_TIMEOUT_MS,
            "Auth verification timed out.",
            "AUTH_TIMEOUT"
          );

          if (error || !data?.user) {
            const authError = new Error(error?.message || "Auth verification failed.");
            authError.code = String(error?.code || "AUTH_INVALID");
            throw authError;
          }

          return data.user;
        })
      );

      for (const result of verificationResults) {
        if (result.status === "fulfilled" && result.value) {
          verifiedUser = result.value;
          break;
        }
      }

      if (!verifiedUser) {
        const hadTimeout = verificationResults.some(
          result => result.status === "rejected" && String(result.reason?.code || "") === "AUTH_TIMEOUT"
        );

        if (hadTimeout) {
          return res.status(503).json({
            message: "Authentication service timed out. Please try again."
          });
        }

        return res.status(401).json({ message: "Invalid or expired token." });
      }

      setCachedVerifiedUser(token, verifiedUser);
    }

    const name =
      verifiedUser.user_metadata?.name ||
      verifiedUser.user_metadata?.full_name ||
      verifiedUser.user_metadata?.display_name ||
      null;

    const email = verifiedUser.email || "";
    const metadataRole = String(verifiedUser.user_metadata?.role || "").toLowerCase();
    let role = metadataRole === "admin" || email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "user";

    if (isDbEnabled && shouldSyncProfile(verifiedUser.id)) {
      try {
        const dbUser = await withTimeout(
          upsertUserProfile({
            id: verifiedUser.id,
            email,
            name
          }),
          PROFILE_SYNC_TIMEOUT_MS,
          "User profile sync timed out.",
          "PROFILE_TIMEOUT"
        );

        role = dbUser?.role || role;
        markProfileSynced(verifiedUser.id);
      } catch (_error) {
        // Non-blocking: dashboard auth should not fail if profile sync is slow.
      }
    }

    req.authUser = {
      id: verifiedUser.id,
      email,
      name,
      role
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

