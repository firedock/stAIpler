import { createClient } from '@supabase/supabase-js';

/** Service-role client for server-side operations that bypass RLS (widget endpoints). */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
