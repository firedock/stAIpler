import Link from 'next/link';

export function EmptyState() {
  return (
    <div className="text-center py-20 px-6">
      <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
        Create your first project to start turning your AI agents into subject experts.
        Connect your data, scan your instruction files, and watch your empowerment score climb.
      </p>
      <Link
        href="/dashboard/new"
        className="inline-block px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition"
      >
        Create Your First Project
      </Link>
    </div>
  );
}
