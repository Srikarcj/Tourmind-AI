import Link from "next/link";
import { Place } from "@/lib/types";

type Props = {
  place: Place;
};

export default function PlaceCard({ place }: Props) {
  return (
    <article className="rounded-2xl border border-base/15 bg-white p-5 shadow-soft">
      <p className="text-xs uppercase tracking-[0.18em] text-base/50">{place.category}</p>
      <h3 className="mt-2 text-xl font-semibold text-base">{place.name}</h3>
      <p className="mt-2 text-sm text-base/75">{place.shortDescription}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-base/60">Best time: {place.bestTimeToVisit}</span>
        <Link
          href={`/places/${place.id}`}
          className="inline-flex w-fit rounded-full bg-base px-4 py-2 text-sm font-medium text-white transition hover:bg-accent"
        >
          View details
        </Link>
      </div>
    </article>
  );
}