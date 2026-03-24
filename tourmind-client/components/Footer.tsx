import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-base/15 bg-base text-panel">
      <div className="w-full flex flex-col gap-4 px-4 py-8 sm:px-6 lg:px-10 2xl:px-14">
        <p className="text-sm text-panel/90">
          TourMind AI provides internal trip planning and booking management for your own workflow.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacy-policy" className="hover:text-highlight">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-highlight">
            Terms of Service
          </Link>
          <Link href="/disclaimer" className="hover:text-highlight">
            Disclaimer
          </Link>
        </div>
      </div>
    </footer>
  );
}


