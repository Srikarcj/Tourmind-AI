"use client";

import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  session: { userId: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const normalizeName = (firstName?: string | null, lastName?: string | null, username?: string | null) => {
  const fullName = [firstName || "", lastName || ""].join(" ").trim();
  return fullName || username || null;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut, userId } = useClerkAuth();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();

  // When signed in, wait for Clerk user payload to avoid auth redirect flicker loops.
  const loading = !isLoaded || (Boolean(isSignedIn) && !isUserLoaded);

  const user = useMemo<AuthUser | null>(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      return null;
    }

    return {
      id: userId,
      email: clerkUser?.primaryEmailAddress?.emailAddress || "",
      name: normalizeName(clerkUser?.firstName, clerkUser?.lastName, clerkUser?.username)
    };
  }, [clerkUser, isLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isSignedIn && pathname.startsWith("/dashboard")) {
      router.replace("/auth");
    }
  }, [isSignedIn, loading, pathname, router]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
  }, [clerkSignOut]);

  const getAccessToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      return null;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const token = await getToken({
        skipCache: attempt > 0
      });

      if (token) {
        return token;
      }

      await wait(140 * (attempt + 1));
    }

    return null;
  }, [getToken, isLoaded, isSignedIn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session: { userId: userId || null },
      loading,
      signOut,
      getAccessToken
    }),
    [getAccessToken, loading, signOut, user, userId]
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
