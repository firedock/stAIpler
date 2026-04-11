/**
 * Upload an HTML report to staipler.com and return a public URL.
 * Short timeout — if the service is unreachable, we fall back to local.
 */

export interface UploadResult {
  url: string;
  slug: string;
}

export interface UploadOptions {
  projectName: string;
  html: string;
  score: number;
  grade: string;
  presentLayers: number;
  missingLayers: number;
  /** Override the API base URL (for testing) */
  apiBase?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

export async function uploadReport(opts: UploadOptions): Promise<UploadResult | null> {
  const apiBase = opts.apiBase
    ?? process.env.STAIPLER_API_URL
    ?? 'https://staipler.com';
  const timeoutMs = opts.timeoutMs ?? 6000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiBase}/api/r`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: opts.projectName,
        html: opts.html,
        score: opts.score,
        grade: opts.grade,
        presentLayers: opts.presentLayers,
        missingLayers: opts.missingLayers,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    if (!data?.slug || !data?.url) {
      return null;
    }

    return { slug: String(data.slug), url: String(data.url) };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
