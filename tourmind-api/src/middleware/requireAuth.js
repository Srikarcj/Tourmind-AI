import { env } from "../config/env.js";
import { isDbEnabled } from "../lib/db.js";
import { hasSupabaseAuthConfig, supabaseAuthClients } from "../lib/supabase.js";
import { upsertUserProfile } from "../services/userService.js";

const readBearerToken = headerValue => {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return "";
  }

  return headerValue.slice("Bearer ".length).trim();
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

    let verifiedUser = null;

    for (const authClient of supabaseAuthClients) {
      const { data, error } = await authClient.client.auth.getUser(token);

      if (!error && data?.user) {
        verifiedUser = data.user;
        break;
      }
    }

    if (!verifiedUser) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    const name =
      verifiedUser.user_metadata?.name ||
      verifiedUser.user_metadata?.full_name ||
      verifiedUser.user_metadata?.display_name ||
      null;

    const email = verifiedUser.email || "";
    const metadataRole = String(verifiedUser.user_metadata?.role || "").toLowerCase();
    let role = metadataRole === "admin" || email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "user";

    if (isDbEnabled) {
      const dbUser = await upsertUserProfile({
        id: verifiedUser.id,
        email,
        name
      });

      role = dbUser?.role || role;
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
