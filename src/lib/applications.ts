import type { SupabaseClient } from "@supabase/supabase-js";

// Returns the existing application for this job, or creates a shortlist one.
// Never touches an existing row's status — re-adding a job you already sent
// must not drag it back to "shortlist".
export async function ensureApplication(
  db: SupabaseClient,
  profileId: string,
  jobId: string
): Promise<string> {
  const { data: existing } = await db
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("applications")
    .insert({ job_id: jobId, profile_id: profileId, status: "shortlist" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
