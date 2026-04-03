'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function NewProjectPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('projects')
      .insert({ name, description, user_id: user.id })
      .select()
      .single();

    if (data) {
      router.push(`/dashboard/${data.id}`);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-2">New Project</h1>
      <p className="text-sm text-slate-500 mb-8">Create a project to start optimizing your AI agent&apos;s context.</p>

      <form onSubmit={handleCreate} className="space-y-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NoteDrawer Mobile"
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this project do?"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !name}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
