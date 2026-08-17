import type { Metadata } from "next";
import { Geist, Geist_Mono, Hanuman } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { AppShellWrapper } from "@/components/layout/AppShellWrapper";
import { ToastProvider } from "@/components/ui/Toast";
import PWAManager from "@/components/PWAManager";
import { QueryProviders } from "@/components/providers/QueryProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hanuman = Hanuman({
  weight: ["100", "300", "400", "700", "900"],
  subsets: ["khmer"],
  variable: "--font-hanuman",
});

export const metadata: Metadata = {
  title: "VET Report System",
  description: "VET Report System - Call and Delivery Management",
  // Only include PWA metadata for production/non-localhost
  ...(process.env.NODE_ENV === 'production' && {
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "VET Report",
    },
  }),
  openGraph: {
    title: "VET Report System",
    description: "VET Report System - Call and Delivery Management",
    images: [
      {
        url: "/Logo.png",
        width: 512,
        height: 512,
        alt: "VET Report System Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VET Report System",
    description: "VET Report System - Call and Delivery Management",
    images: ["/Logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === 'production';

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#f97316" />
        {isProduction && (
          <>
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="apple-mobile-web-app-title" content="VET Report" />
            <link rel="apple-touch-icon" href="/Logo.png" />
          </>
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${hanuman.variable} bg-slate-950 text-slate-100 antialiased`}
      >
        <QueryProviders>
          <PreferencesProvider>
            <AuthProvider>
              <ToastProvider>
                {isProduction && <PWAManager />}
                <AppShellWrapper>{children}</AppShellWrapper>
              </ToastProvider>
            </AuthProvider>
          </PreferencesProvider>
        </QueryProviders>
      </body>
    </html>
  );
}
