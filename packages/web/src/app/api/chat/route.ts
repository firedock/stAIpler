import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { execSync, spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { applyDecay, formatHandoffsForPrompt } from '@staipler/core';
import type { HandoffPacket } from '@staipler/core';

const HOSTED_MONTHLY_TOKEN_CAP = 50_000;

const CANONICAL_ORDER = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

const KIND_TITLES: Record<string, string> = {
  identity: 'Identity', goals: 'Goals', context: 'Context',
  policies: 'Policies', constraints: 'Constraints', skills: 'Skills',
  style: 'Style', examples: 'Examples', tools: 'Tools',
  prompts: 'Prompts', evals: 'Evals', memory: 'Memory',
};

interface AttributionEntry {
  layer: string;
  fileName: string;
  path: string;
  reason: string;
  confidence: number;
}

function compileSystemPromptWithAttribution(files: any[]): { prompt: string; attribution: AttributionEntry[] } {
  const byKind: Record<string, any[]> = {};
  for (const file of files) {
    if (!file.inferred_kind || !file.content) continue;
    if (!byKind[file.inferred_kind]) byKind[file.inferred_kind] = [];
    byKind[file.inferred_kind].push(file);
  }

  const sections: string[] = [];
  const attribution: AttributionEntry[] = [];

  const REASON_MAP: Record<string, string> = {
    identity: 'Defines agent persona and role',
    constraints: 'Enforces safety rules and boundaries',
    context: 'Provides domain knowledge',
    goals: 'Sets priorities and objectives',
    style: 'Controls tone and formatting',
    skills: 'Defines workflows and procedures',
    policies: 'Applies compliance and legal rules',
    examples: 'Provides reference examples',
    tools: 'Defines available tool usage',
    prompts: 'Supplies prompt templates',
    evals: 'Sets quality criteria',
    memory: 'Injects session context',
  };

  for (const kind of CANONICAL_ORDER) {
    const kindFiles = byKind[kind];
    if (!kindFiles || kindFiles.length === 0) continue;
    const title = KIND_TITLES[kind] ?? kind;

    if (kind === 'identity' || kind === 'style') {
      kindFiles.sort((a: any, b: any) => (b.inferred_confidence ?? 0) - (a.inferred_confidence ?? 0));
      sections.push(`## ${title}\n\n${kindFiles[0].content}`);
      attribution.push({
        layer: kind,
        fileName: kindFiles[0].file_name,
        path: kindFiles[0].relative_path,
        reason: REASON_MAP[kind] ?? 'Project context',
        confidence: kindFiles[0].inferred_confidence ?? 0,
      });
    } else {
      sections.push(`## ${title}\n\n${kindFiles.map((f: any) => f.content).join('\n\n')}`);
      for (const f of kindFiles) {
        attribution.push({
          layer: kind,
          fileName: f.file_name,
          path: f.relative_path,
          reason: REASON_MAP[kind] ?? 'Project context',
          confidence: f.inferred_confidence ?? 0,
        });
      }
    }
  }

  return { prompt: sections.join('\n\n'), attribution };
}

function compileSystemPrompt(files: any[]): string {
  return compileSystemPromptWithAttribution(files).prompt;
}

// Provider: Claude CLI (Max plan — no API key needed)
async function streamClaudeCli(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content ?? '';
  const tmpDir = '/tmp/staipler-chat';
  mkdirSync(tmpDir, { recursive: true });

  const promptFile = resolve(tmpDir, `prompt-${Date.now()}.txt`);
  writeFileSync(promptFile, lastUserMessage);

  const args = ['-p', '--model', 'sonnet'];
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  return new Promise<void>((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdin.write(lastUserMessage);
    proc.stdin.end();

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
    });

    proc.stderr.on('data', () => {}); // ignore stderr

    proc.on('close', () => {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      resolve();
    });

    proc.on('error', (err) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      controller.close();
      resolve();
    });
  });
}

// Provider: Anthropic API
async function streamAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const anthropic = new Anthropic({ apiKey });
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
    }
  }

  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
}

