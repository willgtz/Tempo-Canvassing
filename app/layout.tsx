import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Fenix",
    template: "%s — Fenix",
  },
  description: "Fenix Canvassing — lead, appointment, and route management for Tempo Solar.",
  // capable + statusBarStyle is what makes "Add to Home Screen" launch
  // without Safari's chrome (address bar, tab switcher) — matching the
  // native app's full-screen feel instead of just a bookmarked tab.
  // manifest.ts (app/manifest.ts) covers the Android/Chrome equivalent.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fenix",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
