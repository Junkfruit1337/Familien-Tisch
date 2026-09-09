import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Familientisch",
  description: "Die zentrale App für unseren Familienalltag",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#a97155",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
