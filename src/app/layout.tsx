import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Familientisch",
  description: "Die zentrale App für unseren Familienalltag",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#a97155",
  width: "device-width",
  initialScale: 1,
  // Fix-Batch 68: ohne viewportFit "cover" liefert env(safe-area-inset-bottom) auf iPhones
  // mit Home-Indicator (kein Home-Button) 0px, egal was im CSS steht — die untere
  // Navigationsleiste rutscht dann unter den Indikator und die Beschriftung wird abgeschnitten.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
