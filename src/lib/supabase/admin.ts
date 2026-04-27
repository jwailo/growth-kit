import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Returns a Supabase client signed with the service-role key, bypassing RLS.
 * Use ONLY in server-side code that has already authenticated the request.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is not configured, so callers
 * can fall back to the user-scoped client.
 */
export function getAdminSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  cached = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
