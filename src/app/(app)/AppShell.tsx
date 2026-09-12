"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

// Fix-Batch 78 (Florians Präzisierung an Fix-Batch 77): die Reihenfolge unterscheidet sich
// jetzt je nach Rolle — Eltern haben Essen+Einkauf direkt nach Aufgaben (Alltagsorganisation
// zuerst), Kinder haben stattdessen Schule+Dienste direkt danach (ihr Alltag zuerst), beide
// bekommen danach die jeweils andere Zweiergruppe. Heute bleibt vorne, Mehr ganz hinten, bei
// beiden Rollen gleich. Kalender+Aufgaben bleiben für beide direkt nach Heute.
const NAV_ITEMS = {
  heute: { href: "/dashboard", label: "Heute", icon: "🏠", farbe: BEREICH_FARBEN.dashboard },
  kalender: { href: "/kalender", label: "Kalender", icon: "📅", farbe: BEREICH_FARBEN.kalender },
  aufgaben: { href: "/aufgaben", label: "Aufgaben", icon: "✅", farbe: BEREICH_FARBEN.aufgaben },
  schule: { href: "/schule", label: "Schule", icon: "🎓", farbe: BEREICH_FARBEN.schule },
  dienste: { href: "/dienstplan", label: "Dienste", icon: "🧹", farbe: BEREICH_FARBEN.dienstplan },
  einkauf: { href: "/einkaufsliste", label: "Einkauf", icon: "🛒", farbe: BEREICH_FARBEN.einkaufsliste },
  essen: { href: "/essensplan", label: "Essen", icon: "🍽️", farbe: BEREICH_FARBEN.essensplan },
  mehr: { href: "/einstellungen", label: "Mehr", icon: "⚙️", farbe: BEREICH_FARBEN.einstellungen },
} as const;

const NAV_REIHENFOLGE_ELTERN = ["heute", "kalender", "aufgaben", "essen", "einkauf", "schule", "dienste", "mehr"] as const;
const NAV_REIHENFOLGE_KIND = ["heute", "kalender", "aufgaben", "schule", "dienste", "essen", "einkauf", "mehr"] as const;

function navFuerRolle(istEltern: boolean) {
  const reihenfolge = istEltern ? NAV_REIHENFOLGE_ELTERN : NAV_REIHENFOLGE_KIND;
  return reihenfolge.map((id) => NAV_ITEMS[id]);
}

export default function AppShell({ person, children }: { person: Person; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme | null>(null);
  const NAV = navFuerRolle(person.rolle === "ELTERN");

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

  // Fix-Batch 77 (Florians Wunsch): irgendwo auf dem Bildschirm nach links/rechts wischen
  // wechselt zum nächsten/vorherigen Tab in NAV — nicht nur über die Leiste unten antippbar.
  // Schwelle bewusst recht hoch (80px, deutlich mehr horizontal als vertikal, unter 600ms),
  // damit normales Scrollen/Antippen nicht versehentlich als Wisch gewertet wird.
  const wischStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    wischStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = wischStartRef.current;
    wischStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const aktuellerIndex = NAV.findIndex((item) => pathname?.startsWith(item.href));
    if (aktuellerIndex === -1) return;
    const neuerIndex = aktuellerIndex + (dx < 0 ? 1 : -1);
    if (neuerIndex < 0 || neuerIndex >= NAV.length) return;
    router.push(NAV[neuerIndex].href);
  }

  return (
    <div
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
