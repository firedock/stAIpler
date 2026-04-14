import type { AnalysisResult } from './analyzer.js';
import type { KpiHistory, KpiSnapshot } from './kpi.js';
import type { LayerType } from '../types.js';
import { LAYER_TYPES } from '../schema.js';
import { FILE_TYPES, CATEGORY_INFO, CLASS_INFO, getFileTypeInfo } from './file-types.js';
import type { FileClass, FileCategory } from './file-types.js';

export interface DashboardData {
  projectName: string;
  currentAnalysis: AnalysisResult;
  kpiHistory: KpiHistory;
  generatedAt: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

export function generateDashboard(data: DashboardData): string {
  const { projectName, currentAnalysis, kpiHistory } = data;
  const score = currentAnalysis.readinessScore;
  const grade = currentAnalysis.grade;
  const layers = currentAnalysis.layers;
  const files = currentAnalysis.scan.files;
  const snapshots = kpiHistory.snapshots;

  // Compute empowerment narrative
  const firstSnapshot = snapshots[0];
  const latestSnapshot = snapshots[snapshots.length - 1];
  const startScore = firstSnapshot?.readinessScore ?? 0;
  const journeyDelta = score - startScore;

  // Layer status counts
  const present = layers.filter(l => l.status === 'present').length;
  const weak = layers.filter(l => l.status === 'weak').length;
  const missing = layers.filter(l => l.status === 'missing').length;

  // File class distribution
  const nativeCount = files.filter(f => {
    const info = getFileTypeInfo(f.sourceType);
    return info?.fileClass === 'native';
  }).length;
  const importedCount = files.filter(f => {
    const info = getFileTypeInfo(f.sourceType);
    return info?.fileClass === 'imported';
  }).length;
  const supportingCount = files.filter(f => {
    const info = getFileTypeInfo(f.sourceType);
    return info?.fileClass === 'supporting';
  }).length;
  const unclassifiedCount = files.length - nativeCount - importedCount - supportingCount;

  // Timeline events
  const timelineEvents = snapshots.map((s, i) => {
    const prevScore = i > 0 ? snapshots[i - 1].readinessScore : 0;
    const delta = s.readinessScore - prevScore;
    return {
      date: s.timestamp.split('T')[0],
      time: s.timestamp.split('T')[1]?.split('.')[0] ?? '',
      action: s.action,
      score: s.readinessScore,
      grade: s.grade,
      delta,
      notes: s.notes,
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>stAIpler Dashboard — ${escapeHtml(projectName)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 68 72'%3E%3Cdefs%3E%3ClinearGradient id='mg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='50%25' stop-color='%237c3aed'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M8 14 L8 52 Q8 68 22 68 L46 68 Q60 68 60 52 L60 14' fill='none' stroke='url(%23mg)' stroke-width='6' stroke-linecap='round' opacity='0.35'/%3E%3Ctext x='34' y='56' font-family='Inter,Helvetica Neue,Arial,sans-serif' font-size='40' font-weight='800' fill='url(%23mg)' text-anchor='middle' letter-spacing='1'%3EAI%3C/text%3E%3C/svg%3E">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #06060e; color: #e2e8f0; min-height: 100vh; }

  /* Layout */
  .dashboard { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* Header */
  .dash-header { text-align: center; padding: 40px 24px 32px; position: relative; }
  .dash-header::after { content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, rgba(167,139,250,0.3), transparent); }
  .dash-header h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: 0.05em; margin-bottom: 4px; }
  .dash-header h1 strong { font-weight: 700; color: #a78bfa; }
  .dash-header .project-name { font-size: 1rem; color: #64748b; }
  .dash-header .generated { font-size: 0.75rem; color: #334155; margin-top: 8px; }

  /* Empowerment hero */
  .hero { display: flex; align-items: center; justify-content: center; gap: 48px; padding: 48px 24px; margin-bottom: 32px; }
  .empowerment-ring { position: relative; width: 180px; height: 180px; flex-shrink: 0; }
  .empowerment-ring svg { transform: rotate(-90deg); filter: drop-shadow(0 0 20px ${scoreColor(score)}33); }
  .empowerment-ring .ring-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .empowerment-ring .ring-score { font-size: 3rem; font-weight: 700; color: ${scoreColor(score)}; line-height: 1; }
  .empowerment-ring .ring-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }
  .empowerment-ring .ring-grade { font-size: 1.4rem; font-weight: 700; color: ${gradeColor(grade)}; margin-top: 2px; }

  .hero-narrative { max-width: 400px; }
  .hero-narrative h2 { font-size: 1.3rem; margin-bottom: 12px; color: #e2e8f0; }
  .hero-narrative p { font-size: 0.9rem; color: #94a3b8; line-height: 1.7; margin-bottom: 12px; }
  .hero-stat { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; margin-right: 8px; margin-bottom: 8px; }

  /* Metric cards */
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .metric { background: #0d0d1a; border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 20px; text-align: center; }
  .metric .m-value { font-size: 2rem; font-weight: 700; line-height: 1.2; }
  .metric .m-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
  .metric .m-sub { font-size: 0.75rem; color: #475569; margin-top: 2px; }

  /* Sections */
  .section { margin-bottom: 32px; }
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .section-header h3 { font-size: 1.1rem; }
  .section-header .section-sub { font-size: 0.8rem; color: #64748b; }

  /* Layer grid */
  .layer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .layer-card { background: #0d0d1a; border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 16px; position: relative; overflow: hidden; }
  .layer-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
  .layer-present::before { background: #10b981; }
  .layer-weak::before { background: #f59e0b; }
  .layer-missing::before { background: #ef4444; }
  .layer-card .l-kind { font-size: 0.9rem; font-weight: 600; text-transform: capitalize; margin-bottom: 4px; }
  .layer-card .l-score { font-size: 1.5rem; font-weight: 700; line-height: 1; }
  .layer-card .l-bar { height: 4px; background: rgba(255,255,255,0.04); border-radius: 2px; margin: 8px 0; overflow: hidden; }
  .layer-card .l-fill { height: 100%; border-radius: 2px; }
  .layer-card .l-status { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .layer-card .l-importance { font-size: 0.65rem; color: #475569; position: absolute; top: 12px; right: 12px; }
  .layer-card .l-files { font-size: 0.75rem; color: #475569; margin-top: 6px; }

  /* Timeline */
  .timeline { position: relative; padding-left: 32px; }
  .timeline::before { content: ''; position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.06); }
  .tl-event { position: relative; padding: 12px 0 24px; }
  .tl-dot { position: absolute; left: -28px; top: 16px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #0d0d1a; }
  .tl-dot-scan { background: #475569; }
  .tl-dot-optimize { background: #a78bfa; }
  .tl-dot-eval { background: #10b981; }
  .tl-content { background: #0d0d1a; border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 14px 18px; }
  .tl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px; }
  .tl-action { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .tl-action-scan { color: #64748b; }
  .tl-action-optimize { color: #a78bfa; }
  .tl-action-eval { color: #10b981; }
  .tl-date { font-size: 0.75rem; color: #475569; }
  .tl-body { display: flex; align-items: center; gap: 16px; }
  .tl-score { font-size: 1.3rem; font-weight: 700; }
  .tl-delta { font-size: 0.85rem; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
  .tl-delta-positive { background: rgba(16,185,129,0.15); color: #10b981; }
  .tl-delta-negative { background: rgba(239,68,68,0.15); color: #ef4444; }
  .tl-delta-neutral { background: rgba(107,114,128,0.15); color: #9ca3af; }
  .tl-notes { font-size: 0.8rem; color: #64748b; }

  /* Trend chart */
  .trend-chart { background: #0d0d1a; border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .trend-empty { color: #475569; text-align: center; padding: 40px; font-size: 0.9rem; }

  /* Files discovered */
  .file-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
  .fl-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #0d0d1a; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; font-size: 0.82rem; }
  .fl-name { flex: 1; color: #cbd5e1; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fl-kind { font-size: 0.7rem; padding: 2px 8px; border-radius: 8px; flex-shrink: 0; }
  .fl-source { font-size: 0.65rem; color: #475569; flex-shrink: 0; }
  .fl-class { font-size: 0.6rem; padding: 1px 6px; border-radius: 6px; flex-shrink: 0; }
  .fl-class-native { background: rgba(167,139,250,0.15); color: #a78bfa; }
  .fl-class-imported { background: rgba(59,130,246,0.15); color: #3b82f6; }
  .fl-class-supporting { background: rgba(100,116,139,0.15); color: #94a3b8; }

  /* Kind colors */
  .kind-identity { background: rgba(239,68,68,0.15); color: #ef4444; }
  .kind-goals { background: rgba(249,115,22,0.15); color: #f97316; }
  .kind-context { background: rgba(59,130,246,0.15); color: #3b82f6; }
  .kind-constraints { background: rgba(239,68,68,0.15); color: #ef4444; }
  .kind-skills { background: rgba(16,185,129,0.15); color: #10b981; }
  .kind-style { background: rgba(168,85,247,0.15); color: #a855f7; }
  .kind-examples { background: rgba(234,179,8,0.15); color: #eab308; }
  .kind-tools { background: rgba(107,114,128,0.15); color: #6b7280; }
  .kind-memory { background: rgba(6,182,212,0.15); color: #06b6d4; }
  .kind-policies { background: rgba(220,38,38,0.15); color: #dc2626; }
  .kind-evals { background: rgba(14,165,233,0.15); color: #0ea5e9; }
  .kind-prompts { background: rgba(139,92,246,0.15); color: #8b5cf6; }
  .kind-unknown { background: rgba(107,114,128,0.1); color: #6b7280; }

  /* Footer */
  .footer { text-align: center; padding: 32px; color: #334155; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.04); margin-top: 32px; }

  @media (max-width: 700px) {
    .hero { flex-direction: column; gap: 24px; }
    .hero-narrative { text-align: center; }
  }
</style>
</head>
<body>
<div class="dashboard">

  <div class="dash-header">
    <h1>st<strong>AI</strong>pler</h1>
    <div class="project-name">${escapeHtml(projectName || 'Project Dashboard')}</div>
    <div class="generated">${data.generatedAt.split('T')[0]}</div>
  </div>

  <!-- EMPOWERMENT HERO -->
  <div class="hero">
    <div class="empowerment-ring">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="78" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="8"/>
        <circle cx="90" cy="90" r="78" fill="none" stroke="${scoreColor(score)}" stroke-width="8"
          stroke-dasharray="${2 * Math.PI * 78}" stroke-dashoffset="${2 * Math.PI * 78 * (1 - score / 100)}"
          stroke-linecap="round"/>
      </svg>
      <div class="ring-center">
        <div class="ring-score">${score}</div>
        <div class="ring-label">Empowerment</div>
        <div class="ring-grade">${grade}</div>
      </div>
    </div>
    <div class="hero-narrative">
      <h2>${score >= 80 ? 'Agent is well-equipped' : score >= 60 ? 'Agent has good foundations' : score >= 40 ? 'Agent needs more context' : 'Agent is flying blind'}</h2>
      <p>${score >= 80
        ? `Your instruction stack covers ${present} of ${LAYER_TYPES.length} layer types. The agent has strong context about who it is, what it can do, and what it must not do.`
        : score >= 60
        ? `Your stack covers ${present} layers but has ${missing} gaps. The agent can function but may hallucinate in areas without specific guidance.`
        : score >= 40
        ? `Only ${present} of ${LAYER_TYPES.length} layers are covered. The agent is missing critical context and will fall back to generic behavior for most tasks.`
        : `The agent has almost no project-specific context. It will rely entirely on general training data, leading to generic and potentially incorrect outputs.`
      }</p>
      <div>
        <span class="hero-stat" style="background:rgba(16,185,129,0.1);color:#10b981;">${present} present</span>
        ${weak > 0 ? `<span class="hero-stat" style="background:rgba(245,158,11,0.1);color:#f59e0b;">${weak} weak</span>` : ''}
        ${missing > 0 ? `<span class="hero-stat" style="background:rgba(239,68,68,0.1);color:#ef4444;">${missing} missing</span>` : ''}
      </div>
    </div>
  </div>

  <!-- METRICS -->
  <div class="metrics">
    <div class="metric">
      <div class="m-value" style="color:#e2e8f0;">${files.length}</div>
      <div class="m-label">Files Found</div>
      <div class="m-sub">${nativeCount} native · ${importedCount} imported · ${supportingCount + unclassifiedCount} other</div>
    </div>
    <div class="metric">
      <div class="m-value" style="color:#10b981;">${present}</div>
      <div class="m-label">Layers Covered</div>
      <div class="m-sub">of ${LAYER_TYPES.length} total</div>
    </div>
    <div class="metric">
      <div class="m-value" style="color:#ef4444;">${missing}</div>
      <div class="m-label">Gaps</div>
      <div class="m-sub">${layers.filter(l => l.status === 'missing' && l.importance === 'critical').length} critical</div>
    </div>
    <div class="metric">
      <div class="m-value" style="color:#a78bfa;">${snapshots.length}</div>
      <div class="m-label">Snapshots</div>
      <div class="m-sub">${snapshots.filter(s => s.action === 'optimize').length} optimizations</div>
    </div>
    <div class="metric">
      <div class="m-value" style="color:${journeyDelta > 0 ? '#10b981' : '#64748b'};">${journeyDelta > 0 ? '+' : ''}${journeyDelta}</div>
      <div class="m-label">Progress</div>
      <div class="m-sub">since first scan</div>
    </div>
  </div>

  <!-- LAYER COVERAGE -->
  <div class="section">
    <div class="section-header">
      <h3>Layer Coverage</h3>
      <span class="section-sub">${present}/${LAYER_TYPES.length} layers active</span>
    </div>
    <div class="layer-grid">
      ${layers.map(l => {
        const color = scoreColor(l.qualityScore);
        return `
        <div class="layer-card layer-${l.status}">
          <div class="l-importance">${l.importance}</div>
          <div class="l-kind">${l.kind}</div>
          <div class="l-score" style="color:${color}">${l.qualityScore}</div>
          <div class="l-bar"><div class="l-fill" style="width:${l.qualityScore}%;background:${color}"></div></div>
          <div class="l-status" style="color:${color}">${l.status}</div>
          ${l.files.length > 0 ? `<div class="l-files">${l.files.length} file${l.files.length > 1 ? 's' : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- TREND -->
  <div class="section">
    <div class="section-header">
      <h3>Empowerment Over Time</h3>
      <span class="section-sub">${snapshots.length} data points</span>
    </div>
    ${snapshots.length < 2 ? '<div class="trend-chart"><div class="trend-empty">Run <code>staipler optimize</code> a few times to see trends.</div></div>' : `
    <div class="trend-chart">
      <canvas id="trend-canvas" width="1100" height="280" style="width:100%;height:auto;"></canvas>
    </div>
    <script>
    (function() {
      const data = ${JSON.stringify(snapshots.map(s => ({ score: s.readinessScore, action: s.action, date: s.timestamp.split('T')[0] })))};
      const canvas = document.getElementById('trend-canvas');
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const pad = { top: 20, right: 20, bottom: 50, left: 50 };
      const pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.fillStyle = '#334155';
      ctx.font = '11px system-ui';
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + (ph * i / 5);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(String(100 - i * 20), pad.left - 8, y + 4);
      }

      // Gradient fill under line
      const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
      grad.addColorStop(0, 'rgba(167, 139, 250, 0.15)');
      grad.addColorStop(1, 'rgba(167, 139, 250, 0)');

      // Area
      ctx.beginPath();
      ctx.moveTo(pad.left, h - pad.bottom);
      data.forEach((d, i) => {
        const x = pad.left + (pw * i / Math.max(1, data.length - 1));
        const y = pad.top + ph * (1 - d.score / 100);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(pad.left + pw, h - pad.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2.5;
      data.forEach((d, i) => {
        const x = pad.left + (pw * i / Math.max(1, data.length - 1));
        const y = pad.top + ph * (1 - d.score / 100);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      const colors = { scan: '#475569', optimize: '#a78bfa', eval: '#10b981' };
      data.forEach((d, i) => {
        const x = pad.left + (pw * i / Math.max(1, data.length - 1));
        const y = pad.top + ph * (1 - d.score / 100);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors[d.action] || '#475569'; ctx.fill();
        ctx.fillStyle = '#475569'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(d.date, x, h - pad.bottom + 16);
      });
    })();
    </script>`}
  </div>

  <!-- TIMELINE -->
  ${snapshots.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <h3>Activity Timeline</h3>
    </div>
    <div class="timeline">
      ${timelineEvents.reverse().map(e => `
        <div class="tl-event">
          <div class="tl-dot tl-dot-${e.action}"></div>
          <div class="tl-content">
            <div class="tl-header">
              <span class="tl-action tl-action-${e.action}">${e.action}</span>
              <span class="tl-date">${e.date} ${e.time}</span>
            </div>
            <div class="tl-body">
              <span class="tl-score" style="color:${scoreColor(e.score)}">${e.score}/100</span>
              ${e.delta !== 0 ? `<span class="tl-delta ${e.delta > 0 ? 'tl-delta-positive' : 'tl-delta-negative'}">${e.delta > 0 ? '+' : ''}${e.delta}</span>` : '<span class="tl-delta tl-delta-neutral">±0</span>'}
              ${e.notes ? `<span class="tl-notes">${escapeHtml(e.notes)}</span>` : ''}
            </div>
          </div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- DISCOVERED FILES -->
  <div class="section">
    <div class="section-header">
      <h3>Discovered Files</h3>
      <span class="section-sub">${files.length} files across project</span>
    </div>
    <div class="file-list">
      ${files.map(f => {
        const info = getFileTypeInfo(f.sourceType);
        const cls = info?.fileClass ?? 'supporting';
        return `
        <div class="fl-item">
          <span class="fl-class fl-class-${cls}">${cls}</span>
          <span class="fl-name" title="${escapeHtml(f.relativePath)}">${escapeHtml(f.relativePath)}</span>
          ${f.inferredKind ? `<span class="fl-kind kind-${f.inferredKind}">${f.inferredKind}</span>` : '<span class="fl-kind kind-unknown">?</span>'}
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="footer">
    stAIpler v0.1.0 — Context optimization for AI agents
  </div>

</div>
</body>
</html>`;
}
