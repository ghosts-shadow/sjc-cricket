"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/bracket", label: "Knockouts" },
  { href: "/teams", label: "Teams" },
  { href: "/rules", label: "Rules" },
] as const;

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const STYLES = {
  // Phone: a row of pill tabs under the brand; the current page is lifted onto a surface, as in Linear's tabs.
  bar: {
    list: "flex gap-1 overflow-x-auto whitespace-nowrap px-4 pb-3 text-sm [scrollbar-width:none]",
    link: "block rounded-full border px-3.5 py-1.5 font-medium",
    active: "border-edge bg-raised text-foreground",
    idle: "border-transparent text-muted hover:text-foreground",
  },
  // Desktop sidebar, like Linear's app.
  side: {
    list: "space-y-0.5 px-3 text-sm",
    link: "flex items-center gap-3 rounded-md px-3 py-2 font-medium",
    active: "bg-soft text-foreground",
    idle: "text-muted hover:bg-soft hover:text-foreground",
  },
};

/** The nav list itself. Rendered with pathname=null as the Suspense fallback, so nothing is highlighted. */
export function NavList({ variant, pathname }: { variant: keyof typeof STYLES; pathname: string | null }) {
  const s = STYLES[variant];
  return (
    <ul className={s.list}>
      {NAV.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={active ? "page" : undefined} className={`${s.link} ${active ? s.active : s.idle}`}>
              {variant === "side" && (
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent" : "bg-edge"}`} aria-hidden />
              )}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Nav({ variant }: { variant: keyof typeof STYLES }) {
  const pathname = usePathname();
  return <NavList variant={variant} pathname={pathname} />;
}
