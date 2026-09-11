"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "./actions";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";

type Person = { id: string; name: string; farbe: string; rolle: string };
type Theme = "hell" | "dunkel";

const THEME_KEY = "familientisch-theme";

function anwendenTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme === "hell" ? "light" : "dark");
}

const NAV = [
  { href: "/dashboard", label: "Heute", icon: "🏠", farbe: BEREICH_FARBEN.dashboard },
  { href: "/kalender", label: "Kalender", icon: "📅", farbe: BEREICH_FARBEN.kalender },
  { href: "/aufgaben", label: "Aufgaben", icon: "✅", farbe: BEREICH_FARBEN.aufgaben },
  { href: "/einkaufsliste", label: "Einkauf", icon: "🛒", farbe: BEREICH_FARBEN.einkaufsliste },
  { href: "/schule", label: "Schule", icon: "🎓", farbe: BEREICH_FARBEN.schule },
  { href: "/dienstplan", label: "Dienste", icon: "🧹", farbe: BEREICH_FARBEN.dienstplan },
  { href: "/essensplan", label: "Essen", icon: "🍽️", farbe: BEREICH_FARBEN.essensplan },
  { href: "/einstellungen", label: "Mehr", icon: "⚙️", farbe: BEREICH_FARBEN.einstellungen },
];

export default function AppShell({ person, children }: { person: Person; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let gespeichert: Theme | null = null;
    try {
      gespeichert = localStorage.getItem(THEME_KEY) as Theme | null;
    } catch {}
    const startwert: Theme = gespeichert ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dunkel" : "hell");
    setTheme(startwert);
    anwendenTheme(startwert);
  }, []);

  function themeUmschalten() {
    const neu: Theme = theme === "dunkel" ? "hell" : "dunkel";
    setTheme(neu);
    anwendenTheme(neu);
    try {
      localStorage.setItem(THEME_KEY, neu);
    } catch {}
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <strong>Familientisch</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="btn-secondary"
            style={{ padding: "6px 10px", fontSize: 15, lineHeight: 1 }}
            onClick={themeUmschalten}
            title="Hell/Dunkel umschalten"
            aria-label="Hell/Dunkel umschalten"
          >
            {theme === "dunkel" ? "🌙" : "☀️"}
          </button>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: person.farbe,
              color: "#fff",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
            title={person.name}
          >
            {person.name.slice(0, 2)}
          </span>
          <button
            className="btn-secondary"
            style={{ padding: "6px 10px", fontSize: 13 }}
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Abmelden
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 16, paddingBottom: 96, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {children}
      </main>

      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          overflowX: "auto",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: "1 0 64px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "8px 4px",
                color: active ? item.farbe : "var(--text-muted)",
                fontSize: 11,
                textDecoration: "none",
                fontWeight: active ? 700 : 500,
                borderTop: active ? `2px solid ${item.farbe}` : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
