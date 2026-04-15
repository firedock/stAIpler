'use client';

import { useState, useRef, useEffect } from 'react';
import { SessionContextPanel } from '@/components/session-context-panel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentConfig {
  provider: string;
  model: string;
  displayName?: string | null;
}

const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444', context: '#3b82f6', evals: '#6b7280',
  examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
  memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
  skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
};

interface ChatPanelProps {
  projectId: string;
  mode: 'staipler' | 'control';
  messages: Message[];
  streaming: string;
  label: string;
  accent: string;
}

function ChatPanel({ projectId, mode, messages, streaming, label, accent }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  return (
    <div className="flex flex-col h-full">
      <div className={`px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2`}>
        <div className={`w-2 h-2 rounded-full ${mode === 'staipler' ? 'bg-purple-500' : 'bg-slate-600'}`} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>{label}</span>
        {mode === 'staipler' && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium ml-auto">Subject Expert</span>
        )}
        {mode === 'control' && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-500 font-medium ml-auto">No Context</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-slate-700 text-sm py-12">
            {mode === 'staipler'
              ? 'Your agent with full project context'
              : 'Same model, zero project context'
            }
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-purple-600/20 text-slate-200'
                : 'bg-white/[0.03] text-slate-300 border border-white/[0.04]'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-white/[0.03] text-slate-300 border border-white/[0.04]">
              <div className="whitespace-pre-wrap">{streaming}<span className="animate-pulse">|</span></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const PROVIDERS = [
  { id: 'claude-cli', name: 'Claude Max', desc: 'Your Claude Code plan', models: ['sonnet', 'opus', 'haiku'] },
  { id: 'anthropic', name: 'Anthropic API', desc: 'API key required', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'] },
  { id: 'openai', name: 'OpenAI API', desc: 'API key required', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
];

export function Chat({ projectId, projectName, initialPrompt, agentConfig }: { projectId: string; projectName: string; initialPrompt?: string; agentConfig?: AgentConfig }) {
  const hasPersistedConfig = !!agentConfig;
  const [input, setInput] = useState('');
  const [splitView, setSplitView] = useState(!hasPersistedConfig);
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState(agentConfig?.provider === 'hosted' ? 'anthropic' : agentConfig?.provider ?? 'claude-cli');
  const [model, setModel] = useState(agentConfig?.model ?? 'sonnet');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(true);

  // stAIpler chat state
  const [staiplerMessages, setStaiplerMessages] = useState<Message[]>([]);
  const [staiplerStreaming, setStaiplerStreaming] = useState('');

  // Control chat state
  const [controlMessages, setControlMessages] = useState<Message[]>([]);
  const [controlStreaming, setControlStreaming] = useState('');

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);

  // Welcome state: suggestions for first-time chat
  const [suggestions, setSuggestions] = useState<{ text: string; label: string }[]>([]);
  const [suggestionsInfo, setSuggestionsInfo] = useState<{ fileCount: number; layerCount: number; layers: string[] } | null>(null);

  useEffect(() => {
    if (hasPersistedConfig) {
      fetch(`/api/agent/suggestions?projectId=${projectId}`)
        .then(r => r.json())
        .then(data => {
          if (data.suggestions) setSuggestions(data.suggestions);
          setSuggestionsInfo({ fileCount: data.fileCount, layerCount: data.layerCount, layers: data.layers ?? [] });
        })
        .catch(() => { /* Suggestions are non-critical — chat works without them */ });
    }
  }, [hasPersistedConfig, projectId]);

  // Auto-send initialPrompt once on mount (for prove-value demo)
  useEffect(() => {
    if (initialPrompt && !autoSentRef.current) {
      autoSentRef.current = true;
      setSplitView(true);
      setInput(initialPrompt);
      // Delay to let state settle, then trigger send
      setTimeout(() => {
        setInput('');
        handleSendWithMessage(initialPrompt);
      }, 100);
    }
  }, [initialPrompt]);

  const currentProvider = PROVIDERS.find(p => p.id === provider)!;
  const needsApiKey = provider !== 'claude-cli';
  const showWelcome = hasPersistedConfig && staiplerMessages.length === 0 && !staiplerStreaming;
  const exchangeCount = staiplerMessages.filter(m => m.role === 'assistant').length;

  // Attribution state for stAIpler responses
  const [attribution, setAttribution] = useState<{ layer: string; fileName: string; path: string; reason: string; confidence: number; sourceType?: string; status?: string; rejectionReason?: string }[]>([]);

  async function streamChat(
    projectId: string,
    messages: Message[],
    mode: 'staipler' | 'control',
    onChunk: (text: string) => void,
    onDone: (fullText: string) => void,
  ) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, messages, mode, provider, model, ...(apiKey ? { apiKey } : {}), ...(hasPersistedConfig ? { usePersistedKey: true } : {}) }),
    });

    if (!res.ok) {
      const err = await res.json();
      onDone(`Error: ${err.error}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.attribution) {
            setAttribution(parsed.attribution);
          }
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(fullText);
          }
          if (parsed.error) {
            fullText += `\n\nError: ${parsed.error}`;
            onChunk(fullText);
          }
        } catch {
          // Partial SSE chunk — expected during streaming, not an error
        }
      }
    }

    onDone(fullText);
  }

  async function handleSendWithMessage(message: string) {
    if (!message.trim() || isStreaming) return;
    const userMessage = message.trim();
    setIsStreaming(true);

    const userMsg: Message = { role: 'user', content: userMessage };

    // Add user message to both panels
    const newStaiplerMessages = [...staiplerMessages, userMsg];
    const newControlMessages = [...controlMessages, userMsg];
    setStaiplerMessages(newStaiplerMessages);
    if (splitView) setControlMessages(newControlMessages);

    // Stream both in parallel
    const streams: Promise<void>[] = [];

    // stAIpler stream
    streams.push(
      streamChat(
        projectId,
        newStaiplerMessages,
        'staipler',
        (text) => setStaiplerStreaming(text),
        (fullText) => {
          setStaiplerStreaming('');
          setStaiplerMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
        },
      )
    );

    // Control stream (only in split view)
    if (splitView) {
      streams.push(
        streamChat(
          projectId,
          newControlMessages,
          'control',
          (text) => setControlStreaming(text),
          (fullText) => {
            setControlStreaming('');
            setControlMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
          },
        )
      );
    }

    await Promise.all(streams);
    setIsStreaming(false);
    inputRef.current?.focus();
  }

  function handleSend() {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    handleSendWithMessage(msg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex flex-col flex-1 min-w-0">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between bg-[#06060e] flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{agentConfig?.displayName || projectName}</h2>
          {!hasPersistedConfig && (
            <span className="text-[10px] text-slate-600 hidden sm:inline">Test your agent&apos;s knowledge</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Session context toggle — shows what the agent is using */}
          <button
            onClick={() => setShowContextPanel(!showContextPanel)}
            className={`px-2 py-1.5 rounded-md text-xs transition flex items-center gap-1.5 ${showContextPanel ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-slate-500 hover:text-slate-400'}`}
            title="Session context"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="hidden sm:inline">Context</span>
          </button>
          {/* Full controls for legacy/manual mode; gear toggle for configured agents */}
          {hasPersistedConfig ? (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-2 py-1.5 rounded-md text-xs transition ${showSettings ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-slate-500'}`}
              title="Settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          ) : (
            <>
              {/* Provider selector */}
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  const p = PROVIDERS.find(p => p.id === e.target.value)!;
                  setModel(p.models[0]);
                }}
                className="px-2 py-1.5 rounded-md text-xs bg-white/5 border border-white/10 text-slate-300 focus:outline-none focus:border-purple-500"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Model selector */}
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="px-2 py-1.5 rounded-md text-xs bg-white/5 border border-white/10 text-slate-300 focus:outline-none focus:border-purple-500"
              >
                {currentProvider.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {/* API key button */}
              {needsApiKey && (
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`px-2 py-1.5 rounded-md text-xs transition ${apiKey ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}
                >
                  {apiKey ? 'Key Set' : 'Add Key'}
                </button>
              )}
            </>
          )}

          {!hasPersistedConfig && (
            <button
              onClick={() => setSplitView(!splitView)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                splitView ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-slate-500'
              }`}
            >
              {splitView ? 'Split' : 'Single'}
            </button>
          )}
          <button
            onClick={() => {
              setStaiplerMessages([]);
              setControlMessages([]);
              setStaiplerStreaming('');
              setControlStreaming('');
            }}
            className="px-3 py-1.5 rounded-md text-xs text-slate-600 hover:text-slate-400 bg-white/5 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Settings panel (collapsible) — for legacy mode or when gear clicked */}
      {showSettings && !hasPersistedConfig && needsApiKey && (
        <div className="px-4 py-3 border-b border-white/[0.04] bg-[#0d0d1a] flex items-center gap-3">
          <span className="text-xs text-slate-500 whitespace-nowrap">{currentProvider.name} API Key:</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`sk-...`}
            className="flex-1 px-3 py-1.5 rounded-md bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-xs text-slate-300"
          />
          <button onClick={() => setShowSettings(false)} className="text-xs text-slate-600 hover:text-slate-400">Done</button>
        </div>
      )}
      {showSettings && hasPersistedConfig && (
        <div className="px-4 py-3 border-b border-white/[0.04] bg-[#0d0d1a] space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">Provider:</span>
            <span className="text-slate-300">{agentConfig?.provider === 'hosted' ? 'stAIpler (hosted)' : agentConfig?.provider}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Model:</span>
            <span className="text-slate-300">{agentConfig?.model}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSplitView(!splitView)}
              className={`px-2.5 py-1 rounded-md text-xs transition ${splitView ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-slate-500'}`}
            >
              {splitView ? 'Compare mode on' : 'Compare mode off'}
            </button>
            <span className="text-[10px] text-slate-600">See how context helps your assistant</span>
          </div>
        </div>
      )}

      {/* Chat panels */}
      <div className={`flex-1 overflow-hidden ${splitView ? 'grid grid-cols-2' : ''}`}>
        {splitView && (
          <>
            <div className="border-r border-white/[0.04] flex flex-col">
              <ChatPanel
                projectId={projectId}
                mode="control"
                messages={controlMessages}
                streaming={controlStreaming}
                label="Without stAIpler"
                accent="#64748b"
              />
            </div>
            <div className="flex flex-col">
              <ChatPanel
                projectId={projectId}
                mode="staipler"
                messages={staiplerMessages}
                streaming={staiplerStreaming}
                label="With stAIpler"
                accent="#a78bfa"
              />
              {/* Attribution panel — shows which sources were used and which were rejected */}
              {attribution.length > 0 && staiplerMessages.length > 0 && (
                <div className="px-3 py-2 border-t border-white/[0.04] bg-purple-500/[0.03]">
                  <div className="text-[9px] text-purple-400/60 uppercase tracking-wide mb-1.5">Response grounded in</div>
                  <div className="flex flex-wrap gap-1">
                    {attribution.filter(a => a.status !== 'rejected').map((a, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 cursor-default"
                        title={`${a.reason} (${Math.round(a.confidence * 100)}% confidence)\nSource: ${a.sourceType ?? 'unknown'}\n${a.path}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[a.layer] ?? '#6b7280' }} />
                        {a.layer}
                        {a.sourceType === 'ai-generated' && <span className="text-amber-400/60 ml-0.5">*</span>}
                      </span>
                    ))}
                  </div>
                  {attribution.some(a => a.status === 'rejected') && (
                    <div className="mt-1.5">
                      <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Not used</div>
                      <div className="flex flex-wrap gap-1">
                        {attribution.filter(a => a.status === 'rejected').map((a, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.02] text-slate-600 cursor-default"
                            title={`${a.rejectionReason}\n${a.path}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: LAYER_COLORS[a.layer] ?? '#6b7280' }} />
                            {a.fileName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {attribution.some(a => a.sourceType === 'ai-generated' && a.status !== 'rejected') && (
                    <div className="mt-1 text-[9px] text-amber-400/40">* AI-generated — no source material for this layer</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        {!splitView && (
          <div className="flex flex-col h-full">
            {/* Welcome state for configured agents */}
            {showWelcome ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="max-w-md text-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{agentConfig?.displayName || projectName}</h3>
                  {suggestionsInfo && suggestionsInfo.fileCount > 0 ? (
                    <p className="text-xs text-slate-500 mb-6">
                      Your assistant knows about {suggestionsInfo.fileCount} document{suggestionsInfo.fileCount > 1 ? 's' : ''}, covering {suggestionsInfo.layers.join(', ')}.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mb-6">
                      Your assistant is ready to chat. Connect data sources to make it smarter.
                    </p>
                  )}

                  {/* Suggested first messages */}
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendWithMessage(s.text)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/[0.04] transition group"
                      >
                        <div className="text-[10px] text-purple-400/60 font-medium uppercase tracking-wide mb-0.5">{s.label}</div>
                        <div className="text-sm text-slate-300 group-hover:text-slate-200">{s.text}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <ChatPanel
                projectId={projectId}
                mode="staipler"
                messages={staiplerMessages}
                streaming={staiplerStreaming}
                label={hasPersistedConfig ? (agentConfig?.displayName || projectName) : 'Subject Expert'}
                accent="#a78bfa"
              />
            )}

            {/* Reinforcement banner — shows after 3 exchanges */}
            {hasPersistedConfig && exchangeCount >= 3 && attribution.length > 0 && !showWelcome && (
              <div className="px-4 py-2.5 border-t border-purple-500/10 bg-purple-500/[0.04]">
                <p className="text-xs text-purple-300/80 text-center">
                  Your assistant used knowledge from {attribution.length} document{attribution.length > 1 ? 's' : ''} to answer.
                  Without stAIpler, it would have no business context.
                </p>
              </div>
            )}

            {/* Attribution in single view */}
            {!showWelcome && attribution.length > 0 && staiplerMessages.length > 0 && (
              <div className="px-3 py-2 border-t border-white/[0.04] bg-purple-500/[0.03]">
                <div className="text-[9px] text-purple-400/60 uppercase tracking-wide mb-1.5">Response grounded in</div>
                <div className="flex flex-wrap gap-1">
                  {attribution.filter(a => a.status !== 'rejected').map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 cursor-default"
                      title={`${a.reason} (${Math.round(a.confidence * 100)}% confidence)\nSource: ${a.sourceType ?? 'unknown'}\n${a.path}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[a.layer] ?? '#6b7280' }} />
                      {a.layer}
                      {a.sourceType === 'ai-generated' && <span className="text-amber-400/60 ml-0.5">*</span>}
                    </span>
                  ))}
                </div>
                {attribution.some(a => a.status === 'rejected') && (
                  <div className="mt-1.5">
                    <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Not used</div>
                    <div className="flex flex-wrap gap-1">
                      {attribution.filter(a => a.status === 'rejected').map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.02] text-slate-600 cursor-default"
                          title={`${a.rejectionReason}\n${a.path}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: LAYER_COLORS[a.layer] ?? '#6b7280' }} />
                          {a.fileName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.04] px-4 py-3 bg-[#06060e]">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={splitView ? 'Ask both agents the same question...' : hasPersistedConfig ? `Ask ${agentConfig?.displayName || 'your assistant'} anything...` : 'Ask your Subject Expert...'}
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm resize-none"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </div>
        {splitView && (
          <p className="text-center text-[10px] text-slate-700 mt-2">
            Same model, same question — left has no context, right has your compiled stAIpler stack
          </p>
        )}
      </div>
      </div>
      {showContextPanel && (
        <SessionContextPanel projectId={projectId} onClose={() => setShowContextPanel(false)} />
      )}
    </div>
  );
}
