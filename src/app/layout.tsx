import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Internship Engine",
  description: "Find placements, research companies, draft applications.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900">
          <div className="mx-auto max-w-6xl px-4 flex items-center gap-6 h-14 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              Internship&nbsp;Engine
            </Link>
            {user && (
              <>
                <Link href="/cv" className="hover:underline">CV</Link>
                <Link href="/voice" className="hover:underline">Voice</Link>
                <Link href="/profile" className="hover:underline">Profile</Link>
                <Link href="/queue" className="hover:underline">Queue</Link>
                <Link href="/applications" className="hover:underline">Applications</Link>
                <Link href="/companies" className="hover:underline">Companies</Link>
                <form action="/auth/signout" method="post" className="ml-auto">
                  <button className="text-stone-500 hover:underline">Sign out</button>
                </form>
              </>
            )}
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
