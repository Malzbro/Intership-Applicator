import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clean } from "@/lib/env";

// Service-role client for cron jobs and background work. Server only.
export function createAdminClient() {
  return createSupabaseClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false } }
  );
}
