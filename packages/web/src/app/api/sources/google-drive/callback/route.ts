import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const projectId = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/dashboard/${projectId}?source=google-drive&status=error&message=${encodeURIComponent(error)}`, request.url));
    }

    if (!code || !projectId) {
      return NextResponse.redirect(new URL('/dashboard?error=missing_params', request.url));
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
    const redirectUri = `${baseUrl}/api/sources/google-drive/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.redirect(new URL(`/dashboard/${projectId}?source=google-drive&status=error&message=${encodeURIComponent('Token exchange failed')}`, request.url));
    }

    const tokens = await tokenRes.json();

    // Get user's Google email for the data source name
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : { email: 'Google Drive' };

    // Store tokens encrypted in data_sources
    const { data: source, error: sourceError } = await supabase
      .from('data_sources')
      .insert({
        project_id: projectId,
        name: profile.email || 'Google Drive',
        provider: 'google-docs',
        config: {
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          token_expiry: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
          email: profile.email,
        },
        status: 'connected',
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sourceError) {
      return NextResponse.redirect(new URL(`/dashboard/${projectId}?source=google-drive&status=error&message=${encodeURIComponent(sourceError.message)}`, request.url));
    }

    return NextResponse.redirect(new URL(`/dashboard/${projectId}?source=google-drive&status=connected&sourceId=${source.id}`, request.url));
  } catch (err) {
    return NextResponse.redirect(new URL('/dashboard?error=oauth_failed', request.url));
  }
}
