import type { EvalRunResult, ScenarioRunResult } from './runner.js';
import { SCORING_DIMENSIONS } from './judge.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function renderMarkdownLite(str: string): string {
  // Basic markdown: **bold**, headers, lists, code blocks
  let html = escapeHtml(str);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^## (.*?)(<br>)/gm, '<h4>$1</h4>');
  html = html.replace(/^- (.*?)(<br>|$)/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.*?)(<br>|$)/gm, '<li>$2</li>');
  return html;
}

function scenarioCard(result: ScenarioRunResult, index: number): string {
  const { scenario, controlResponse, staiplerResponse, judge } = result;
  const dims = SCORING_DIMENSIONS;
  const controlScores = dims.map(d => judge.control.dimensions[d]);
  const staiplerScores = dims.map(d => judge.staipler.dimensions[d]);

  const winnerBadge = judge.winner === 'staipler'
    ? '<span class="badge badge-staipler">stAIpler wins</span>'
    : judge.winner === 'control'
    ? '<span class="badge badge-control">Control wins</span>'
    : '<span class="badge badge-tie">Tie</span>';

  return `
    <div class="scenario-card" id="scenario-${index}">
      <div class="scenario-header">
        <div>
          <h3>${scenario.name}</h3>
          <p class="scenario-desc">${scenario.description}</p>
          <div class="target-layers">${scenario.targetLayers.map(l => `<span class="layer-tag">${l}</span>`).join('')}</div>
        </div>
        <div class="scenario-scores">
          ${winnerBadge}
          <div class="score-pair">
            <span class="score-label">Control</span>
            <span class="score-value ${judge.control.overall < judge.staipler.overall ? 'score-lower' : ''}">${judge.control.overall.toFixed(2)}</span>
          </div>
          <div class="score-pair">
            <span class="score-label">stAIpler</span>
            <span class="score-value ${judge.staipler.overall > judge.control.overall ? 'score-higher' : ''}">${judge.staipler.overall.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="user-message">
        <div class="msg-label">Customer Message</div>
        <div class="msg-content">${escapeHtml(scenario.userMessage)}</div>
      </div>

      <div class="radar-container">
        <canvas id="radar-${index}" width="400" height="300"></canvas>
      </div>

      <div class="responses-grid">
        <div class="response-col response-control">
          <div class="response-header">
            <h4>Control <span class="overall-score">${judge.control.overall.toFixed(2)}</span></h4>
            <p class="response-reasoning">${escapeHtml(judge.control.reasoning)}</p>
          </div>
          <div class="response-body">${renderMarkdownLite(controlResponse)}</div>
        </div>
        <div class="response-col response-staipler">
          <div class="response-header">
            <h4>stAIpler <span class="overall-score">${judge.staipler.overall.toFixed(2)}</span></h4>
            <p class="response-reasoning">${escapeHtml(judge.staipler.reasoning)}</p>
          </div>
          <div class="response-body">${renderMarkdownLite(staiplerResponse)}</div>
        </div>
      </div>

      <div class="winner-reasoning">
        <strong>Judge verdict:</strong> ${escapeHtml(judge.winnerReasoning)}
      </div>

      <script>
        createRadar('radar-${index}',
          ${JSON.stringify([...dims])},
          ${JSON.stringify(controlScores)},
          ${JSON.stringify(staiplerScores)}
        );
      </script>
    </div>`;
}

