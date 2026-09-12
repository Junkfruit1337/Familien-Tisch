"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "./actions";
import { BEREICH_FARBEN } from "@/lib/bereichFarben";
import PersonChip from "@/components/PersonChip";
import { DESIGN_KEY } from "@/lib/designThemes";

type Person = { id: string; name: string; farbe: string; rolle: string };
type Theme = "hell" | "dunkel";

const THEME_KEY = "familientisch-theme";

function anwendenTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme === "hell" ? "light" : "dark");
}

// Fix-Batch 70: Design-Vorlage wird, wie schon der Hell/Dunkel-Schalter, pro Browser/Person
// in localStorage gemerkt und beim App-Start hier einmal angewendet — die eigentliche Auswahl
// passiert in den Einstellungen (dort wird dieselbe Funktion beim Antippen erneut aufgerufen).

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

    try {
      const design = localStorage.getItem(DESIGN_KEY);
      if (design) document.documentElement.setAttribute("data-design", design);
    } catch {}
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
          background: "var(--surface)",
          boxShadow: "var(--shadow-sm)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <strong style={{ fontSize: "var(--font-md)" }}>Familientisch</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="btn-icon"
            onClick={themeUmschalten}
            title="Hell/Dunkel umschalten"
            aria-label="Hell/Dunkel umschalten"
          >
            {theme === "dunkel" ? "🌙" : "☀️"}
          </button>
          <PersonChip name={person.name} farbe={person.farbe} size={30} />
          <button
            className="btn-secondary"
            style={{ padding: "8px 12px", fontSize: "var(--font-sm)" }}
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Abmelden
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 16, paddingBottom: "calc(96px + env(safe-area-inset-bottom))", maxWidth: 720, margin: "0 auto", width: "100%" }}>
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
          boxShadow: "0 -2px 10px rgba(58, 51, 42, 0.06)",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 10,
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
                gap: 3,
                padding: "8px 4px 6px",
                color: active ? item.farbe : "var(--text-muted)",
                fontSize: "var(--font-xs)",
                textDecoration: "none",
                fontWeight: active ? 700 : 500,
              }}
            >
              <span
                style={{
                  fontSize: 17,
                  lineHeight: 1,
                  width: 34,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-pill)",
                  background: active ? `${item.farbe}22` : "transparent",
                  transition: "background 0.15s ease",
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
