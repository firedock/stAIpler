'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/dashboard', label: 'Projects' },
  { href: '/dashboard/sources', label: 'Data Sources' },
  { href: '/dashboard/benchmark', label: 'Benchmark' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    // Projects tab is active on /dashboard and /dashboard/<id>/..., but not on sibling tabs.
    return pathname === '/dashboard' || /^\/dashboard\/(?!sources|benchmark)/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({ email }: { email: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <nav className="border-b border-white/[0.05] bg-[#06060e]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center shrink-0" title="stAIpler">
          <img src="/staipler-logo.svg" alt="stAIpler" className="h-[52px] w-auto" />
        </Link>
        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'text-purple-200 bg-purple-500/10 border border-purple-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-white/[0.02] border border-white/[0.05] font-medium"
          title={email}
        >
          {email}
        </span>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.05] transition"
        >
          Sign out
        </button>
        </div>
      </div>
    </nav>
  );
}
