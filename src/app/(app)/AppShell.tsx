"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "./actions";

type Person = { id: string; name: string; farbe: string; rolle: string };

const NAV = [
  { href: "/dashboard", label: "Heute", icon: "🏠" },
  { href: "/kalender", label: "Kalender", icon: "📅" },
  { href: "/aufgaben", label: "Aufgaben", icon: "✅" },
  { href: "/einkaufsliste", label: "Einkauf", icon: "🛒" },
  { href: "/schule", label: "Schule", icon: "🎓" },
  { href: "/dienstplan", label: "Dienste", icon: "🧹" },
  { href: "/essensplan", label: "Essen", icon: "🍽️" },
  { href: "/einstellungen", label: "Mehr", icon: "⚙️" },
];

export default function AppShell({ person, children }: { person: Person; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
                color: active ? "var(--accent)" : "var(--text-muted)",
                fontSize: 11,
                textDecoration: "none",
                fontWeight: active ? 700 : 500,
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
