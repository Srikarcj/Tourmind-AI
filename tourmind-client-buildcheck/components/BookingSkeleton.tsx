export default function BookingSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/30 bg-white/30 p-5 backdrop-blur-xl">
      <div className="h-3 w-24 rounded bg-base/15" />
      <div className="mt-3 h-6 w-2/3 rounded bg-base/20" />
      <div className="mt-4 h-4 w-full rounded bg-base/10" />
      <div className="mt-2 h-4 w-5/6 rounded bg-base/10" />
      <div className="mt-6 h-10 w-32 rounded-xl bg-base/20" />
    </div>
  );
}
