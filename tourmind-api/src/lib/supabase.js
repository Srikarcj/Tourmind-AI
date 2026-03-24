import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

const createAuthClient = key =>
  createClient(env.SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

export const supabaseAuthClients = [];

if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
  supabaseAuthClients.push({
    keyType: "anon",
    client: createAuthClient(env.SUPABASE_ANON_KEY)
  });
}

if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAuthClients.push({
    keyType: "service_role",
    client: createAuthClient(env.SUPABASE_SERVICE_ROLE_KEY)
  });
}

export const hasSupabaseAuthConfig = supabaseAuthClients.length > 0;
