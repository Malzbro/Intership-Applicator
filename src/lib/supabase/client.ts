import { createBrowserClient } from "@supabase/ssr";
import { clean } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
