import Link from "next/link";
import { StateSummary } from "@/lib/types";

type Props = {
  state: StateSummary;
};

export default function StateCard({ state }: Props) {
  return (
    <Link
      href={`/states/${state.slug}`}
      className="group rounded-2xl border border-base/15 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent"
    >
      <p className="text-xs uppercase tracking-[0.18em] text-base/50">{state.code}</p>
      <h3 className="mt-2 text-xl font-semibold text-base">{state.name}</h3>
      <p className="mt-2 text-sm text-base/70">{state.placeCount} curated tourist place(s)</p>
      <p className="mt-4 text-sm font-medium text-accent transition group-hover:text-base">
        Explore state
      </p>
    </Link>
  );
}
