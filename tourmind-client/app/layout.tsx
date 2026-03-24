import type { Metadata } from "next";
import { Lora, Sora } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora"
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora"
});

export const metadata: Metadata = {
  title: "TourMind AI",
  description: "AI-powered India travel planner with route and itinerary support",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sora.variable} ${lora.variable} flex min-h-screen w-full flex-col overflow-x-hidden font-[var(--font-sora)]`}
      >
        <AppProviders>
          <Navbar />
          <main className="w-full flex-1 lg:pt-24">{children}</main>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
