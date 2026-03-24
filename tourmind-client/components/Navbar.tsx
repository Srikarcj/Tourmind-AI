"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "./AuthProvider";

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@tourmind.ai";

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/states", label: "State Explorer" },
  { href: "/trip-planner", label: "Trip Planner" },
  { href: "/ai-planner", label: "AI Planner" },
  { href: "/ai-dashboard", label: "AI Dashboard" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/bookings", label: "Bookings" }
];

const sheetTransition = {
  type: "spring",
  stiffness: 340,
  damping: 28,
  mass: 0.65
} as const;

export default function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = (user?.email || "").toLowerCase() === adminEmail.toLowerCase();

  const links = [
    ...baseLinks,
    ...(user ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/notifications", label: "Notifications" }] : []),
    ...(isAdmin
      ? [
          { href: "/admin/bookings", label: "Admin Bookings" },
          { href: "/admin/analytics", label: "Admin Analytics" }
        ]
      : []),
    { href: "/disclaimer", label: "Disclaimer" }
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="relative z-30 border-b border-white/45 bg-white/70 backdrop-blur-xl">
        <div className="w-full px-4 py-3 sm:px-6 lg:px-10 2xl:px-14">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-base/15 bg-white/80 px-3 py-1.5 text-base font-semibold tracking-tight text-base shadow-sm"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-accent" />
              TourMind AI
            </Link>

            <div className="flex items-center gap-2">
              {user ? (
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="hidden shrink-0 rounded-full border border-base/20 bg-white px-3 py-1.5 text-sm text-base/75 transition hover:-translate-y-0.5 hover:bg-base hover:text-white md:inline-flex"
                >
                  Sign Out
                </button>
              ) : (
                <Link
                  href="/auth"
                  className="hidden shrink-0 rounded-full bg-base px-3 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-accent md:inline-flex"
                >
                  Sign In
                </Link>
              )}

              <button
                type="button"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(open => !open)}
                className="relative grid h-10 w-10 place-items-center rounded-full border border-base/20 bg-white text-base transition-colors hover:border-accent hover:text-accent md:hidden"
              >
                <span
                  className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${
                    mobileMenuOpen ? "translate-y-0 rotate-45" : "-translate-y-1.5 rotate-0"
                  }`}
                />
                <span
                  className={`absolute h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${
                    mobileMenuOpen ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${
                    mobileMenuOpen ? "translate-y-0 -rotate-45" : "translate-y-1.5 rotate-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <nav className="mt-3 hidden w-full flex-wrap items-center gap-2 text-sm md:flex md:gap-3">
            {links.map(link => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 whitespace-nowrap transition ${
                    active
                      ? "bg-base text-white shadow-[0_8px_20px_rgba(13,27,42,0.25)]"
                      : "bg-white/70 text-base/75 hover:bg-base/10 hover:text-base"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-base/35 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.section
              className="absolute inset-x-3 bottom-3 top-[78px] overflow-hidden rounded-3xl border border-white/35 bg-white/90 shadow-2xl backdrop-blur-2xl"
              initial={{ y: 56, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 56, opacity: 0, scale: 0.96 }}
              transition={sheetTransition}
            >
              <div className="h-full overflow-y-auto p-3">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-base/15" />

                <div className="relative overflow-hidden rounded-2xl border border-base/10 bg-gradient-to-br from-accent/10 via-white to-highlight/25 p-4">
                  <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-accent/25 blur-2xl" />
                  <p className="text-[11px] uppercase tracking-[0.14em] text-base/55">Quick Access</p>
                  <p className="mt-1 text-lg font-semibold text-base">Where to next?</p>
                  <p className="mt-1 text-xs text-base/65">Tap a card to jump into planning, assistant, routes, and account features.</p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {links.map((link, index) => {
                    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

                    return (
                      <motion.div
                        key={`mobile-${link.href}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                      >
                        <Link
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex min-h-[70px] items-center rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                            active
                              ? "border-base bg-base text-white shadow-[0_8px_22px_rgba(13,27,42,0.24)]"
                              : "border-base/10 bg-white text-base/80 hover:border-accent/30 hover:bg-panel/60"
                          }`}
                        >
                          {link.label}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-base/10 pt-3">
                  {user ? (
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full rounded-2xl border border-base/20 bg-white px-3 py-2.5 text-sm font-semibold text-base/80"
                    >
                      Sign Out
                    </button>
                  ) : (
                    <Link
                      href="/auth"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full rounded-2xl bg-base px-3 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      Sign In
                    </Link>
                  )}
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
