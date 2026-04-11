import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/r
 * Public endpoint that accepts an HTML report upload and returns a shareable slug.
 * No authentication required — anonymous sharing is intentional.
 * The generated URL is viewable by anyone without registration.
 *
 * Body: { projectName, html, score, grade, presentLayers, missingLayers }
 * Response: { slug, url }
 */

const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5 MB
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateSlug(length: number = 8): string {
  let slug = '';
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      slug += ALPHABET[bytes[i] % ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      slug += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }
  return slug;
}

function sanitizeProjectName(name: string): string {
  return String(name).trim().slice(0, 200).replace(/[\x00-\x1f\x7f]/g, '');
}

export async function POST(request: Request) {
  try {
    // Parse body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { projectName, html, score, grade, presentLayers, missingLayers } = body ?? {};

    // Validate inputs
    if (!projectName || typeof projectName !== 'string') {
      return NextResponse.json({ error: 'projectName required' }, { status: 400 });
    }
    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'html required' }, { status: 400 });
    }
    if (html.length > MAX_HTML_SIZE) {
      return NextResponse.json({ error: `HTML too large (max ${MAX_HTML_SIZE} bytes)` }, { status: 413 });
    }

    // Resolve service key — prefer secret key, fall back to anon key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Generate a unique slug (retry on collision)
    let slug = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateSlug(8);
      const { data: existing } = await supabase
        .from('public_reports')
        .select('slug')
        .eq('slug', candidate)
        .maybeSingle();
      if (!existing) {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      return NextResponse.json({ error: 'Failed to generate unique slug' }, { status: 500 });
    }

    // Capture client IP (for rate-limiting support later)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

    // Insert the report
    const { error: insertError } = await supabase
      .from('public_reports')
      .insert({
        slug,
        project_name: sanitizeProjectName(projectName),
        html,
        score: Math.max(0, Math.min(100, Math.round(Number(score) || 0))),
        grade: String(grade || 'F').slice(0, 2),
        present_layers: Math.max(0, Math.min(12, Math.round(Number(presentLayers) || 0))),
        missing_layers: Math.max(0, Math.min(12, Math.round(Number(missingLayers) || 0))),
        created_by_ip: ip,
      });

    if (insertError) {
      console.error('public_reports insert failed:', insertError);
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
    }

    // Build the public URL
    const origin = request.headers.get('origin') ??
      (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'https://staipler.com');
    const url = `${origin}/r/${slug}`;

    return NextResponse.json({ slug, url });
  } catch (err) {
    console.error('public report upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
