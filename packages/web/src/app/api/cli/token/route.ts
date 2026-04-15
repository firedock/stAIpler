import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';

// Token format: stp_<base64url 32 bytes>
// We store only the SHA-256 hash. The plaintext is shown to the user once and never stored.
const TOKEN_PREFIX = 'stp_';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// GET: list user's CLI tokens (without exposing the plaintext)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tokens, error } = await supabase
    .from('cli_tokens')
    .select('id, name, last_used_at, enabled, created_at, expires_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: tokens ?? [] });
}

// POST: generate a new CLI token. Returns the plaintext exactly once.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await request.json().catch(() => ({}));

  const tokenPlaintext = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const tokenHash = hashToken(tokenPlaintext);

  const { error } = await supabase
    .from('cli_tokens')
    .insert({
      user_id: user.id,
      token_hash: tokenHash,
      name: name || 'CLI token',
      enabled: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    token: tokenPlaintext,
    warning: 'Save this token now — it will not be shown again.',
  });
}

// DELETE: revoke a token by id
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('cli_tokens')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ revoked: true });
}
