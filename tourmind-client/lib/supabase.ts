import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let browserClient: ReturnType<typeof createClient> | null = null;

export const hasSupabaseClientConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const getSupabaseClient = () => {
  if (!hasSupabaseClientConfig) {
    throw new Error("Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
};
