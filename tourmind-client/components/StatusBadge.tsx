import { BookingStatus } from "@/lib/types";

const statusStyles: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  reviewed: "bg-blue-100 text-blue-800 border-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  completed: "bg-teal-100 text-teal-800 border-teal-300",
  cancelled: "bg-rose-100 text-rose-800 border-rose-300"
};

export default function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}
