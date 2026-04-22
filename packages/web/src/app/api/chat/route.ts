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
import { injectKnowledgeLayer, formatKnowledgeSection } from '@/lib/knowledge/inject';

const BYOK_REQUIRED_MESSAGE =
  'A managed billing plan is not yet available. Bring your own API key (Anthropic or OpenAI) in Settings to continue.';

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
  sourceType?: string;
  status: 'used' | 'rejected';
  rejectionReason?: string;
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
        sourceType: kindFiles[0].source_type,
        status: 'used',
      });
      // Track rejected files for this layer (last-wins strategy)
      for (let i = 1; i < kindFiles.length; i++) {
        attribution.push({
          layer: kind,
          fileName: kindFiles[i].file_name,
          path: kindFiles[i].relative_path,
          reason: REASON_MAP[kind] ?? 'Project context',
          confidence: kindFiles[i].inferred_confidence ?? 0,
          sourceType: kindFiles[i].source_type,
          status: 'rejected',
          rejectionReason: `Lower confidence than "${kindFiles[0].file_name}" (${Math.round((kindFiles[0].inferred_confidence ?? 0) * 100)}% vs ${Math.round((kindFiles[i].inferred_confidence ?? 0) * 100)}%)`,
        });
      }
    } else {
      sections.push(`## ${title}\n\n${kindFiles.map((f: any) => f.content).join('\n\n')}`);
      for (const f of kindFiles) {
        attribution.push({
          layer: kind,
          fileName: f.file_name,
          path: f.relative_path,
          reason: REASON_MAP[kind] ?? 'Project context',
          confidence: f.inferred_confidence ?? 0,
          sourceType: f.source_type,
          status: 'used',
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
  onComplete: (assistantText: string) => void,
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

  let buffer = '';

  return new Promise<void>((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdin.write(lastUserMessage);
    proc.stdin.end();

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      buffer += text;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
    });

    proc.stderr.on('data', () => {}); // ignore stderr

    proc.on('close', () => {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      onComplete(buffer);
      resolve();
    });

    proc.on('error', (err) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      controller.close();
      onComplete(buffer);
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
  onComplete: (assistantText: string) => void,
) {
  const anthropic = new Anthropic({ apiKey });
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });

  let buffer = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      buffer += event.delta.text;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
    }
  }

  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
  onComplete(buffer);
}

// Provider: OpenAI API
async function streamOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  onComplete: (assistantText: string) => void,
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

  let buffer = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      buffer += text;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
    }
  }

  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
  onComplete(buffer);
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

        // Knowledge layer — injected below source-grounded context, above handoffs.
        // Reads the compact prompt view built by the render stage and records
        // per-atom inclusion/exclusion decisions for this compile.
        // See packages/web/docs/knowledge-v1.md §6.
        const knowledgeResult = await injectKnowledgeLayer(supabase, projectId, null);
        const knowledgeSection = formatKnowledgeSection(knowledgeResult.bodyMd);
        if (knowledgeSection) {
          systemPrompt = systemPrompt + '\n\n' + knowledgeSection;
        }

        // Inject active handoffs below knowledge
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

    // Resolve API key: client-provided > persisted agent config (BYOK only).
    // "hosted" provider is not available until paid billing ships — see AGENTS.md.
    let resolvedKey = apiKey ?? null;

    if (!resolvedKey && usePersistedKey) {
      const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('provider, api_key_encrypted')
        .eq('project_id', projectId)
        .single();

      if (agentConfig) {
        if (agentConfig.provider === 'hosted') {
          return NextResponse.json({ error: BYOK_REQUIRED_MESSAGE }, { status: 402 });
        }
        if (agentConfig.api_key_encrypted) {
          try {
            resolvedKey = decrypt(agentConfig.api_key_encrypted);
          } catch {
            return NextResponse.json({ error: 'Failed to decrypt stored API key. Please reconfigure in Settings.' }, { status: 500 });
          }
        }
      }
    }

    if (resolvedProvider !== 'claude-cli' && !resolvedKey) {
      return NextResponse.json({ error: BYOK_REQUIRED_MESSAGE }, { status: 402 });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send attribution data first (for stAIpler mode)
          if (attribution.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ attribution })}\n\n`));
          }

          const lastUserPrompt = messages.filter((m: any) => m.role === 'user').pop()?.content ?? '';
          const logMode = mode === 'control' ? 'control' : 'staipler';

          if (lastUserPrompt && projectId) {
            await supabase.from('project_logs').insert({
              project_id: projectId,
              user_id: user.id,
              role: 'user',
              content: lastUserPrompt,
              mode: logMode,
              provider: resolvedProvider,
              model: resolvedModel,
              token_estimate: Math.ceil(lastUserPrompt.length / 4),
            });
          }

          const onComplete = (assistantText: string) => {
            if (!assistantText || !projectId) return;
            supabase.from('project_logs').insert({
              project_id: projectId,
              user_id: user.id,
              role: 'assistant',
              content: assistantText,
              mode: logMode,
              provider: resolvedProvider,
              model: resolvedModel,
              token_estimate: Math.ceil(assistantText.length / 4),
            }).then(() => {});
          };

          switch (resolvedProvider) {
            case 'claude-cli':
              await streamClaudeCli(systemPrompt, messages, controller, encoder, onComplete);
              break;
            case 'anthropic':
              await streamAnthropic(resolvedKey!, resolvedModel, systemPrompt, messages, controller, encoder, onComplete);
              break;
            case 'openai':
              await streamOpenAI(resolvedKey!, resolvedModel, systemPrompt, messages, controller, encoder, onComplete);
              break;
            default:
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Unknown provider: ${resolvedProvider}` })}\n\n`));
              controller.close();
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
