import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/**
 * GET /r/[slug]
 * Public viewer for shareable report URLs.
 * Returns the raw HTML — no authentication required.
 * Increments view count on each hit.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;

    if (!slug || !/^[a-zA-Z0-9]{4,16}$/.test(slug)) {
      return new Response('Invalid slug', { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY;

    if (!supabaseUrl || !key) {
      return new Response('Server not configured', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: report, error } = await supabase
      .from('public_reports')
      .select('html, view_count, expires_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !report) {
      return new Response(notFoundHtml(slug), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (report.expires_at && new Date(report.expires_at).getTime() < Date.now()) {
      return new Response(expiredHtml(), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Fire-and-forget view count update
    supabase
      .from('public_reports')
      .update({ view_count: (report.view_count ?? 0) + 1 })
      .eq('slug', slug)
      .then(() => {}, () => {});

    return new Response(report.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(
      `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { status: 500 },
    );
  }
}

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { background: #06060e; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 24px; }
  .box { max-width: 500px; text-align: center; padding: 48px 32px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; }
  .logo { font-size: 0.75rem; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 16px; }
  h1 { font-size: 1.6rem; margin-bottom: 12px; }
  p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px; }
  a { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; }
  a:hover { opacity: 0.9; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function notFoundHtml(slug: string): string {
  return baseHtml('Report not found · stAIpler', `
    <div class="box">
      <div class="logo">stAIpler</div>
      <h1>Report not found</h1>
      <p>The report "${slug}" doesn't exist or has been removed. Reports expire after 30 days.</p>
      <a href="https://staipler.com">Get stAIpler →</a>
    </div>
  `);
}

function expiredHtml(): string {
  return baseHtml('Report expired · stAIpler', `
    <div class="box">
      <div class="logo">stAIpler</div>
      <h1>Report expired</h1>
      <p>This report has expired. Sign up at staipler.com to track your projects over time without expiration.</p>
      <a href="https://staipler.com/signup">Create free account →</a>
    </div>
  `);
}