export function generateReport(evalResult: EvalRunResult): string {
  const { config, scenarios, aggregate } = evalResult;
  const dims = [...SCORING_DIMENSIONS];
  const controlAggScores = dims.map(d => aggregate.controlAvg[d]);
  const staiplerAggScores = dims.map(d => aggregate.staiplerAvg[d]);

  const improvementColor = aggregate.improvement > 0 ? '#10b981' : aggregate.improvement < 0 ? '#ef4444' : '#6b7280';
  const improvementSign = aggregate.improvement > 0 ? '+' : '';

  const scenarioNav = scenarios.map((s, i) => {
    const icon = s.judge.winner === 'staipler' ? 'check' : s.judge.winner === 'control' ? 'x' : 'minus';
    const cls = s.judge.winner === 'staipler' ? 'nav-win' : s.judge.winner === 'control' ? 'nav-loss' : 'nav-tie';
    return `<a href="#scenario-${i}" class="nav-item ${cls}">${s.scenario.name}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>stAIpler Eval Report - ${config.stackName}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 68 72'%3E%3Cdefs%3E%3ClinearGradient id='mg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='50%25' stop-color='%237c3aed'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M8 14 L8 52 Q8 68 22 68 L46 68 Q60 68 60 52 L60 14' fill='none' stroke='url(%23mg)' stroke-width='6' stroke-linecap='round' opacity='0.35'/%3E%3Ctext x='34' y='56' font-family='Inter,Helvetica Neue,Arial,sans-serif' font-size='40' font-weight='800' fill='url(%23mg)' text-anchor='middle' letter-spacing='1'%3EAI%3C/text%3E%3C/svg%3E">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0f0f17;
    color: #e2e8f0;
    line-height: 1.6;
  }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }

  /* Header */
  .report-header {
    text-align: center;
    padding: 48px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 32px;
  }
  .report-header h1 { font-size: 2.2rem; font-weight: 700; margin-bottom: 8px; }
  .report-header h1 span { color: #a78bfa; }
  .report-header .meta { color: #64748b; font-size: 0.9rem; }

  /* Summary cards */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
  }
  .summary-card {
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }
  .summary-card .label { font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .summary-card .value { font-size: 2.4rem; font-weight: 700; }
  .summary-card .sub { font-size: 0.85rem; color: #64748b; margin-top: 4px; }

  /* Aggregate radar */
  .aggregate-section {
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 40px;
    text-align: center;
  }
  .aggregate-section h2 { margin-bottom: 20px; font-size: 1.3rem; }

  /* Dimension bar chart */
  .dim-bars { max-width: 700px; margin: 24px auto 0; }
  .dim-row { display: flex; align-items: center; margin-bottom: 12px; gap: 12px; }
  .dim-label { width: 120px; text-align: right; font-size: 0.85rem; color: #94a3b8; text-transform: capitalize; }
  .dim-bar-container { flex: 1; display: flex; gap: 4px; align-items: center; }
  .dim-bar { height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 0.75rem; font-weight: 600; min-width: 30px; transition: width 0.5s ease; }
  .dim-bar-control { background: #334155; color: #94a3b8; }
  .dim-bar-staipler { background: linear-gradient(90deg, #4f46e5, #7c3aed); color: #fff; }

  /* Scenario nav */
  .scenario-nav {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-bottom: 32px; padding: 16px;
    background: #1a1a2e; border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .nav-item {
    padding: 8px 16px; border-radius: 8px; font-size: 0.85rem;
    text-decoration: none; color: #94a3b8;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    transition: all 0.2s;
  }
  .nav-item:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
  .nav-win { border-color: rgba(16, 185, 129, 0.3); }
  .nav-loss { border-color: rgba(239, 68, 68, 0.3); }
  .nav-tie { border-color: rgba(107, 114, 128, 0.3); }

  /* Scenario cards */
  .scenario-card {
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 32px;
  }
  .scenario-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 16px; }
  .scenario-header h3 { font-size: 1.3rem; margin-bottom: 4px; }
  .scenario-desc { color: #64748b; font-size: 0.9rem; }
  .target-layers { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .layer-tag { font-size: 0.75rem; padding: 3px 10px; border-radius: 12px; background: rgba(167,139,250,0.1); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }

  .scenario-scores { display: flex; align-items: center; gap: 16px; }
  .score-pair { display: flex; flex-direction: column; align-items: center; }
  .score-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
  .score-value { font-size: 1.5rem; font-weight: 700; }
  .score-higher { color: #10b981; }
  .score-lower { color: #ef4444; }

  .badge { padding: 4px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
  .badge-staipler { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
  .badge-control { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
  .badge-tie { background: rgba(107, 114, 128, 0.15); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.3); }

  .user-message { background: #12121e; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 3px solid #64748b; }
  .msg-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .msg-content { font-style: italic; color: #cbd5e1; }

  .radar-container { display: flex; justify-content: center; margin: 20px 0; }

  .responses-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px; }
  @media (max-width: 900px) { .responses-grid { grid-template-columns: 1fr; } }

  .response-col { background: #12121e; border-radius: 8px; padding: 20px; border: 1px solid rgba(255,255,255,0.04); }
  .response-control { border-top: 3px solid #334155; }
  .response-staipler { border-top: 3px solid #7c3aed; }
  .response-header h4 { font-size: 1.05rem; margin-bottom: 8px; }
  .overall-score { font-size: 0.85rem; font-weight: 400; color: #64748b; margin-left: 8px; }
  .response-reasoning { font-size: 0.85rem; color: #64748b; margin-bottom: 12px; font-style: italic; }
  .response-body { font-size: 0.9rem; color: #cbd5e1; line-height: 1.7; }
  .response-body h4 { color: #a78bfa; font-size: 0.95rem; margin: 12px 0 6px; }
  .response-body li { margin-left: 20px; margin-bottom: 4px; }
  .response-body strong { color: #e2e8f0; }

  .winner-reasoning {
    background: rgba(167, 139, 250, 0.06);
    border: 1px solid rgba(167, 139, 250, 0.15);
    border-radius: 8px;
    padding: 14px 18px;
    font-size: 0.9rem;
    color: #cbd5e1;
  }

  /* Legend */
  .legend { display: flex; gap: 20px; justify-content: center; margin: 16px 0; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #94a3b8; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
  .legend-control { background: #334155; }
  .legend-staipler { background: #7c3aed; }
</style>
</head>
<body>
<div class="container">

  <div class="report-header">
    <h1>st<span>AI</span>pler Eval Report</h1>
    <p class="meta">Stack: <strong>${config.stackName}</strong> &middot; Model: <strong>${config.model}</strong> &middot; ${config.runAt.split('T')[0]} &middot; ${scenarios.length} scenarios</p>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">stAIpler Score</div>
      <div class="value" style="color: #a78bfa;">${aggregate.staiplerOverall.toFixed(2)}</div>
      <div class="sub">avg across all scenarios</div>
    </div>
    <div class="summary-card">
      <div class="label">Control Score</div>
      <div class="value" style="color: #64748b;">${aggregate.controlOverall.toFixed(2)}</div>
      <div class="sub">no instruction layers</div>
    </div>
    <div class="summary-card">
      <div class="label">Improvement</div>
      <div class="value" style="color: ${improvementColor};">${improvementSign}${aggregate.improvement}%</div>
      <div class="sub">stAIpler vs control</div>
    </div>
    <div class="summary-card">
      <div class="label">Win Rate</div>
      <div class="value" style="color: #10b981;">${aggregate.wins.staipler}/${scenarios.length}</div>
      <div class="sub">${aggregate.wins.control} control wins &middot; ${aggregate.wins.tie} ties</div>
    </div>
  </div>

  <div class="aggregate-section">
    <h2>Dimension Comparison (Averages)</h2>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot legend-control"></div> Control</div>
      <div class="legend-item"><div class="legend-dot legend-staipler"></div> stAIpler</div>
    </div>
    <canvas id="radar-aggregate" width="500" height="350" style="margin: 0 auto; display: block;"></canvas>
    <div class="dim-bars">
      ${dims.map(d => {
        const cv = aggregate.controlAvg[d];
        const sv = aggregate.staiplerAvg[d];
        return `<div class="dim-row">
          <div class="dim-label">${d}</div>
          <div class="dim-bar-container">
            <div class="dim-bar dim-bar-control" style="width: ${cv / 5 * 100}%">${cv.toFixed(1)}</div>
            <div class="dim-bar dim-bar-staipler" style="width: ${sv / 5 * 100}%">${sv.toFixed(1)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="scenario-nav">
    ${scenarioNav}
  </div>

  ${scenarios.map((s, i) => scenarioCard(s, i)).join('\n')}

</div>

<script>
function createRadar(canvasId, labels, dataA, dataB) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.38;
  const n = labels.length;

  ctx.clearRect(0, 0, w, h);

  // Draw grid
  for (let ring = 1; ring <= 5; ring++) {
    const rr = (ring / 5) * r;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const x = cx + rr * Math.cos(angle);
      const y = cy + rr * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw axes + labels
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    const lx = cx + (r + 20) * Math.cos(angle);
    const ly = cy + (r + 20) * Math.sin(angle);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  }

  // Draw data polygons
  function drawPoly(data, color, fill) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = (Math.PI * 2 * idx / n) - Math.PI / 2;
      const val = (data[idx] / 5) * r;
      const x = cx + val * Math.cos(angle);
      const y = cy + val * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const val = (data[i] / 5) * r;
      const x = cx + val * Math.cos(angle);
      const y = cy + val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  drawPoly(dataA, '#475569', 'rgba(71, 85, 105, 0.15)');
  drawPoly(dataB, '#7c3aed', 'rgba(124, 58, 237, 0.15)');
}

// Aggregate radar
createRadar('radar-aggregate',
  ${JSON.stringify(dims)},
  ${JSON.stringify(controlAggScores)},
  ${JSON.stringify(staiplerAggScores)}
);
</script>
</body>
</html>`;
}
