import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Same type pairing as the SJC Sportsfest 2026 schedule.
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "SJC Sports Fest Cricket 2026", template: "%s · SJC Cricket 2026" },
  description: "Fixtures, results, standings and knockout bracket for the SJC Sports Fest 2026 cricket tournament.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151d25" },
  ],
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/bracket", label: "Knockouts" },
  { href: "/teams", label: "Teams" },
  { href: "/rules", label: "Rules" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${barlow.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted">St. Joseph&apos;s Cathedral · Abu Dhabi</p>
            <Link href="/" className="mt-1 inline-flex items-baseline gap-2 font-display leading-none">
              <span className="text-3xl font-bold">SJC Sports Fest</span>
              <span className="text-xl font-semibold text-cricket">Cricket 2026</span>
            </Link>
          </div>
          <nav className="mx-auto max-w-5xl overflow-x-auto px-2 pb-1">
            <ul className="flex gap-1 whitespace-nowrap text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-md px-2 py-2 text-muted hover:bg-soft hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted">
            St. Joseph&apos;s Cathedral Sports Fest · All times UAE ·{" "}
            <Link href="/admin" className="underline underline-offset-2">
              Organisers
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
