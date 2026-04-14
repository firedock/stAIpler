import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Suggestion {
  text: string;
  label: string;
}

const LAYER_SUGGESTIONS: Record<string, Suggestion> = {
  identity: { text: 'Tell me about yourself — who are you and what do you do?', label: 'Meet your assistant' },
  constraints: { text: 'What are you not allowed to do? What are your limits?', label: 'Safety check' },
  context: { text: 'What do you know about our business and how we work?', label: 'Business knowledge' },
  goals: { text: 'What are your main priorities when helping me?', label: 'Priorities' },
  skills: { text: 'Walk me through how you would handle a typical customer question.', label: 'See it in action' },
  policies: { text: 'What company policies do you follow when responding?', label: 'Policy awareness' },
  style: { text: 'Show me how you would greet a new customer.', label: 'Tone check' },
  tools: { text: 'What tools and integrations do you have access to?', label: 'Capabilities' },
  memory: { text: 'What context do you remember about our previous interactions?', label: 'Memory check' },
  examples: { text: 'Can you show me an example of a great response you would give?', label: 'Example response' },
};

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { text: 'Hi! What can you help me with?', label: 'Get started' },
  { text: 'Tell me what you know about our business.', label: 'Test knowledge' },
  { text: 'How would you handle an unhappy customer?', label: 'Stress test' },
];

// Priority order for picking the best 3 suggestions
const PRIORITY = ['identity', 'context', 'skills', 'constraints', 'goals', 'policies', 'style', 'tools', 'memory', 'examples'];

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    // Get present layers for this project
    const { data: files } = await supabase
      .from('project_files')
      .select('inferred_kind')
      .eq('project_id', projectId)
      .not('inferred_kind', 'is', null);

    const presentLayers = new Set((files ?? []).map(f => f.inferred_kind));
    const fileCount = files?.length ?? 0;

    // Pick suggestions based on which layers exist
    const suggestions: Suggestion[] = [];
    for (const layer of PRIORITY) {
      if (suggestions.length >= 3) break;
      if (presentLayers.has(layer)) {
        suggestions.push(LAYER_SUGGESTIONS[layer]);
      }
    }

    // Fill with fallbacks if not enough layers present
    while (suggestions.length < 3) {
      const fallback = FALLBACK_SUGGESTIONS[suggestions.length];
      if (fallback) suggestions.push(fallback);
      else break;
    }

    return NextResponse.json({
      suggestions,
      fileCount,
      layerCount: presentLayers.size,
      layers: Array.from(presentLayers),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get suggestions' }, { status: 500 });
  }
}
