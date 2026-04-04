'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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

export function Chat({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [input, setInput] = useState('');
  const [splitView, setSplitView] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState('claude-cli');
  const [model, setModel] = useState('sonnet');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // stAIpler chat state
  const [staiplerMessages, setStaiplerMessages] = useState<Message[]>([]);
  const [staiplerStreaming, setStaiplerStreaming] = useState('');

  // Control chat state
  const [controlMessages, setControlMessages] = useState<Message[]>([]);
  const [controlStreaming, setControlStreaming] = useState('');

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentProvider = PROVIDERS.find(p => p.id === provider)!;
  const needsApiKey = provider !== 'claude-cli';

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
      body: JSON.stringify({ projectId, messages, mode, provider, model, ...(apiKey ? { apiKey } : {}) }),
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
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(fullText);
          }
          if (parsed.error) {
            fullText += `\n\nError: ${parsed.error}`;
            onChunk(fullText);
          }
        } catch {}
      }
    }

    onDone(fullText);
  }

  async function handleSend() {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput('');
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between bg-[#06060e] flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{projectName}</h2>
          <span className="text-[10px] text-slate-600 hidden sm:inline">Test your agent&apos;s knowledge</span>
        </div>
        <div className="flex items-center gap-2">
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

          <button
            onClick={() => setSplitView(!splitView)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              splitView ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-slate-500'
            }`}
          >
            {splitView ? 'Split' : 'Single'}
          </button>
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

      {/* API Key input (collapsible) */}
      {showSettings && needsApiKey && (
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
            </div>
          </>
        )}
        {!splitView && (
          <ChatPanel
            projectId={projectId}
            mode="staipler"
            messages={staiplerMessages}
            streaming={staiplerStreaming}
            label="Subject Expert"
            accent="#a78bfa"
          />
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
            placeholder={splitView ? 'Ask both agents the same question...' : 'Ask your Subject Expert...'}
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
  );
}
