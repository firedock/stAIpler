'use client';

import { useEffect, useState } from 'react';
import { Chat, type AgentConfig } from '@/components/chat';

interface ChatWithDemoProps {
  projectId: string;
  projectName: string;
  isDemo: boolean;
  agentConfig?: AgentConfig;
}

/**
 * Client boundary that hydrates the demo prompt from sessionStorage
 * and passes it to the Chat component. sessionStorage cannot be read
 * in server components, so this wrapper handles the client-side read.
 */
export function ChatWithDemo({ projectId, projectName, isDemo, agentConfig }: ChatWithDemoProps) {
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(!isDemo);

  useEffect(() => {
    if (!isDemo) return;

    const key = `staipler-demo-${projectId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setInitialPrompt(data.prompt);
      } catch {}
      // Clear after read — one-time use
      sessionStorage.removeItem(key);
    }
    setReady(true);
  }, [isDemo, projectId]);

  if (!ready) return null;

  return <Chat projectId={projectId} projectName={projectName} initialPrompt={initialPrompt} agentConfig={agentConfig} />;
}
