"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "./actions";
import { BEREICH_FARBEN, type Bereich } from "@/lib/bereichFarben";
import { BereichIcon } from "@/lib/bereichIcons";
import { Icon } from "@/lib/uiIcons";
import PersonChip from "@/components/PersonChip";
import { DESIGN_KEY } from "@/lib/designThemes";
import { ICON_STIL_KEY, anwendenIconStil, type IconStil } from "@/lib/iconStil";

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
// Fix-Batch 123/124: Seiten-Header und Navigationsleiste teilen sich EIN Icon-Set je Bereich
// (BereichIcon in bereichIcons.tsx) — hier nur der Bereichs-Schlüssel je Tab, Farbe/Icon-Stil
// entscheidet BereichIcon selbst.
const NAV_ITEMS = {
  heute: { href: "/dashboard", label: "Heute", bereich: "dashboard" as Bereich, farbe: BEREICH_FARBEN.dashboard },
  kalender: { href: "/kalender", label: "Kalender", bereich: "kalender" as Bereich, farbe: BEREICH_FARBEN.kalender },
  aufgaben: { href: "/aufgaben", label: "Aufgaben", bereich: "aufgaben" as Bereich, farbe: BEREICH_FARBEN.aufgaben },
  schule: { href: "/schule", label: "Schule", bereich: "schule" as Bereich, farbe: BEREICH_FARBEN.schule },
  dienste: { href: "/dienstplan", label: "Dienste", bereich: "dienstplan" as Bereich, farbe: BEREICH_FARBEN.dienstplan },
  einkauf: { href: "/einkaufsliste", label: "Einkauf", bereich: "einkaufsliste" as Bereich, farbe: BEREICH_FARBEN.einkaufsliste },
  essen: { href: "/essensplan", label: "Essen", bereich: "essensplan" as Bereich, farbe: BEREICH_FARBEN.essensplan },
  mehr: { href: "/einstellungen", label: "Mehr", bereich: "einstellungen" as Bereich, farbe: BEREICH_FARBEN.einstellungen },
} as const;

// Fix-Batch 108 (Florians Wunsch): kein eigener THG-Reiter mehr — auch für Kinder nicht mehr
// (Eltern hatten das schon in Fix-Batch 99, jetzt einheitlich für beide Rollen). THG-App steckt
// jetzt für alle als kompakter Button in "Schule" (siehe ThgVollbild in SchuleClient.tsx).
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
  // Fix-Batch 82 (Florians Wunsch): heutiges Datum soll immer oben in der Übersicht stehen.
  // Erst nach dem Mount gesetzt (wie beim Theme) statt direkt beim Rendern berechnet, damit
  // Server- und Client-Render nicht auseinanderlaufen können (Hydration).
  const [heute, setHeute] = useState<string | null>(null);

  useEffect(() => {
    setHeute(new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }));
  }, []);

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

    try {
      const iconStil = localStorage.getItem(ICON_STIL_KEY) as IconStil | null;
      if (iconStil) anwendenIconStil(iconStil);
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
  // Fix-Batch 79 (Florians Bug-Meldung): innerhalb der Reiterleiste selbst darf ein Wisch
  // NICHT den Tab wechseln — sonst kollidiert das mit dem (jetzt ohnehin nicht mehr nötigen,
  // siehe unten) horizontalen Scrollen der Leiste. Touches, die in der <nav> starten, werden
  // hier ignoriert.
  const wischStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  function onTouchStart(e: React.TouchEvent) {
    // Fix-Batch 129: im Einkaufsmodus darf auch die Wisch-Geste nicht mehr aus der Liste
    // heraus navigieren — sonst wäre das Ausblenden von Kopf/Reiterleiste sinnlos, wenn man
    // versehentlich beim Einkaufen quer wischt und trotzdem den Tab wechselt.
    if (document.documentElement.hasAttribute("data-einkaufsmodus") || navRef.current?.contains(e.target as Node)) {
      wischStartRef.current = null;
      return;
    }
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
        className="app-header"
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
        <div>
          <strong style={{ fontSize: "var(--font-md)" }}>Familientisch</strong>
          {heute && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{heute}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="btn-icon"
            onClick={themeUmschalten}
            title="Hell/Dunkel umschalten"
            aria-label="Hell/Dunkel umschalten"
          >
            {theme === "dunkel" ? <Icon id="moon" /> : <Icon id="sun" />}
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

      <main className="app-main" style={{ flex: 1, padding: 16, paddingBottom: "calc(96px + env(safe-area-inset-bottom))", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {children}
      </main>

      {/* Fix-Batch 79 (Florians Bug-Meldung): vorher zwangen "flex-shrink: 0" + eine feste
          Mindestbreite (64px) pro Reiter die Leiste bei 8 Reitern zum horizontalen Scrollen
          — das kollidierte mit der neuen Wisch-Geste. Jetzt schrumpfen die Reiter frei
          (kein überschüssiger Platz nötig), sodass alle 8 immer ohne Scrollen auf eine Zeile
          passen; kein overflowX mehr nötig. */}
      <nav
        ref={navRef}
        className="app-nav"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
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
                flex: "1 1 0",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "8px 2px 6px",
                color: active ? item.farbe : "var(--text-muted)",
                fontSize: 10,
                textDecoration: "none",
                fontWeight: active ? 700 : 500,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-pill)",
                  background: active ? `${item.farbe}22` : "transparent",
                  transition: "background 0.15s ease",
                }}
              >
                <BereichIcon bereich={item.bereich} size={20} />
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
