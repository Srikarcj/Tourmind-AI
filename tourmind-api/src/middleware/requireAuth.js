import { createClerkClient, verifyToken } from "@clerk/backend";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { isDbEnabled } from "../lib/db.js";
import { hasSupabaseAuthConfig, supabaseAuthClients } from "../lib/supabase.js";
import { upsertUserProfile } from "../services/userService.js";

const AUTH_VERIFY_TIMEOUT_MS = Math.max(1000, env.AUTH_VERIFY_TIMEOUT_MS || 5000);
const AUTH_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_CACHE_MAX_ITEMS = 1000;
const AUTH_EXP_SKEW_MS = 30 * 1000;
const PROFILE_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const PROFILE_SYNC_TIMEOUT_MS = Math.max(300, env.PROFILE_SYNC_TIMEOUT_MS || 1200);
const CLERK_PROFILE_TIMEOUT_MS = Math.max(1000, env.CLERK_PROFILE_TIMEOUT_MS || 4000);

const tokenVerificationCache = new Map();
const profileSyncCache = new Map();

const hasClerkAuthConfig = Boolean(env.CLERK_SECRET_KEY);
const clerkClient = hasClerkAuthConfig
  ? createClerkClient({
      secretKey: env.CLERK_SECRET_KEY
    })
  : null;

if (hasClerkAuthConfig && !env.CLERK_JWT_KEY) {
  console.warn(
    "CLERK_JWT_KEY is not configured. Clerk token verification may require network calls and can intermittently time out."
  );
}

