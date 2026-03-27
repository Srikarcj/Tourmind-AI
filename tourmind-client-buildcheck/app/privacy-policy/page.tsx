export default function PrivacyPolicyPage() {
  return (
    <div className="w-full space-y-4 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <h1 className="text-3xl font-semibold text-base">Privacy Policy</h1>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        TourMind AI collects only the inputs you provide for planning requests, such as location, number of
        days, and optional budget.
      </p>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        If PostgreSQL logging is enabled, generated itinerary requests may be stored to improve service
        reliability and auditability. Sensitive personal information is not required to use this MVP.
      </p>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        Booking requests are processed within TourMind and shared only with your configured internal admin workflow.
      </p>
    </div>
  );
}


