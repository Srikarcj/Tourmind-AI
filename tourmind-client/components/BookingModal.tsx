"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useState } from "react";
import { Service } from "@/lib/types";

type BookingPayload = {
  startDate: string;
  endDate: string;
  guests: number;
};

type Props = {
  service: Service | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: BookingPayload) => Promise<void>;
};

const today = new Date().toISOString().slice(0, 10);

export default function BookingModal({ service, open, busy, onClose, onSubmit }: Props) {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [guests, setGuests] = useState(2);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setError("");
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!startDate || !endDate) {
      setError("Please choose valid dates.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
      setError("Guests must be between 1 and 20.");
      return;
    }

    await onSubmit({ startDate, endDate, guests });
  };

  return (
    <AnimatePresence>
      {open && service && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-base/45 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mt-10 w-full max-w-lg overflow-y-auto rounded-2xl border border-white/45 bg-white/75 p-6 shadow-soft backdrop-blur-xl sm:mt-0 sm:max-h-[92vh]"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-base/50">Booking Request</p>
                <h3 className="mt-1 text-2xl font-semibold text-base">{service.name}</h3>
                <p className="mt-1 text-sm text-base/70">{service.location}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-base/20 px-3 py-1 text-xs font-semibold text-base/70 transition hover:bg-base hover:text-white"
              >
                Close
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-base/80">
                  Start Date
                  <input
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={event => setStartDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-base/20 bg-white/90 px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-base/80">
                  End Date
                  <input
                    type="date"
                    min={startDate || today}
                    value={endDate}
                    onChange={event => setEndDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-base/20 bg-white/90 px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                    required
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-base/80">
                Guests
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={guests}
                  onChange={event => setGuests(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-base/20 bg-white/90 px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                  required
                />
              </label>

              {error && <p className="text-sm text-rose-700">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? "Sending request..." : "Submit Booking Request"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}