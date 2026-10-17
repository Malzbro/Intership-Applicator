"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/", label: "Dashboard" },
  { href: "/queue", label: "Queue" },
  { href: "/applications", label: "Applications" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/companies", label: "Companies" },
];

const SETUP = [
  { href: "/cv", label: "CV" },
  { href: "/voice", label: "Voice" },
  { href: "/profile", label: "Profile" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname();

  const item = (l: { href: string; label: string }) => {
    const active = isActive(pathname, l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        className={`relative shrink-0 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors duration-150 ${
          active ? "text-fg bg-surface-2" : "text-muted hover:text-fg hover:bg-surface-2/70"
        }`}
      >
        {l.label}
      </Link>
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
      {PRIMARY.map(item)}
      <span className="mx-2 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      {SETUP.map(item)}
    </div>
  );
}
