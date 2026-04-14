import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { provider, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    if (provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      if (response.id) {
        return NextResponse.json({ valid: true });
      }
    } else if (provider === 'openai') {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      if (response.id) {
        return NextResponse.json({ valid: true });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }

    return NextResponse.json({ valid: false, error: 'Unexpected response from provider' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Key validation failed';
    // Common auth errors
    if (message.includes('401') || message.includes('invalid') || message.includes('Incorrect API key')) {
      return NextResponse.json({ valid: false, error: 'Invalid API key. Please check and try again.' });
    }
    return NextResponse.json({ valid: false, error: message });
  }
}
