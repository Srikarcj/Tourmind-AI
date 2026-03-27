"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type Mode = "signin" | "signup";

const clerkAppearance = {
  elements: {
    rootBox: "!mx-auto !w-full !max-w-full",
    cardBox: "!mx-auto !w-full !max-w-full",
    card: "!w-full !max-w-none !shadow-none !border-0 !bg-transparent !p-0",
    formButtonPrimary: "!bg-black hover:!bg-black/85",
    footerActionLink: "!text-[#0f766e]",
    socialButtonsBlockButton: "!w-full",
    formFieldInput: "!w-full"
  }
};

export default function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, router, user]);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] w-full items-start justify-center overflow-x-hidden px-3 py-6 sm:px-6 sm:py-10 lg:min-h-[calc(100vh-13rem)] lg:px-10 2xl:px-14">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass-card mesh-bg w-full max-w-[calc(100vw-1.5rem)] overflow-hidden p-4 sm:max-w-xl sm:p-8"
      >
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">TourMind Account</p>
        <h1 className="mt-2 text-2xl font-semibold text-base sm:text-3xl">
          {mode === "signin" ? "Sign in to manage bookings" : "Create your account"}
        </h1>

        <div className="mt-5 inline-flex max-w-full rounded-full border border-base/20 bg-white/75 p-1">
          {(["signin", "signup"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                mode === tab ? "bg-base text-white" : "text-base/70 hover:bg-base/10"
              }`}
            >
              {tab === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <div className="mt-6 w-full max-w-full overflow-hidden">
          {mode === "signin" ? (
            <SignIn routing="hash" signUpUrl="/auth" fallbackRedirectUrl="/dashboard" appearance={clerkAppearance} />
          ) : (
            <SignUp routing="hash" signInUrl="/auth" fallbackRedirectUrl="/dashboard" appearance={clerkAppearance} />
          )}
        </div>
      </motion.section>
    </div>
  );
}
