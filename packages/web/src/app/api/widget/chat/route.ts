import { createServiceClient } from '@/lib/supabase/service';
import { decrypt } from '@/lib/crypto';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const CANONICAL_ORDER = [
  'constraints', 'context', 'continuity', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

const KIND_TITLES: Record<string, string> = {
  identity: 'Identity', goals: 'Goals', context: 'Context',
  policies: 'Policies', constraints: 'Constraints', skills: 'Skills',
  style: 'Style', examples: 'Examples', tools: 'Tools',
  prompts: 'Prompts', evals: 'Evals', memory: 'Memory',
  continuity: 'Continuity',
};

interface WidgetCitation {
  layer: string;
  sourceType: string;
}

function compileSystemPromptWithCitations(files: any[]): { prompt: string; citations: WidgetCitation[] } {
  const byKind: Record<string, any[]> = {};
  for (const file of files) {
    if (!file.inferred_kind || !file.content) continue;
    if (!byKind[file.inferred_kind]) byKind[file.inferred_kind] = [];
    byKind[file.inferred_kind].push(file);
  }

  const sections: string[] = [];
  const citations: WidgetCitation[] = [];

  for (const kind of CANONICAL_ORDER) {
    const kindFiles = byKind[kind];
    if (!kindFiles || kindFiles.length === 0) continue;
    const title = KIND_TITLES[kind] ?? kind;

    if (kind === 'identity' || kind === 'style') {
      kindFiles.sort((a: any, b: any) => (b.inferred_confidence ?? 0) - (a.inferred_confidence ?? 0));
      sections.push(`## ${title}\n\n${kindFiles[0].content}`);
      citations.push({ layer: kind, sourceType: kindFiles[0].source_type });
    } else {
      sections.push(`## ${title}\n\n${kindFiles.map((f: any) => f.content).join('\n\n')}`);
      for (const f of kindFiles) {
        citations.push({ layer: kind, sourceType: f.source_type });
      }
    }
  }
  return { prompt: sections.join('\n\n'), citations };
}

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, rpm: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= rpm) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const { token, messages } = await request.json();
    if (!token || !messages) {
      return Response.json({ error: 'token and messages required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Validate deploy token
    const { data: deployToken } = await supabase
      .from('deploy_tokens')
      .select('project_id, allowed_origins, rate_limit_rpm, enabled')
      .eq('token', token)
      .single();

    if (!deployToken || !deployToken.enabled) {
      return Response.json({ error: 'Invalid or disabled token' }, { status: 403 });
    }

    // Check origin
    const origin = request.headers.get('origin');
    if (deployToken.allowed_origins.length > 0 && origin) {
      if (!deployToken.allowed_origins.includes(origin) && !deployToken.allowed_origins.includes('*')) {
        return Response.json({ error: 'Origin not allowed' }, { status: 403 });
      }
    }

    // Rate limit
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateLimitKey = `${token}:${clientIp}`;
    if (!checkRateLimit(rateLimitKey, deployToken.rate_limit_rpm)) {
      return Response.json({ error: 'Rate limit exceeded. Please try again in a moment.' }, { status: 429 });
    }

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('provider, model, api_key_encrypted')
      .eq('project_id', deployToken.project_id)
      .single();

    if (!agentConfig) {
      return Response.json({ error: 'Agent not configured' }, { status: 404 });
    }

    // Resolve API key — BYOK only. "hosted" is not available until paid billing ships.
    if (agentConfig.provider === 'hosted') {
      return Response.json({
        error: 'This assistant is not active. The owner must add an API key (Anthropic or OpenAI) in Settings.',
      }, { status: 402 });
    }

    let apiKey: string | null = null;
    if (agentConfig.api_key_encrypted) {
      try { apiKey = decrypt(agentConfig.api_key_encrypted); } catch { /* Decryption failed — will be caught by the !apiKey check below */ }
    }

    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Compile system prompt
    const { data: files } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', deployToken.project_id);

    const compiled = files && files.length > 0 ? compileSystemPromptWithCitations(files) : { prompt: '', citations: [] };
    const systemPrompt = compiled.prompt;
    const citations = compiled.citations;

    const provider = agentConfig.provider;
    const model = agentConfig.model;

    // Stream response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send source citations before streaming response content
          if (citations.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ citations })}\n\n`));
          }

          if (provider === 'anthropic') {
            const anthropic = new Anthropic({ apiKey });
            const stream = anthropic.messages.stream({
              model,
              max_tokens: 4096,
              ...(systemPrompt ? { system: systemPrompt } : {}),
              messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
            });
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
              }
            }
          } else if (provider === 'openai') {
            const openai = new OpenAI({ apiKey });
            const openaiMessages: any[] = [];
            if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
            for (const m of messages) openaiMessages.push({ role: m.role, content: m.content });
            const stream = await openai.chat.completions.create({ model, messages: openaiMessages, max_tokens: 4096, stream: true });
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`));
          controller.close();
        }
      },
    });

    // CORS headers for cross-origin widget requests
    const corsHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };
    if (origin) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
    }

    return new Response(readable, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Widget chat failed' }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
