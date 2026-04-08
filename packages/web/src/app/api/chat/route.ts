import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { execSync, spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

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
    const sysFile = resolve(tmpDir, `sys-${Date.now()}.txt`);
    writeFileSync(sysFile, systemPrompt);
    args.push('--system-prompt', systemPrompt.length > 10000
      ? `$(cat '${sysFile}')`
      : systemPrompt
    );
  }

  return new Promise<void>((resolve, reject) => {
    const proc = spawn('claude', args, {
      shell: '/bin/bash',
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

    const { projectId, messages, mode, provider, model, apiKey } = await request.json();

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
      }
    }

    // Resolve API key: passed from client > env var > none
    const resolvedKey = apiKey ??
      (resolvedProvider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
       resolvedProvider === 'openai' ? process.env.OPENAI_API_KEY : null);

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
