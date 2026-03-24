export default function DisclaimerPage() {
  return (
    <div className="w-full space-y-4 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <h1 className="text-3xl font-semibold text-base">Disclaimer</h1>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        TourMind AI provides an internal travel-planning and booking-request workflow for your organization.
      </p>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        Booking requests are recorded and managed inside TourMind. Confirmation and updates are handled through your
        configured admin account.
      </p>
      <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/80">
        Route and geocoding information can vary due to map-data quality and local conditions. Always verify local
        advisories and timings before finalizing plans.
      </p>
    </div>
  );
}


