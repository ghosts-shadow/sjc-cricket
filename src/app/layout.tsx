import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Nav, NavList } from "@/components/nav";
import "./globals.css";

// Inter is the closest free match for Linear's typeface. The opsz axis gives
// headings the tighter display cut and body text the text cut.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: "SJC Sports Fest Cricket 2026", template: "%s · SJC Cricket 2026" },
  description: "Fixtures, results, standings and knockout bracket for the SJC Sports Fest 2026 cricket tournament.",
};

export const viewport: Viewport = {
  themeColor: "#010102",
};

/** Logo and name. `stacked` puts the logo above the text so it fits the sidebar's width. */
function Brand({ stacked = false }: { stacked?: boolean }) {
  return (
    <Link href="/" className={`flex gap-3 ${stacked ? "flex-col items-start" : "items-center"}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-semibold tracking-wide text-white">
        SJC
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-medium uppercase tracking-[.08em] text-muted">St. Joseph&apos;s Cathedral</span>
        <span className="block font-semibold tracking-[-0.01em]">
          Sports Fest <span className={`text-ink-muted ${stacked ? "block" : ""}`}>Cricket 2026</span>
        </span>
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans lg:pl-64">
        {/* Desktop: fixed sidebar, like Linear's app. */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-background lg:flex">
          <div className="px-6 pb-6 pt-7">
            <Brand stacked />
          </div>
          <nav aria-label="Main">
            <Suspense fallback={<NavList variant="side" pathname={null} />}>
              <Nav variant="side" />
            </Suspense>
          </nav>
          <div className="mt-auto border-t border-line p-4">
            <Link
              href="/admin"
              className="block rounded-md border border-line bg-card px-3.5 py-2 text-center text-sm font-medium hover:bg-soft"
            >
              Organiser sign in
            </Link>
          </div>
        </aside>

        {/* Phone and tablet: brand bar with a scrollable row of pills. */}
        <header className="border-b border-line bg-background lg:hidden">
          <div className="px-4 pb-3 pt-4">
            <Brand />
          </div>
          <nav aria-label="Main">
            <Suspense fallback={<NavList variant="bar" pathname={null} />}>
              <Nav variant="bar" />
            </Suspense>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-10">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-5 text-xs text-muted lg:px-8">
            St. Joseph&apos;s Cathedral Sports Fest · All times UAE ·{" "}
            <Link href="/admin" className="underline underline-offset-2 hover:text-foreground">
              Organisers
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