const readBearerToken = headerValue => {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return "";
  }

  return headerValue.slice("Bearer ".length).trim();
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const formatUuidFromHex = hex => {
  const normalized = String(hex || "").toLowerCase().padEnd(32, "0").slice(0, 32);
  const variantNibble = ((parseInt(normalized[16] || "0", 16) & 0x3) | 0x8).toString(16);

  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-5${normalized.slice(13, 16)}-${variantNibble}${normalized.slice(17, 20)}-${normalized.slice(20, 32)}`;
};

const toDatabaseUserId = rawUserId => {
  const candidate = String(rawUserId || "").trim();

  if (!candidate) {
    return "";
  }

  if (UUID_PATTERN.test(candidate)) {
    return candidate.toLowerCase();
  }

  const digest = createHash("sha256").update(`tourmind-user:${candidate}`).digest("hex");
  return formatUuidFromHex(digest);
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

const normalizeSupabaseUser = user => ({
  id: user.id,
  email: user.email || "",
  user_metadata: user.user_metadata || {}
});

const pickClerkEmail = clerkUser => {
  const primaryEmailId = clerkUser?.primaryEmailAddressId || "";
  const emails = Array.isArray(clerkUser?.emailAddresses) ? clerkUser.emailAddresses : [];

  const primary = emails.find(item => item.id === primaryEmailId);
  if (primary?.emailAddress) {
    return primary.emailAddress;
  }

  return emails[0]?.emailAddress || "";
};

const normalizeClerkUser = clerkUser => ({
  id: clerkUser.id,
  email: pickClerkEmail(clerkUser),
  user_metadata: {
    name: [clerkUser.firstName || "", clerkUser.lastName || ""].join(" ").trim() || clerkUser.username || null
  }
});

const normalizeClerkPayloadUser = (payload, fallbackUserId = "") => {
  const userId = String(payload?.sub || fallbackUserId || "").trim();
  const email = String(payload?.email || payload?.email_address || "").trim();
  const firstName = String(payload?.first_name || "").trim();
  const lastName = String(payload?.last_name || "").trim();
  const name = String(payload?.name || "").trim() || [firstName, lastName].join(" ").trim() || null;

  return {
    id: userId,
    email,
    user_metadata: {
      name
    }
  };
};

const verifyWithClerk = async token => {
  if (!hasClerkAuthConfig) {
    return null;
  }

  const payload = await withTimeout(
    verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY || undefined,
      authorizedParties: env.ALLOWED_ORIGINS
    }),
    AUTH_VERIFY_TIMEOUT_MS,
    "Auth verification timed out.",
    "AUTH_TIMEOUT"
  );

  const userId = String(payload?.sub || "").trim();
  if (!userId) {
    const error = new Error("Invalid or expired token.");
    error.code = "AUTH_INVALID";
    throw error;
  }

  const fallbackUser = normalizeClerkPayloadUser(payload, userId);

  if (!clerkClient || fallbackUser.email) {
    return fallbackUser;
  }

  try {
    const clerkUser = await withTimeout(
      clerkClient.users.getUser(userId),
      CLERK_PROFILE_TIMEOUT_MS,
      "Auth verification timed out.",
      "AUTH_TIMEOUT"
    );

    return normalizeClerkUser(clerkUser);
  } catch (error) {
    // Degrade gracefully when Clerk profile lookup is slow.
    if (String(error?.code || "") === "AUTH_TIMEOUT") {
      return fallbackUser;
    }

    throw error;
  }
};

const verifyWithSupabase = async token => {
  if (!hasSupabaseAuthConfig || supabaseAuthClients.length === 0) {
    return { user: null, hadTimeout: false };
  }

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

      return normalizeSupabaseUser(data.user);
    })
  );

  for (const result of verificationResults) {
    if (result.status === "fulfilled" && result.value) {
      return { user: result.value, hadTimeout: false };
    }
  }

  const hadTimeout = verificationResults.some(
    result => result.status === "rejected" && String(result.reason?.code || "") === "AUTH_TIMEOUT"
  );

  return { user: null, hadTimeout };
};

export const requireAuth = async (req, res, next) => {
  try {
    if (!hasClerkAuthConfig && (!hasSupabaseAuthConfig || supabaseAuthClients.length === 0)) {
      return res.status(500).json({
        message: "Authentication is not configured on the backend."
      });
    }

    const token = readBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: "Missing bearer token." });
    }

    const cachedUser = getCachedVerifiedUser(token);
    let verifiedUser = cachedUser;
    let hadTimeout = false;

    if (!verifiedUser) {
      if (hasClerkAuthConfig) {
        try {
          verifiedUser = await verifyWithClerk(token);
        } catch (error) {
          if (String(error?.code || "") === "AUTH_TIMEOUT") {
            hadTimeout = true;
          }
        }
      }

      if (!verifiedUser) {
        const supabaseResult = await verifyWithSupabase(token);
        verifiedUser = supabaseResult.user;
        hadTimeout = hadTimeout || supabaseResult.hadTimeout;
      }

      if (!verifiedUser) {
        if (hadTimeout) {
          return res.status(503).json({
            message: "Authentication service timed out. Please try again."
          });
        }

        return res.status(401).json({ message: "Invalid or expired token." });
      }

      setCachedVerifiedUser(token, verifiedUser);
    }

    const dbUserId = toDatabaseUserId(verifiedUser.id);

    if (!dbUserId) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    const name =
      verifiedUser.user_metadata?.name ||
      verifiedUser.user_metadata?.full_name ||
      verifiedUser.user_metadata?.display_name ||
      null;

    let email = verifiedUser.email || "";
    const metadataRole = String(verifiedUser.user_metadata?.role || "").toLowerCase();
    let role = metadataRole === "admin" || email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "user";

    if (isDbEnabled && (shouldSyncProfile(dbUserId) || !email)) {
      try {
        const dbUser = await withTimeout(
          upsertUserProfile({
            id: dbUserId,
            email,
            name
          }),
          PROFILE_SYNC_TIMEOUT_MS,
          "User profile sync timed out.",
          "PROFILE_TIMEOUT"
        );

        if (!email && dbUser?.email) {
          email = dbUser.email;
        }

        role = dbUser?.role || role;
        markProfileSynced(dbUserId);
      } catch (_error) {
        // Non-blocking: dashboard auth should not fail if profile sync is slow.
      }
    }

    req.authUser = {
      id: dbUserId,
      email,
      name,
      role,
      externalAuthId: verifiedUser.id
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
