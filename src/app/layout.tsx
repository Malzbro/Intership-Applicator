import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import { LogoMark } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Internship Engine", template: "%s · Internship Engine" },
  description:
    "Find engineering summer internships, research each company, and draft applications in your own voice.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 btn btn-secondary"
        >
          Skip to content
        </a>

        {user && (
          <nav className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-8">
              <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-[-0.02em]">
                <LogoMark />
                <span className="hidden sm:inline text-[15px]">Internship Engine</span>
              </Link>
              <NavLinks />
              <form action="/auth/signout" method="post" className="ml-auto shrink-0">
                <button className="btn btn-ghost btn-sm">Sign out</button>
              </form>
            </div>
          </nav>
        )}

        <main id="main" className="page">{children}</main>
      </body>
    </html>
  );
}
