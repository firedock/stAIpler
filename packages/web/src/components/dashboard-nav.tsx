'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function DashboardNav({ email }: { email: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <nav className="border-b border-white/[0.04] px-6 py-3 flex items-center justify-between bg-[#06060e]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center" title="stAIpler">
          <img src="/staipler-logo.svg" alt="stAIpler" className="h-7 w-auto" />
        </Link>
        <div className="flex gap-1">
          <Link href="/dashboard" className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition">
            Projects
          </Link>
          <Link href="/dashboard/sources" className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition">
            Data Sources
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-slate-600">{email}</span>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-slate-300 transition"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
