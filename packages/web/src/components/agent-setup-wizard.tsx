'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = ['Name', 'Knowledge', 'AI Brain', 'Ready'];

// --- Step indicators ---

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${i <= current ? 'text-purple-400' : 'text-slate-600'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
              i < current ? 'bg-purple-600 border-purple-600 text-white' :
              i === current ? 'border-purple-500 text-purple-400' :
              'border-slate-700 text-slate-600'
            }`}>
              {i < current ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : i + 1}
            </div>
            <span className="text-xs font-medium hidden sm:inline">{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-px ${i < current ? 'bg-purple-600' : 'bg-slate-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Step 1: Name ---

function StepName({ displayName, setDisplayName, description, setDescription, onNext }: {
  displayName: string; setDisplayName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Name your AI assistant</h2>
      <p className="text-sm text-slate-400 mb-8">
        Give your assistant a name that makes sense for your business. This is what your customers will see.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Assistant name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Acme Support Bot"
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">What does your business do? <span className="text-slate-600">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. We sell handmade candles online and need help with customer questions"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm resize-none"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!displayName.trim()}
        className="w-full mt-8 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 font-medium text-sm hover:opacity-90 transition disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}

// --- Step 2: Connect Knowledge ---

function StepKnowledge({ onNext, onFileUpload, uploadedFiles, uploading, onGoogleDrive }: {
  onNext: () => void;
  onFileUpload: (files: FileList) => void;
  uploadedFiles: string[];
  uploading: boolean;
  onGoogleDrive: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-2">Connect your knowledge</h2>
      <p className="text-sm text-slate-400 mb-8">
        Your assistant needs to know about your business. Upload documents, and it will learn your products, policies, and how to help your customers.
      </p>

      <div className="space-y-3">
        {/* File upload — primary for non-technical users */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 transition text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium group-hover:text-purple-400 transition">
              {uploading ? 'Uploading...' : 'Upload files'}
            </div>
            <div className="text-xs text-slate-500">PDFs, docs, text files — anything about your business</div>
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          accept=".md,.txt,.pdf,.doc,.docx"
          onChange={(e) => e.target.files && onFileUpload(e.target.files)}
        />

        {/* Google Drive */}
        <button
          onClick={onGoogleDrive}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-blue-500/50 transition text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="#4285F4"/><path d="M14 2v6h6" fill="#A1C2FA"/><rect x="8" y="12" width="8" height="1.5" rx=".5" fill="#fff"/><rect x="8" y="15" width="6" height="1.5" rx=".5" fill="#fff"/></svg>
          </div>
          <div>
            <div className="text-sm font-medium group-hover:text-blue-400 transition">Google Drive</div>
            <div className="text-xs text-slate-500">Sign in with Google to import your docs</div>
          </div>
        </button>

        {/* Notion — coming in Phase 1b */}
        <div className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] opacity-60">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.09 2.2c-.466-.373-.98-.746-2.054-.653L3.29 2.8c-.467.047-.56.28-.374.466l1.543 1.142zm.793 2.24v13.882c0 .746.373 1.026 1.213.98l14.523-.84c.84-.046.933-.56.933-1.166V5.654c0-.606-.233-.886-.746-.84l-15.177.84c-.56.046-.746.28-.746.793zm14.336.933c.093.42 0 .84-.42.886l-.7.14v10.264c-.606.327-1.166.514-1.633.514-.746 0-.933-.234-1.493-.933l-4.571-7.178v6.952l1.446.327s0 .84-1.166.84l-3.219.186c-.093-.186 0-.653.327-.746l.84-.233V8.95L7.57 8.81c-.093-.42.14-1.026.793-1.073l3.453-.233 4.757 7.271v-6.44l-1.213-.14c-.093-.513.28-.886.746-.933l3.28-.186z" fill="#fff"/></svg>
          </div>
          <div>
            <div className="text-sm font-medium">Notion <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 ml-1.5">Coming soon</span></div>
            <div className="text-xs text-slate-500">Import pages and databases</div>
          </div>
        </div>
      </div>

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="text-xs font-medium text-emerald-400 mb-2">{uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded</div>
          {uploadedFiles.map((f) => (
            <div key={f} className="text-xs text-slate-400 truncate">{f}</div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <button
          onClick={onNext}
          className={`flex-1 py-3 rounded-lg font-medium text-sm transition ${
            uploadedFiles.length > 0
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90'
              : 'bg-white/5 border border-white/10 text-slate-400 hover:border-white/20'
          }`}
        >
          {uploadedFiles.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}

// --- Step 3: Choose AI Brain ---

function StepBrain({ provider, setProvider, apiKey, setApiKey, model, setModel, onNext, onTestKey, testResult, testing }: {
  provider: string; setProvider: (v: string) => void;
  apiKey: string; setApiKey: (v: string) => void;
  model: string; setModel: (v: string) => void;
  onNext: () => void;
  onTestKey: () => void;
  testResult: { valid: boolean; error?: string } | null;
  testing: boolean;
}) {
  const providers = [
    {
      id: 'hosted',
      name: 'Let stAIpler handle it',
      desc: 'Start chatting immediately. No setup required.',
      detail: 'Free tier includes 50K tokens/month.',
      highlight: true,
    },
    {
      id: 'anthropic',
      name: 'Claude by Anthropic',
      desc: 'Excellent at following instructions and staying safe.',
      detail: 'Requires an API key from anthropic.com',
      models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],
      modelLabels: ['Sonnet (balanced)', 'Opus (most capable)', 'Haiku (fastest)'],
    },
    {
      id: 'openai',
      name: 'GPT by OpenAI',
      desc: 'Popular and versatile AI models.',
      detail: 'Requires an API key from platform.openai.com',
      models: ['gpt-4o', 'gpt-4o-mini'],
      modelLabels: ['GPT-4o (most capable)', 'GPT-4o Mini (faster)'],
    },
  ];

  const selectedProvider = providers.find(p => p.id === provider);
  const needsKey = provider !== 'hosted';

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-2">Choose your AI brain</h2>
      <p className="text-sm text-slate-400 mb-8">
        Pick the AI that powers your assistant. Not sure? Start with our hosted option — no setup needed.
      </p>

      <div className="space-y-3">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setProvider(p.id);
              if (p.models) setModel(p.models[0]);
            }}
            className={`w-full text-left p-4 rounded-xl border transition ${
              provider === p.id
                ? p.highlight
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-purple-500 bg-white/[0.04]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                provider === p.id ? 'border-purple-500' : 'border-slate-600'
              }`}>
                {provider === p.id && <div className="w-2 h-2 rounded-full bg-purple-500" />}
              </div>
              <div>
                <div className="text-sm font-medium">
                  {p.name}
                  {p.highlight && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 ml-2">Recommended</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{p.desc}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-600 mt-1.5 ml-7">{p.detail}</div>
          </button>
        ))}
      </div>

      {/* BYOB: API key input + model selection */}
      {needsKey && (
        <div className="mt-6 p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div>
            <div className="text-xs text-slate-400 mb-3">
              An API key is like a password that lets your assistant talk to {provider === 'anthropic' ? 'Claude' : 'GPT'}.{' '}
              <a
                href={provider === 'anthropic' ? 'https://console.anthropic.com/settings/keys' : 'https://platform.openai.com/api-keys'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                Get your key here
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm font-mono"
              />
              <button
                onClick={onTestKey}
                disabled={!apiKey || testing}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:border-purple-500/50 transition disabled:opacity-40"
              >
                {testing ? 'Testing...' : 'Test'}
              </button>
            </div>
            {testResult && (
              <div className={`text-xs mt-2 ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.valid ? 'Key is valid!' : testResult.error || 'Invalid key'}
              </div>
            )}
          </div>

          {/* Model selection */}
          {selectedProvider?.models && (
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Model</label>
              <div className="space-y-1.5">
                {selectedProvider.models.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                      model === m
                        ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300'
                        : 'bg-white/[0.02] border border-white/[0.04] text-slate-400 hover:border-white/10'
                    }`}
                  >
                    {selectedProvider.modelLabels?.[i] || m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={needsKey && !apiKey}
        className="w-full mt-8 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 font-medium text-sm hover:opacity-90 transition disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}

// --- Step 4: Ready ---

function StepReady({ displayName, provider, uploadedFiles, creating, onCreate }: {
  displayName: string;
  provider: string;
  uploadedFiles: string[];
  creating: boolean;
  onCreate: () => void;
}) {
  const providerLabel = provider === 'hosted' ? 'stAIpler (hosted)' : provider === 'anthropic' ? 'Claude by Anthropic' : 'GPT by OpenAI';

  return (
    <div className="max-w-md mx-auto text-center">
      {/* Animated check */}
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </div>

      <h2 className="text-2xl font-bold mb-2">{displayName} is ready!</h2>
      <p className="text-sm text-slate-400 mb-8">
        Your AI assistant is configured and ready to chat. You can always connect more data sources and fine-tune later.
      </p>

      {/* Summary */}
      <div className="text-left p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3 mb-8">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Assistant</span>
          <span className="font-medium">{displayName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">AI Provider</span>
          <span className="font-medium">{providerLabel}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Knowledge</span>
          <span className="font-medium">
            {uploadedFiles.length > 0 ? `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} uploaded` : 'No files yet'}
          </span>
        </div>
      </div>

      <button
        onClick={onCreate}
        disabled={creating}
        className="w-full py-3.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
      >
        {creating ? 'Setting up...' : 'Talk to your assistant'}
      </button>
    </div>
  );
}

// --- Main Wizard ---

export function AgentSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2 state
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; content: string }[]>([]);

  // Step 3 state
  const [provider, setProvider] = useState('hosted');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Step 4 state
  const [creating, setCreating] = useState(false);

  async function handleGoogleDrive() {
    try {
      const res = await fetch('/api/sources/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: '__pending__' }),
      });
      const data = await res.json();
      if (data.authUrl) {
        // Store wizard state before redirect so we can resume after OAuth
        sessionStorage.setItem('staipler-setup-state', JSON.stringify({
          step, displayName, description, uploadedFiles, pendingFiles: pendingFiles.map(f => ({ name: f.name })),
        }));
        window.location.href = data.authUrl;
      }
    } catch {}
  }

  async function handleFileUpload(files: FileList) {
    setUploading(true);
    const names: string[] = [];
    const fileData: { name: string; content: string }[] = [];

    for (const file of Array.from(files)) {
      const text = await file.text();
      names.push(file.name);
      fileData.push({ name: file.name, content: text });
    }

    setUploadedFiles(prev => [...prev, ...names]);
    setPendingFiles(prev => [...prev, ...fileData]);
    setUploading(false);
  }

  async function handleTestKey() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/agent/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ valid: false, error: 'Connection failed' });
    }
    setTesting(false);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      // 1. Create project + agent config
      const setupRes = await fetch('/api/agent/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          description,
          provider,
          model,
          apiKey: provider !== 'hosted' ? apiKey : undefined,
        }),
      });
      const { projectId, error } = await setupRes.json();
      if (!projectId) throw new Error(error || 'Setup failed');

      // 2. Upload pending files if any
      if (pendingFiles.length > 0) {
        const formData = new FormData();
        formData.append('projectId', projectId);
        for (const f of pendingFiles) {
          formData.append('files', new Blob([f.content], { type: 'text/markdown' }), f.name);
        }
        await fetch('/api/sources/upload', {
          method: 'POST',
          body: formData,
        });
      }

      // 3. Navigate to chat
      router.push(`/dashboard/${projectId}/chat`);
    } catch (err) {
      setCreating(false);
      alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <StepIndicator current={step} />

      {step === 0 && (
        <StepName
          displayName={displayName}
          setDisplayName={setDisplayName}
          description={description}
          setDescription={setDescription}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <StepKnowledge
          onNext={() => setStep(2)}
          onFileUpload={handleFileUpload}
          uploadedFiles={uploadedFiles}
          uploading={uploading}
          onGoogleDrive={handleGoogleDrive}
        />
      )}
      {step === 2 && (
        <StepBrain
          provider={provider}
          setProvider={setProvider}
          apiKey={apiKey}
          setApiKey={setApiKey}
          model={model}
          setModel={setModel}
          onNext={() => setStep(3)}
          onTestKey={handleTestKey}
          testResult={testResult}
          testing={testing}
        />
      )}
      {step === 3 && (
        <StepReady
          displayName={displayName}
          provider={provider}
          uploadedFiles={uploadedFiles}
          creating={creating}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
