import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import UpdateBanner from "@/components/UpdateBanner";

export const metadata: Metadata = {
  title: "Cafe Job Finder",
  description: "Find Seattle cafes, track walk-ins and follow-ups, and plan walk-in routes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cafe Jobs", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#12100e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <UpdateBanner />
        <main className="mx-auto w-full max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
