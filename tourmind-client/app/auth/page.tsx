"use client";

import { motion } from "framer-motion";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseClient, hasSupabaseClientConfig } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!hasSupabaseClientConfig) {
      setError(
        "Supabase client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }

    try {
      setBusy(true);
      const supabase = getSupabaseClient();

      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name
            }
          }
        });

        if (signUpError) {
          throw signUpError;
        }

        setNotice("Sign-up successful. Check your email if confirmation is enabled, then sign in.");
        setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          throw signInError;
        }

        router.replace("/dashboard");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full items-center justify-center px-4 py-12 sm:px-6 lg:px-10 2xl:px-14">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass-card mesh-bg w-full max-w-lg p-8"
      >
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">TourMind Account</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">
          {mode === "signin" ? "Sign in to manage bookings" : "Create your account"}
        </h1>

        <div className="mt-5 inline-flex rounded-full border border-base/20 bg-white/75 p-1">
          {(["signin", "signup"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === tab ? "bg-base text-white" : "text-base/70 hover:bg-base/10"
              }`}
            >
              {tab === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="block text-sm font-medium text-base/80">
              Name
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-base/20 bg-white/80 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
            </label>
          )}

          <label className="block text-sm font-medium text-base/80">
            Email
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-base/20 bg-white/80 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
            />
          </label>

          <label className="block text-sm font-medium text-base/80">
            Password
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-base/20 bg-white/80 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
            />
          </label>

          {error && <p className="text-sm text-rose-700">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </motion.section>
    </div>
  );
}

