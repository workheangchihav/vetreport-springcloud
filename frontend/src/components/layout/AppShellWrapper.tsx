"use client";

import { Suspense, ReactNode } from "react";
import { AppShell } from "./AppShell";

type AppShellWrapperProps = {
  children: ReactNode;
};

function AppShellContent({ children }: AppShellWrapperProps) {
  return <AppShell>{children}</AppShell>;
}

function AppShellFallback() {
  return (
    <main className="min-h-screen bg-linear-to-br from-blue-50 via-orange-50 to-blue-100 text-slate-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full border-4 border-orange-500"></div>
        <span className="text-sm text-slate-600 font-medium">
          Loading application…
        </span>
      </div>
    </main>
  );
}

export function AppShellWrapper({ children }: AppShellWrapperProps) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}