// Provider: OpenAI API
async function streamOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const openai = new OpenAI({ apiKey });
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    openaiMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }

  const stream = await openai.chat.completions.create({
    model,
    messages: openaiMessages,
    max_tokens: 4096,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
    }
  }

  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, messages, mode, provider, model, apiKey, usePersistedKey } = await request.json();

    // Resolve provider: 'claude-cli' | 'anthropic' | 'openai'
    const resolvedProvider = provider ?? 'claude-cli';
    const resolvedModel = model ??
      (resolvedProvider === 'anthropic' ? 'claude-sonnet-4-20250514' :
       resolvedProvider === 'openai' ? 'gpt-4o' : 'sonnet');

    // Compile system prompt if not control mode
    let systemPrompt = '';
    let attribution: AttributionEntry[] = [];
    if (mode !== 'control') {
      const { data: files } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId);

      if (files && files.length > 0) {
        const compiled = compileSystemPromptWithAttribution(files);
        systemPrompt = compiled.prompt;
        attribution = compiled.attribution;

        // Inject active handoffs below source knowledge
        const { data: handoffRows } = await supabase
          .from('session_handoffs')
          .select('*')
          .eq('project_id', projectId)
          .eq('status', 'active');

        if (handoffRows && handoffRows.length > 0) {
          const now = new Date();
          const handoffs: HandoffPacket[] = handoffRows.map(row => applyDecay({
            id: row.id,
            projectId: row.project_id,
            classification: row.classification,
            content: row.content,
            initialConfidence: row.initial_confidence,
            effectiveConfidence: row.effective_confidence,
            provenance: row.provenance,
            reinforcementCount: row.reinforcement_count,
            createdAt: row.created_at,
            lastReinforcedAt: row.last_reinforced_at,
            status: row.status,
          }, now));

          const handoffSection = formatHandoffsForPrompt(handoffs);
          if (handoffSection) {
            systemPrompt = systemPrompt + '\n\n' + handoffSection;
          }
        }
      }
    }

    // Resolve API key: client-provided > persisted agent config > env var > hosted > none
    let resolvedKey = apiKey ?? null;
    let isHosted = false;

    if (!resolvedKey && usePersistedKey) {
      const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('provider, api_key_encrypted')
        .eq('project_id', projectId)
        .single();

      if (agentConfig) {
        if (agentConfig.provider === 'hosted') {
          // Hosted tier: use stAIpler's own Anthropic key
          isHosted = true;
          resolvedKey = process.env.STAIPLER_ANTHROPIC_API_KEY ?? null;

          // Check usage cap for hosted tier
          if (resolvedKey) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const { data: usage } = await supabase
              .from('usage_events')
              .select('input_tokens, output_tokens')
              .eq('project_id', projectId)
              .gte('created_at', thirtyDaysAgo.toISOString());

            const totalTokens = (usage ?? []).reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0);
            if (totalTokens >= HOSTED_MONTHLY_TOKEN_CAP) {
              return NextResponse.json({
                error: 'You\'ve reached your free tier limit (50K tokens/month). Add your own API key in Settings to continue, or upgrade for more capacity.',
              }, { status: 429 });
            }
          }
        } else if (agentConfig.api_key_encrypted) {
          // BYOB: decrypt persisted key
          try {
            resolvedKey = decrypt(agentConfig.api_key_encrypted);
          } catch {
            return NextResponse.json({ error: 'Failed to decrypt stored API key. Please reconfigure in Settings.' }, { status: 500 });
          }
        }
      }
    }

    // Fallback to env vars
    if (!resolvedKey) {
      resolvedKey = resolvedProvider === 'anthropic' ? (process.env.ANTHROPIC_API_KEY ?? null) :
                    resolvedProvider === 'openai' ? (process.env.OPENAI_API_KEY ?? null) : null;
    }

    if (resolvedProvider !== 'claude-cli' && !resolvedKey) {
      return NextResponse.json({
        error: `No API key configured for ${resolvedProvider}. Add one in Settings or set ${resolvedProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} env var.`,
      }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send attribution data first (for stAIpler mode)
          if (attribution.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ attribution })}\n\n`));
          }

          switch (resolvedProvider) {
            case 'claude-cli':
              await streamClaudeCli(systemPrompt, messages, controller, encoder);
              break;
            case 'anthropic':
              await streamAnthropic(resolvedKey!, resolvedModel, systemPrompt, messages, controller, encoder);
              break;
            case 'openai':
              await streamOpenAI(resolvedKey!, resolvedModel, systemPrompt, messages, controller, encoder);
              break;
            default:
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Unknown provider: ${resolvedProvider}` })}\n\n`));
              controller.close();
          }

          // Log usage for hosted tier (approximate token count)
          if (isHosted) {
            const inputChars = (systemPrompt.length + messages.reduce((s: number, m: any) => s + m.content.length, 0));
            const inputTokens = Math.ceil(inputChars / 4);
            const outputTokens = 500; // estimate; exact counts require provider callback changes
            supabase.from('usage_events').insert({
              project_id: projectId,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              model: resolvedModel,
            }).then(() => {}); // fire and forget
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Chat failed' }, { status: 500 });
  }
}
