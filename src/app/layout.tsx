import type { Metadata, Viewport } from "next";
import { Quicksand, Manrope } from "next/font/google";
import "./globals.css";

// Fix-Batch 119 (Florians Wunsch: Design-Vorlagen "deutlich mehr verändern", "richtig
// kreativ werden"): zwei zusätzliche Schriftfamilien neben der bisherigen System-Schrift,
// per Design-Vorlage zugeordnet (siehe globals.css `--font-family` je `[data-design]`) —
// über next/font selbst gehostet (keine Laufzeit-Abhängigkeit von Google, kein Layout-Sprung).
// Quicksand: rund/verspielt für die verspielten Vorlagen (Beere, Pastell, Honig, ...).
// Manrope: klar/modern-geometrisch für die kühlen/ruhigen Vorlagen (Ozean, Himmel, ...).
const quicksand = Quicksand({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rund" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-modern" });

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
    <html lang="de" className={`${quicksand.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
