import type { AnalysisResult } from './analyzer.js';
import type { OptimizationResult } from './agent.js';
import type { KpiHistory } from './kpi.js';
import { LAYER_TYPES } from '../schema.js';
import { FILE_TYPES, CATEGORY_INFO, CLASS_INFO, getFileTypeInfo, getFileTypesByClass } from './file-types.js';
import type { FileCategory, FileClass } from './file-types.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateDemoReport(
  analysis: AnalysisResult,
  optimization: OptimizationResult | null,
  kpiHistory: KpiHistory,
): string {
  const layers = analysis.layers;
  const beforeScore = analysis.readinessScore;
  const afterScore = optimization?.afterScore ?? beforeScore;
  const hasOptimization = optimization !== null;

  // Build file list for "before" view
  const beforeFiles = analysis.scan.files.map(f => {
    const typeInfo = getFileTypeInfo(f.sourceType);
    return {
      name: f.relativePath,
      kind: f.inferredKind,
      confidence: f.inferredConfidence,
      sourceType: f.sourceType,
      sourceLabel: typeInfo?.name ?? f.sourceType,
      size: f.contentLength,
      content: f.content.slice(0, 300),
    };
  });

  // Build asset list for "after" view
  const afterAssets = optimization?.assets ?? [];

  // KPI trend data
  const kpiData = kpiHistory.snapshots.map(s => ({
    date: s.timestamp.split('T')[0],
    score: s.readinessScore,
    action: s.action,
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>stAIpler - Context Optimizer</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 68 72'%3E%3Cdefs%3E%3ClinearGradient id='mg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='50%25' stop-color='%237c3aed'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M8 14 L8 52 Q8 68 22 68 L46 68 Q60 68 60 52 L60 14' fill='none' stroke='url(%23mg)' stroke-width='6' stroke-linecap='round' opacity='0.35'/%3E%3Ctext x='34' y='56' font-family='Inter,Helvetica Neue,Arial,sans-serif' font-size='40' font-weight='800' fill='url(%23mg)' text-anchor='middle' letter-spacing='1'%3EAI%3C/text%3E%3C/svg%3E">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0a0a12; color: #e2e8f0; }
  .app { display: flex; flex-direction: column; min-height: 100vh; }

  /* Header */
  .header { padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 1.5rem; font-weight: 700; }
  .header h1 span { color: #a78bfa; }
  .header .subtitle { color: #64748b; font-size: 0.85rem; margin-top: 2px; }
  .header-right { display: flex; gap: 16px; align-items: center; }

  /* Score ring */
  .score-ring { position: relative; width: 80px; height: 80px; }
  .score-ring svg { transform: rotate(-90deg); }
  .score-ring .value { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 1.3rem; font-weight: 700; }
  .score-ring .label { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }

  /* Tabs */
  .tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; }
  .tab { padding: 14px 24px; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; font-size: 0.9rem; transition: all 0.2s; }
  .tab:hover { color: #e2e8f0; }
  .tab.active { color: #a78bfa; border-bottom-color: #a78bfa; }

  /* Panels */
  .panel { display: none; padding: 32px; flex: 1; overflow-y: auto; }
  .panel.active { display: block; }

  /* Before/After */
  .comparison { display: grid; grid-template-columns: 1fr 60px 1fr; gap: 0; align-items: start; }
  .side { min-height: 400px; }
  .side-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: rgba(255,255,255,0.02); border-radius: 12px 12px 0 0; border: 1px solid rgba(255,255,255,0.06); border-bottom: none; }
  .side-header h3 { font-size: 1rem; }
  .side-header .side-score { font-size: 1.4rem; font-weight: 700; }
  .side-body { background: #12121e; border: 1px solid rgba(255,255,255,0.06); border-radius: 0 0 12px 12px; padding: 16px; min-height: 350px; }

  .arrow-col { display: flex; align-items: center; justify-content: center; padding-top: 60px; }
  .arrow { font-size: 2rem; color: #a78bfa; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

  /* File cards */
  .file-card { padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.2s; }
  .file-card:hover { border-color: rgba(167,139,250,0.3); background: rgba(167,139,250,0.04); }
  .file-card .file-name { font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
  .file-card .file-meta { display: flex; gap: 8px; align-items: center; }
  .file-card .file-kind { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; }
  .file-card .file-size { font-size: 0.7rem; color: #64748b; }
  .file-card .file-source { font-size: 0.7rem; color: #475569; }

  .kind-identity { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
  .kind-goals { background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.2); }
  .kind-context { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.2); }
  .kind-constraints { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
  .kind-skills { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
  .kind-style { background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.2); }
  .kind-examples { background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.2); }
  .kind-tools { background: rgba(107,114,128,0.15); color: #6b7280; border: 1px solid rgba(107,114,128,0.2); }
  .kind-memory { background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.2); }
  .kind-policies { background: rgba(220,38,38,0.15); color: #dc2626; border: 1px solid rgba(220,38,38,0.2); }
  .kind-evals { background: rgba(14,165,233,0.15); color: #0ea5e9; border: 1px solid rgba(14,165,233,0.2); }
  .kind-prompts { background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.2); }
  .kind-unknown { background: rgba(107,114,128,0.1); color: #6b7280; border: 1px solid rgba(107,114,128,0.15); }

  /* Action badges */
  .action-badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .action-generated { background: rgba(16,185,129,0.2); color: #10b981; }
  .action-improved { background: rgba(59,130,246,0.2); color: #3b82f6; }
  .action-kept { background: rgba(107,114,128,0.2); color: #9ca3af; }

  /* Gap Analysis */
  .gap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .gap-card { background: #12121e; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; }
  .gap-card .gap-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .gap-card .gap-kind { font-size: 1rem; font-weight: 600; text-transform: capitalize; }
  .gap-card .gap-score { font-size: 1.2rem; font-weight: 700; }
  .gap-card .gap-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
  .gap-card .gap-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
  .gap-card .gap-status { font-size: 0.8rem; margin-bottom: 6px; }
  .gap-card .gap-diagnosis { font-size: 0.8rem; color: #64748b; }
  .gap-card .gap-recommendation { font-size: 0.8rem; color: #94a3b8; margin-top: 8px; font-style: italic; }
  .status-present { color: #10b981; }
  .status-weak { color: #f59e0b; }
  .status-missing { color: #ef4444; }

  /* KPI Chart */
  .kpi-section { margin-top: 32px; }
  .kpi-section h3 { margin-bottom: 16px; }
  .kpi-chart { background: #12121e; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; }
  .kpi-empty { color: #64748b; text-align: center; padding: 40px; }

  /* Content preview modal */
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100; justify-content: center; align-items: center; }
  .modal-overlay.active { display: flex; }
  .modal { background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; }
  .modal-header { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; }
  .modal-header h3 { font-size: 1rem; }
  .modal-close { background: none; border: none; color: #64748b; font-size: 1.5rem; cursor: pointer; }
  .modal-body { padding: 20px; overflow-y: auto; flex: 1; }
  .modal-body pre { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; color: #cbd5e1; white-space: pre-wrap; line-height: 1.6; }

  /* Guide panel */
  .guide-category { margin-bottom: 32px; }
  .guide-category-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .guide-icon { font-size: 1.5rem; margin-top: 2px; }
  .guide-category-header h3 { font-size: 1.1rem; margin-bottom: 4px; }
  .guide-category-desc { font-size: 0.85rem; color: #64748b; line-height: 1.5; }
  .guide-types { display: flex; flex-direction: column; gap: 12px; }
  .guide-type { background: #12121e; border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 16px 20px; transition: all 0.2s; }
  .guide-type:hover { border-color: rgba(255,255,255,0.1); }
  .guide-found { border-color: rgba(16,185,129,0.25); background: rgba(16,185,129,0.03); }
  .guide-type-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .guide-type-name { font-weight: 600; font-size: 0.95rem; font-family: 'SF Mono', 'Fira Code', monospace; }
  .guide-type-eco { font-size: 0.7rem; padding: 2px 8px; border-radius: 8px; background: rgba(167,139,250,0.1); color: #a78bfa; }
  .guide-detected { font-size: 0.65rem; padding: 2px 8px; border-radius: 8px; background: rgba(16,185,129,0.2); color: #10b981; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .guide-type-summary { font-size: 0.9rem; color: #cbd5e1; margin-bottom: 8px; }
  .guide-type-desc { font-size: 0.82rem; color: #64748b; line-height: 1.6; margin-bottom: 10px; }
  .guide-type-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .guide-type-examples code { font-size: 0.75rem; padding: 2px 6px; background: rgba(255,255,255,0.04); border-radius: 4px; color: #475569; margin-right: 4px; }

  @media (max-width: 900px) {
    .comparison { grid-template-columns: 1fr; }
    .arrow-col { display: none; }
  }
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <div>
      <h1>st<span>AI</span>pler</h1>
      <div class="subtitle">AI Context Optimizer</div>
    </div>
    <div class="header-right">
      <div class="score-ring">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#475569" stroke-width="5"
            stroke-dasharray="${2 * Math.PI * 34}" stroke-dashoffset="${2 * Math.PI * 34 * (1 - beforeScore / 100)}"
            stroke-linecap="round"/>
        </svg>
        <div class="value" style="color: #64748b;">${beforeScore}</div>
        <div class="label">Before</div>
      </div>
      ${hasOptimization ? `
      <div class="score-ring">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#a78bfa" stroke-width="5"
            stroke-dasharray="${2 * Math.PI * 34}" stroke-dashoffset="${2 * Math.PI * 34 * (1 - afterScore / 100)}"
            stroke-linecap="round"/>
        </svg>
        <div class="value" style="color: #a78bfa;">${afterScore}</div>
        <div class="label">After</div>
      </div>` : ''}
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="showPanel('transform')">Before → After</div>
    <div class="tab" onclick="showPanel('gaps')">Gap Analysis</div>
    <div class="tab" onclick="showPanel('guide')">File Types Guide</div>
    <div class="tab" onclick="showPanel('kpi')">KPI Tracking</div>
  </div>

  <!-- TRANSFORM PANEL -->
  <div class="panel active" id="panel-transform">
    <div class="comparison">
      <div class="side">
        <div class="side-header">
          <h3>Before</h3>
          <div class="side-score" style="color: #64748b;">${beforeScore}/100</div>
        </div>
        <div class="side-body">
          ${beforeFiles.length === 0 ? '<p style="color:#64748b; text-align:center; padding:40px;">No instruction files found</p>' :
            beforeFiles.map(f => `
              <div class="file-card" onclick="showContent('${escapeHtml(f.name)}', \`${escapeHtml(f.content).replace(/`/g, '\\`')}\`)">
                <div class="file-name">${escapeHtml(f.name)}</div>
                <div class="file-meta">
                  <span class="file-kind kind-${f.kind ?? 'unknown'}">${f.kind ?? '?'}</span>
                  <span class="file-size">${f.size} chars</span>
                  ${f.sourceType !== 'staipler-native' && f.sourceType !== 'generic-md' ? `<span class="file-source">${f.sourceLabel}</span>` : ''}
                </div>
              </div>`).join('')
          }
        </div>
      </div>

      <div class="arrow-col">
        <div class="arrow">→</div>
      </div>

      <div class="side">
        <div class="side-header">
          <h3>After</h3>
          <div class="side-score" style="color: #a78bfa;">${afterScore}/100</div>
        </div>
        <div class="side-body">
          ${!hasOptimization ? '<p style="color:#64748b; text-align:center; padding:40px;">Run <code>staipler optimize</code> to see results</p>' :
            afterAssets.map(a => `
              <div class="file-card" onclick="showContent('${a.kind}.md', \`${escapeHtml(a.content.slice(0, 500)).replace(/`/g, '\\`')}\`)">
                <div class="file-name">${a.kind}.md</div>
                <div class="file-meta">
                  <span class="file-kind kind-${a.kind}">${a.kind}</span>
                  <span class="action-badge action-${a.action}">${a.action}</span>
                  <span class="file-size">${a.content.length} chars</span>
                </div>
              </div>`).join('')
          }
        </div>
      </div>
    </div>
  </div>

  <!-- GAP ANALYSIS PANEL -->
  <div class="panel" id="panel-gaps">
    <div class="gap-grid">
      ${layers.map(l => {
        const color = l.status === 'present' ? '#10b981' : l.status === 'weak' ? '#f59e0b' : '#ef4444';
        const optimizedAsset = afterAssets.find(a => a.kind === l.kind);
        const afterQuality = optimizedAsset ? (optimizedAsset.action === 'kept' ? l.qualityScore : 85) : l.qualityScore;
        return `
        <div class="gap-card">
          <div class="gap-header">
            <span class="gap-kind">${l.kind}</span>
            <span class="gap-score" style="color:${color}">${l.qualityScore}<span style="color:#475569;font-size:0.8rem">${hasOptimization ? ` → ${afterQuality}` : ''}/100</span></span>
          </div>
          <div class="gap-bar">
            <div class="gap-fill" style="width:${l.qualityScore}%;background:${color}"></div>
          </div>
          <div class="gap-status status-${l.status}">${l.status.toUpperCase()} ${l.importance === 'critical' ? '(critical)' : l.importance === 'optional' ? '(optional)' : ''}</div>
          <div class="gap-diagnosis">${escapeHtml(l.diagnosis)}</div>
          <div class="gap-recommendation">${escapeHtml(l.recommendation)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- FILE TYPES GUIDE PANEL -->
  <div class="panel" id="panel-guide">
    <div style="max-width:900px;margin:0 auto;">
      <p style="color:#94a3b8;margin-bottom:24px;line-height:1.7;">
        AI coding tools use markdown files to understand your project. stAIpler organizes these into three classes:
        <strong style="color:#a78bfa;">native assets</strong> it compiles directly,
        <strong style="color:#3b82f6;">imported files</strong> it normalizes from other ecosystems, and
        <strong style="color:#64748b;">supporting docs</strong> it can optionally pull in for context.
      </p>
      ${(['native', 'imported', 'supporting'] as FileClass[]).map(cls => {
        const classInfo = CLASS_INFO[cls];
        const classTypes = getFileTypesByClass(cls);
        const classColor = cls === 'native' ? '#a78bfa' : cls === 'imported' ? '#3b82f6' : '#64748b';

        // Group by category within this class
        const categories = [...new Set(classTypes.map(ft => ft.category))];

        return `
        <div class="guide-class" style="margin-bottom:40px;">
          <div style="border-left:3px solid ${classColor};padding-left:16px;margin-bottom:20px;">
            <h2 style="font-size:1.15rem;color:${classColor};margin-bottom:4px;">${classInfo.name}</h2>
            <p style="font-size:0.85rem;color:#64748b;line-height:1.5;">${classInfo.description}</p>
          </div>
          ${categories.map(cat => {
            const catInfo = CATEGORY_INFO[cat];
            const types = classTypes.filter(ft => ft.category === cat);

            return `
            <div class="guide-category">
              <div class="guide-category-header">
                <span class="guide-icon">${catInfo.icon}</span>
                <div>
                  <h3>${catInfo.name}</h3>
                  <p class="guide-category-desc">${catInfo.description}</p>
                </div>
              </div>
              <div class="guide-types">
                ${types.map(ft => {
                  const isFound = analysis.scan.files.some(f => f.sourceType === ft.id);
                  const mappingHtml = ft.adapterMapping
                    ? `<div style="margin-top:8px;font-size:0.78rem;color:#475569;">
                        <strong style="color:#64748b;">Adapter mapping:</strong>
                        ${Object.entries(ft.adapterMapping).map(([from, to]) =>
                          `<span style="margin-left:8px;">${from} &rarr; <span class="file-kind kind-${to}" style="font-size:0.7rem;">${to}</span></span>`
                        ).join('')}
                       </div>`
                    : '';
                  return `
                  <div class="guide-type ${isFound ? 'guide-found' : ''}">
                    <div class="guide-type-header">
                      <span class="guide-type-name">${escapeHtml(ft.name)}</span>
                      <span class="guide-type-eco">${ft.ecosystem}</span>
                      ${isFound ? '<span class="guide-detected">DETECTED</span>' : ''}
                    </div>
                    <div class="guide-type-summary">${escapeHtml(ft.summary)}</div>
                    <div class="guide-type-desc">${escapeHtml(ft.description)}</div>
                    <div class="guide-type-meta">
                      ${ft.defaultKind ? `<span class="file-kind kind-${ft.defaultKind}">&rarr; ${ft.defaultKind}</span>` : '<span style="color:#475569;font-size:0.75rem;">&rarr; auto-detected from content</span>'}
                      <span class="guide-type-examples">${ft.examples.map(e => `<code>${e}</code>`).join(' ')}</span>
                    </div>
                    ${mappingHtml}
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- KPI PANEL -->
  <div class="panel" id="panel-kpi">
    ${kpiData.length === 0 ? '<div class="kpi-empty">No KPI data yet. Run <code>staipler optimize</code> to start tracking.</div>' : `
    <div class="kpi-chart">
      <canvas id="kpi-canvas" width="800" height="300"></canvas>
    </div>
    <script>
      (function() {
        const data = ${JSON.stringify(kpiData)};
        const canvas = document.getElementById('kpi-canvas');
        if (!canvas || data.length === 0) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const pad = { top: 30, right: 30, bottom: 50, left: 50 };
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i <= 5; i++) {
          const y = pad.top + (plotH * i / 5);
          ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
          ctx.fillStyle = '#475569'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
          ctx.fillText(String(100 - i * 20), pad.left - 10, y + 4);
        }

        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        data.forEach((d, i) => {
          const x = pad.left + (plotW * i / Math.max(1, data.length - 1));
          const y = pad.top + plotH * (1 - d.score / 100);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dots + labels
        data.forEach((d, i) => {
          const x = pad.left + (plotW * i / Math.max(1, data.length - 1));
          const y = pad.top + plotH * (1 - d.score / 100);
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = d.action === 'optimize' ? '#a78bfa' : d.action === 'eval' ? '#10b981' : '#475569';
          ctx.fill();
          ctx.fillStyle = '#64748b'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
          ctx.fillText(d.date, x, h - pad.bottom + 18);
          ctx.fillText(d.action, x, h - pad.bottom + 32);
        });
      })();
    </script>`}
  </div>
</div>

<!-- Content Preview Modal -->
<div class="modal-overlay" id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <h3 id="modal-title"></h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <pre id="modal-content"></pre>
    </div>
  </div>
</div>

<script>
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  event.target.classList.add('active');
}
function showContent(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-content').textContent = content;
  document.getElementById('modal').classList.add('active');
}
function closeModal() {
  document.getElementById('modal').classList.remove('active');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
</script>
</body>
</html>`;
}
