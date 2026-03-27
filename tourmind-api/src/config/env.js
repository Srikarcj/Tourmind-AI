import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return [process.env.FRONTEND_URL || "http://localhost:3000"];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (_error) {
    const list = raw
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean);

    if (list.length > 0) {
      return list;
    }
  }

  return [process.env.FRONTEND_URL || "http://localhost:3000"];
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: toNumber(process.env.PORT, 5000),
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  ALLOWED_ORIGINS: parseOrigins(),
  DATABASE_URL: process.env.DATABASE_URL || "",
  DB_SYNC_ON_STARTUP: toBoolean(process.env.DB_SYNC_ON_STARTUP, false),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || "",
  CLERK_JWT_KEY: process.env.CLERK_JWT_KEY || "",
  AUTH_VERIFY_TIMEOUT_MS: toNumber(process.env.AUTH_VERIFY_TIMEOUT_MS, 5000),
  CLERK_PROFILE_TIMEOUT_MS: toNumber(process.env.CLERK_PROFILE_TIMEOUT_MS, 4000),
  PROFILE_SYNC_TIMEOUT_MS: toNumber(process.env.PROFILE_SYNC_TIMEOUT_MS, 1200),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@tourmind.ai",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "TourMind AI <onboarding@resend.dev>",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: toNumber(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || ""
};

export const isProduction = env.NODE_ENV === "production";
