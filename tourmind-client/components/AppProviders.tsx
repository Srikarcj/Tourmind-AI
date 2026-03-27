"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <AuthProvider>{children}</AuthProvider>
    </ClerkProvider>
  );
}
