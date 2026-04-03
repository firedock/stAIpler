'use client';

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#10b981';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  return '#ef4444';
}

export function EmpowermentRing({ score, grade }: { score: number; grade: string }) {
  const r = 70;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative w-[180px] h-[180px] flex-shrink-0">
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
        <circle
          cx="90" cy="90" r={r} fill="none"
          stroke={scoreColor(score)}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 12px ${scoreColor(score)}44)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold" style={{ color: scoreColor(score) }}>{score}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Empowerment</span>
        <span className="text-lg font-bold mt-0.5" style={{ color: gradeColor(grade) }}>{grade}</span>
      </div>
    </div>
  );
}
