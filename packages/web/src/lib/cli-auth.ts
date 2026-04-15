import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Authenticate a request using a bearer CLI token.
 * Returns the user_id if valid, or null if invalid/expired.
 * Also updates last_used_at on success (fire-and-forget).
 */
export async function authenticateCliRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token.startsWith('stp_')) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('cli_tokens')
    .select('id, user_id, enabled, expires_at')
    .eq('token_hash', tokenHash)
    .single();

  if (!row || !row.enabled) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // Update last_used_at without blocking the request
  supabase
    .from('cli_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => {});

  return row.user_id;
}
