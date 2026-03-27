"use client";

import { Session, User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { getSupabaseClient, hasSupabaseClientConfig } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AUTH_INIT_TIMEOUT_MS = 3000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hasSupabaseClientConfig) {
      setLoading(false);
      return;
    }

    let active = true;
    const supabase = getSupabaseClient();

    const initTimeout = window.setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, AUTH_INIT_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) {
          return;
        }

        setSession(data.session || null);
        setUser(data.session?.user || null);
      })
      .finally(() => {
        if (!active) {
          return;
        }

        window.clearTimeout(initTimeout);
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      if (!active) {
        return;
      }

      setSession(updatedSession || null);
      setUser(updatedSession?.user || null);
      setLoading(false);

      if (!updatedSession && pathname.startsWith("/dashboard")) {
        router.replace("/auth");
      }
    });

    return () => {
      active = false;
      window.clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const signOut = useCallback(async () => {
    if (!hasSupabaseClientConfig) {
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!hasSupabaseClientConfig) {
      return null;
    }

    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    let activeSession = data.session || null;

    // Keep API calls from using an expired JWT and triggering avoidable 401s.
    if (activeSession?.expires_at && activeSession.expires_at * 1000 <= Date.now() + 30_000) {
      const { data: refreshedData } = await supabase.auth.refreshSession();
      activeSession = refreshedData.session || null;
    }

    return activeSession?.access_token || null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      signOut,
      getAccessToken
    }),
    [getAccessToken, loading, session, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

