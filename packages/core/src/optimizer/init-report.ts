import type { AnalysisResult } from './analyzer.js';
import type { ScanResult } from './scanner.js';
import { LAYER_TYPES } from '../schema.js';

const LAYER_HINTS: Record<string, string> = {
  constraints: 'Hard limits and non-negotiables',
  context: 'Domain knowledge and business rules',
  evals: 'Test cases and acceptance criteria',
  examples: 'Few-shot examples and templates',
  goals: 'Success criteria and priorities',
  identity: 'Role, persona, and character',
  memory: 'Runtime session context',
  policies: 'Compliance, legal, brand rules',
  prompts: 'Reusable prompt fragments',
  skills: 'Workflows and decision trees',
  style: 'Tone, formatting, response shape',
  tools: 'Available tools and usage rules',
};

const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444', context: '#3b82f6', evals: '#6b7280',
  examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
  memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
  skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#10b981';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

export interface InitReportData {
  projectName: string;
  analysis: AnalysisResult;
  scanResult: ScanResult;
  injectTarget: string | null;
}

interface MapNode {
  id: string;
  layer: string;
  layerName: string;
  title: string;
  content: string;
  sourcePath: string;
  confidence: number;
  size: number;
  x: number;
  y: number;
  color: string;
  present: boolean;
}

interface MapCluster {
  layer: string;
  layerName: string;
  x: number;
  y: number;
  color: string;
  nodeCount: number;
  status: 'present' | 'missing';
  hint: string;
}

/**
 * Generate a self-contained interactive HTML report for `staipler init`.
 * Features a polished, clickable memory map and a registration CTA.
 */
export function generateInitReport(data: InitReportData): string {
  const { projectName, analysis, scanResult, injectTarget } = data;
  const score = analysis.readinessScore;
  const grade = analysis.grade;
  const present = analysis.layers.filter(l => l.status === 'present').length;
  const weak = analysis.layers.filter(l => l.status === 'weak').length;
  const missing = analysis.layers.filter(l => l.status === 'missing').length;
  const gc = gradeColor(grade);

  // ---- Layout: All 12 layers positioned in a radial grid ----
  const cx = 500, cy = 400;
  const clusterRadius = 280;
  const nodes: MapNode[] = [];
  const clusters: MapCluster[] = [];

  LAYER_TYPES.forEach((layer, i) => {
    const layerData = analysis.layers.find(l => l.kind === layer);
    const angle = (i / LAYER_TYPES.length) * 2 * Math.PI - Math.PI / 2;
    const lx = cx + Math.cos(angle) * clusterRadius;
    const ly = cy + Math.sin(angle) * clusterRadius;
    const isPresent = (layerData?.files.length ?? 0) > 0;

    clusters.push({
      layer,
      layerName: layer.charAt(0).toUpperCase() + layer.slice(1),
      x: lx,
      y: ly,
      color: LAYER_COLORS[layer] ?? '#6b7280',
      nodeCount: layerData?.files.length ?? 0,
      status: isPresent ? 'present' : 'missing',
      hint: LAYER_HINTS[layer] ?? '',
    });

    if (isPresent && layerData) {
      // Dedupe by content fingerprint — many projects have the same file
      // in library/core/, library/optimized/, library/support/ with
      // identical content. Show one node per unique body, preferring
      // optimized/ > core/ > support/ > other paths.
      const pathScore = (p: string): number => {
        if (p.includes('optimized/')) return 3;
        if (p.includes('core/')) return 2;
        if (p.includes('support/')) return 1;
        return 0;
      };
      const fingerprint = (content: string) =>
        `${content.length}:${content.slice(0, 500).replace(/\s+/g, ' ').trim()}`;

      const byFingerprint = new Map<string, typeof layerData.files[0]>();
      for (const file of layerData.files) {
        const fp = fingerprint(file.content ?? '');
        const existing = byFingerprint.get(fp);
        if (!existing || pathScore(file.relativePath) > pathScore(existing.relativePath)) {
          byFingerprint.set(fp, file);
        }
      }
      const uniqueFiles = Array.from(byFingerprint.values());

      // Update cluster node count to reflect unique files
      clusters[clusters.length - 1].nodeCount = uniqueFiles.length;

      uniqueFiles.forEach((file, j) => {
        const spread = Math.min(36, 18 + uniqueFiles.length * 4);
        const nodeAngle = uniqueFiles.length > 1
          ? (j / uniqueFiles.length) * 2 * Math.PI
          : 0;
        const nx = uniqueFiles.length > 1
          ? lx + Math.cos(nodeAngle) * spread
          : lx;
        const ny = uniqueFiles.length > 1
          ? ly + Math.sin(nodeAngle) * spread
          : ly;

        nodes.push({
          id: `${layer}-${j}`,
          layer,
          layerName: layer.charAt(0).toUpperCase() + layer.slice(1),
          title: file.name,
          content: (file.content ?? '').slice(0, 2000),
          sourcePath: file.relativePath,
          confidence: file.inferredConfidence,
          size: file.contentLength,
          x: nx,
          y: ny,
          color: LAYER_COLORS[layer] ?? '#6b7280',
          present: true,
        });
      });
    }
  });

  // Links: same-layer reinforcement + cross-layer dependencies
  const links: { from: string; to: string; opacity: number }[] = [];
  const byLayer = new Map<string, MapNode[]>();
  for (const node of nodes) {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
    byLayer.get(node.layer)!.push(node);
  }
  for (const [, layerNodes] of byLayer) {
    for (let i = 0; i < layerNodes.length; i++) {
      for (let j = i + 1; j < layerNodes.length; j++) {
        links.push({ from: layerNodes[i].id, to: layerNodes[j].id, opacity: 0.3 });
      }
    }
  }

  // Cross-layer: constraints depend on context
  const constraintNodes = nodes.filter(n => n.layer === 'constraints');
  const contextNodes = nodes.filter(n => n.layer === 'context');
  for (const c of constraintNodes) {
    for (const ctx of contextNodes) {
      links.push({ from: c.id, to: ctx.id, opacity: 0.1 });
    }
  }
  // Style extends identity
  const styleNodes = nodes.filter(n => n.layer === 'style');
  const identityNodes = nodes.filter(n => n.layer === 'identity');
  for (const s of styleNodes) {
    for (const id of identityNodes) {
      links.push({ from: s.id, to: id.id, opacity: 0.1 });
    }
  }

  // Node data for JavaScript
  const nodeData = nodes.map(n => ({
    id: n.id,
    layer: n.layer,
    layerName: n.layerName,
    title: n.title,
    content: n.content,
    sourcePath: n.sourcePath,
    confidence: n.confidence,
    size: n.size,
    color: n.color,
    hint: LAYER_HINTS[n.layer] ?? '',
  }));

  const clusterData = clusters.map(c => ({
    layer: c.layer,
    layerName: c.layerName,
    color: c.color,
    nodeCount: c.nodeCount,
    status: c.status,
    hint: c.hint,
  }));

  // ---- HTML ----
  const filesTotal = scanResult.files.length;
  const kbTotal = scanResult.knowledgeBase.length;
  const kbSize = scanResult.knowledgeBase.reduce((s, f) => s + f.size, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(projectName)} — Empowerment Report</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 68 72'%3E%3Cdefs%3E%3ClinearGradient id='mg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='50%25' stop-color='%237c3aed'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M8 14 L8 52 Q8 68 22 68 L46 68 Q60 68 60 52 L60 14' fill='none' stroke='url(%23mg)' stroke-width='6' stroke-linecap='round' opacity='0.35'/%3E%3Ctext x='34' y='56' font-family='Inter,Helvetica Neue,Arial,sans-serif' font-size='40' font-weight='800' fill='url(%23mg)' text-anchor='middle' letter-spacing='1'%3EAI%3C/text%3E%3C/svg%3E">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #06060e;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    min-height: 100vh;
  }
  .container { max-width: 1200px; margin: 0 auto; padding: 40px 24px 80px; }

  /* ---- Header ---- */
  .header { display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-bottom: 48px; padding-bottom: 32px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .logo-row { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
  .logo-svg { height: 52px; width: auto; display: block; }
  .logo-badge { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: #a78bfa; font-weight: 700; padding: 6px 13px; border-radius: 6px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); }
  .subtitle { font-size: 0.85rem; color: #64748b; }
  .header-cta { flex-shrink: 0; }
  .header-cta a { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.2); border-radius: 10px; color: #c4b5fd; font-size: 0.85rem; font-weight: 600; text-decoration: none; transition: all 0.2s; }
  .header-cta a:hover { background: rgba(167,139,250,0.15); border-color: rgba(167,139,250,0.4); transform: translateY(-1px); }

  /* ---- Score Hero ---- */
  .score-section { display: flex; align-items: center; gap: 48px; margin-bottom: 56px; }
  .ring-wrapper { position: relative; width: 200px; height: 200px; flex-shrink: 0; }
  .ring-bg { stroke: rgba(255,255,255,0.04); }
  .ring-fill { stroke: ${gc}; transition: all 0.8s ease-out; filter: drop-shadow(0 0 12px ${gc}80); }
  .ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .ring-score { font-size: 3.4rem; font-weight: 800; color: ${gc}; line-height: 1; }
  .ring-grade { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 8px; font-weight: 600; }
  .score-meta { flex: 1; }
  .score-meta h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; }
  .score-meta p { color: #94a3b8; font-size: 0.95rem; max-width: 580px; margin-bottom: 20px; }
  .score-stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat { padding: 14px 18px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; min-width: 90px; }
  .stat-num { font-size: 1.5rem; font-weight: 800; color: #e2e8f0; line-height: 1; }
  .stat-label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 6px; font-weight: 600; }

  /* ---- Section ---- */
  section { margin-bottom: 56px; }
  .section-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
  .section-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #a78bfa; font-weight: 700; }
  .section-desc { font-size: 0.85rem; color: #64748b; }
  .section-count { font-size: 0.75rem; color: #64748b; }

  /* ---- Memory Map ---- */
  .memory-map { position: relative; background: radial-gradient(ellipse at center, #0d0d1f 0%, #06060e 70%); border: 1px solid rgba(167,139,250,0.08); border-radius: 16px; overflow: hidden; }
  .memory-map svg { width: 100%; height: 800px; display: block; }
  .map-hint { position: absolute; top: 16px; left: 20px; font-size: 0.7rem; color: #475569; letter-spacing: 0.1em; text-transform: uppercase; pointer-events: none; }
  .map-legend { position: absolute; bottom: 16px; left: 20px; display: flex; gap: 16px; font-size: 0.7rem; color: #64748b; pointer-events: none; }
  .map-legend span { display: flex; align-items: center; gap: 6px; }
  .map-legend .dot { width: 8px; height: 8px; border-radius: 50%; }
  .map-legend .dot-present { background: #a78bfa; box-shadow: 0 0 6px #a78bfa80; }
  .map-legend .dot-missing { background: transparent; border: 1px dashed #64748b; }

  .map-node { cursor: pointer; transition: stroke-width 0.2s ease, stroke 0.2s ease; transform-box: fill-box; transform-origin: center; }
  .map-node:hover { stroke-width: 3; stroke: #fff; }
  .map-node-group { cursor: pointer; }

  /* ---- Hover tooltip ---- */
  .node-tooltip {
    position: fixed;
    pointer-events: none;
    background: #0a0a18;
    border: 1px solid rgba(167,139,250,0.25);
    border-radius: 10px;
    padding: 12px 14px;
    max-width: 320px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.08);
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.12s ease, transform 0.12s ease;
    z-index: 90;
    font-size: 0.8rem;
  }
  .node-tooltip.visible { opacity: 1; transform: translateY(0); }
  .node-tooltip-layer { display: inline-block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; margin-bottom: 8px; }
  .node-tooltip-title { font-size: 0.85rem; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; word-break: break-word; }
  .node-tooltip-path { font-family: 'SF Mono', Monaco, monospace; font-size: 0.65rem; color: #64748b; margin-bottom: 8px; word-break: break-all; }
  .node-tooltip-preview { font-family: 'SF Mono', Monaco, monospace; font-size: 0.7rem; color: #94a3b8; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow: hidden; position: relative; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
  .node-tooltip-preview::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 30px; background: linear-gradient(transparent, #0a0a18); pointer-events: none; }
  .node-tooltip-hint { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.65rem; color: #475569; display: flex; justify-content: space-between; }
  .node-tooltip-meta { color: #475569; }
  .map-cluster-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; pointer-events: none; paint-order: stroke; stroke: #06060e; stroke-width: 3px; stroke-linecap: round; stroke-linejoin: round; }
  .map-cluster-count { font-size: 11px; font-weight: 600; pointer-events: none; paint-order: stroke; stroke: #06060e; stroke-width: 3px; stroke-linecap: round; stroke-linejoin: round; }
  .map-link { fill: none; transition: all 0.3s ease; }
  .map-missing-circle { fill: none; stroke-dasharray: 4 3; transition: all 0.3s ease; }

  /* Central agent pulse */
  @keyframes agent-pulse-outer {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 0.85; transform: scale(1.08); }
  }
  @keyframes agent-pulse-inner {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  .agent-pulse-outer {
    transform-box: fill-box;
    transform-origin: center;
    animation: agent-pulse-outer 4s ease-in-out infinite;
  }
  .agent-pulse-inner {
    animation: agent-pulse-inner 2s ease-in-out infinite;
  }

  /* ---- Detail Panel ---- */
  .detail-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 420px;
    height: 100vh;
    background: #0a0a18;
    border-left: 1px solid rgba(255,255,255,0.08);
    box-shadow: -20px 0 60px rgba(0,0,0,0.5);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 100;
    overflow-y: auto;
  }
  .detail-panel.open { transform: translateX(0); }
  .detail-header { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); position: sticky; top: 0; background: #0a0a18; z-index: 10; }
  .detail-close { position: absolute; top: 20px; right: 20px; background: none; border: none; color: #64748b; font-size: 1.5rem; cursor: pointer; padding: 4px 8px; line-height: 1; }
  .detail-close:hover { color: #e2e8f0; }
  .detail-layer-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
  .detail-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; word-break: break-word; }
  .detail-path { font-family: 'SF Mono', Monaco, monospace; font-size: 0.75rem; color: #64748b; word-break: break-all; }
  .detail-body { padding: 24px; }
  .detail-meta { display: flex; gap: 16px; margin-bottom: 20px; }
  .detail-meta-item { flex: 1; padding: 10px 12px; background: rgba(255,255,255,0.02); border-radius: 8px; }
  .detail-meta-label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
  .detail-meta-value { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
  .detail-content { font-family: 'SF Mono', Monaco, monospace; font-size: 0.75rem; line-height: 1.7; color: #94a3b8; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow-y: auto; }
  .detail-empty { text-align: center; padding: 40px 20px; color: #475569; font-size: 0.85rem; }
  .detail-empty h3 { color: #94a3b8; margin-bottom: 8px; }
  .detail-empty-cta { display: inline-block; margin-top: 16px; padding: 10px 16px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); border-radius: 8px; color: #c4b5fd; font-size: 0.8rem; font-family: 'SF Mono', Monaco, monospace; }

  /* ---- Layer coverage (compact cards) ---- */
  .layer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .layer-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; transition: all 0.2s; cursor: pointer; }
  .layer-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }
  .layer-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .layer-card.present .layer-dot { box-shadow: 0 0 6px currentColor; }
  .layer-card.missing .layer-dot { background: transparent; border: 1px dashed currentColor; box-shadow: none; }
  .layer-card-name { font-weight: 600; font-size: 0.9rem; flex: 1; }
  .layer-card-hint { color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px; font-weight: 400; }
  .layer-card-count { font-size: 0.7rem; color: #475569; font-family: 'SF Mono', Monaco, monospace; }

  /* ---- Suggestions ---- */
  .suggestion-grid { display: grid; gap: 8px; }
  .suggestion { display: grid; grid-template-columns: 90px 180px 1fr; gap: 16px; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; transition: all 0.2s; }
  .suggestion:hover { border-color: rgba(167,139,250,0.15); }
  .suggestion-layer { font-size: 0.65rem; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
  .suggestion-name { font-weight: 600; font-size: 0.9rem; }
  .suggestion-desc { color: #64748b; font-size: 0.8rem; margin-bottom: 4px; }
  .suggestion-link { color: #06b6d4; font-size: 0.7rem; text-decoration: none; word-break: break-all; }
  .suggestion-link:hover { color: #67e8f9; }

  /* ---- Knowledge base ---- */
  .kb-grid { display: grid; gap: 6px; }
  .kb-item { display: grid; grid-template-columns: 1fr 180px 70px; gap: 16px; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; font-size: 0.85rem; }
  .kb-path { font-family: 'SF Mono', Monaco, monospace; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kb-desc { color: #64748b; font-size: 0.78rem; }
  .kb-size { color: #64748b; font-size: 0.75rem; text-align: right; font-family: 'SF Mono', Monaco, monospace; }

  /* ---- Next steps ---- */
  .next-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
  .next-step { padding: 18px 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; transition: all 0.2s; }
  .next-step:hover { border-color: rgba(167,139,250,0.15); }
  .next-step-cmd { font-family: 'SF Mono', Monaco, monospace; font-size: 0.85rem; color: #a78bfa; font-weight: 700; margin-bottom: 8px; }
  .next-step-desc { font-size: 0.78rem; color: #94a3b8; line-height: 1.6; }

  /* ---- CTA Section ---- */
  .cta-section { margin-top: 64px; padding: 48px; background: linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(124,58,237,0.05) 50%, rgba(79,70,229,0.08) 100%); border: 1px solid rgba(167,139,250,0.2); border-radius: 20px; position: relative; overflow: hidden; }
  .cta-section::before { content: ''; position: absolute; top: -50%; left: -20%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%); pointer-events: none; }
  .cta-section::after { content: ''; position: absolute; bottom: -50%; right: -10%; width: 300px; height: 300px; background: radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%); pointer-events: none; }
  .cta-content { position: relative; z-index: 1; }
  .cta-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.25); border-radius: 20px; font-size: 0.65rem; color: #c4b5fd; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin-bottom: 16px; }
  .cta-section h2 { font-size: 2rem; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.02em; line-height: 1.2; max-width: 700px; }
  .cta-section .cta-gradient { background: linear-gradient(135deg, #a78bfa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .cta-section > .cta-content > p { font-size: 1rem; color: #94a3b8; max-width: 600px; margin-bottom: 32px; }
  .cta-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-bottom: 36px; }
  .cta-feature { display: flex; gap: 12px; }
  .cta-feature-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.1rem; }
  .cta-feature-text { flex: 1; }
  .cta-feature h4 { font-size: 0.9rem; font-weight: 700; margin-bottom: 4px; }
  .cta-feature p { font-size: 0.78rem; color: #94a3b8; line-height: 1.5; margin: 0; }
  .cta-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .cta-btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; border-radius: 10px; font-weight: 700; font-size: 0.95rem; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 20px rgba(124,58,237,0.3); }
  .cta-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(124,58,237,0.4); }
  .cta-btn-secondary { padding: 14px 24px; color: #94a3b8; font-size: 0.85rem; text-decoration: none; transition: color 0.2s; }
  .cta-btn-secondary:hover { color: #e2e8f0; }
  .cta-meta { font-size: 0.75rem; color: #64748b; margin-top: 16px; }

  /* ---- Footer ---- */
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.04); text-align: center; font-size: 0.75rem; color: #475569; }
  .footer a { color: #64748b; text-decoration: none; }
  .footer a:hover { color: #94a3b8; }

  /* ---- Backdrop for detail panel ---- */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 99; }
  .backdrop.open { opacity: 1; pointer-events: auto; }

  @media (max-width: 768px) {
    .score-section { flex-direction: column; text-align: center; gap: 24px; }
    .header { flex-direction: column; gap: 16px; }
    .detail-panel { width: 100%; }
    .suggestion { grid-template-columns: 1fr; gap: 8px; }
    .kb-item { grid-template-columns: 1fr; gap: 4px; }
  }
</style>
</head>
<body>
<div class="container">

<!-- Header -->
<header class="header">
  <div>
    <div class="logo-row">
      <svg class="logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 222 68">
        <defs>
          <linearGradient id="report-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#4f46e5"/>
            <stop offset="50%" style="stop-color:#7c3aed"/>
            <stop offset="100%" style="stop-color:#a855f7"/>
          </linearGradient>
        </defs>
        <text x="0" y="50" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="50" font-weight="700" fill="#e2e8f0" letter-spacing="-1">st</text>
        <path d="M52 12 L52 48 Q52 58 62 58 L94 58 Q104 58 104 48 L104 12" fill="none" stroke="url(#report-logo-grad)" stroke-width="4" stroke-linecap="round" opacity="0.35"/>
        <text x="78" y="48" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="38" font-weight="800" fill="url(#report-logo-grad)" text-anchor="middle" letter-spacing="1">AI</text>
        <text x="108" y="50" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="50" font-weight="700" fill="#e2e8f0" letter-spacing="-1">pler</text>
      </svg>
      <span class="logo-badge">Init Report</span>
    </div>
    <div class="subtitle">${escapeHtml(projectName)} · ${new Date().toLocaleString()}</div>
  </div>
  <div class="header-cta">
    <a href="https://staipler.com" target="_blank" rel="noopener noreferrer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      Open on staipler.com
    </a>
  </div>
</header>

<!-- Score -->
<section class="score-section">
  <div class="ring-wrapper">
    <svg viewBox="0 0 200 200" width="200" height="200">
      <circle cx="100" cy="100" r="88" fill="none" class="ring-bg" stroke-width="14"/>
      <circle cx="100" cy="100" r="88" fill="none" class="ring-fill" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(score / 100) * 2 * Math.PI * 88} ${2 * Math.PI * 88}" transform="rotate(-90 100 100)"/>
    </svg>
    <div class="ring-label">
      <div class="ring-score">${score}</div>
      <div class="ring-grade">Grade ${grade}</div>
    </div>
  </div>
  <div class="score-meta">
    <h2>Empowerment Score</h2>
    <p>How complete your AI agent's instruction stack is. ${present} of ${LAYER_TYPES.length} layers are present — ${missing > 0 ? `${missing} still missing.` : 'all covered.'} Click any node in the memory map below to inspect it.</p>
    <div class="score-stats">
      <div class="stat"><div class="stat-num" style="color: #10b981">${present}</div><div class="stat-label">Present</div></div>
      <div class="stat"><div class="stat-num" style="color: #f59e0b">${weak}</div><div class="stat-label">Weak</div></div>
      <div class="stat"><div class="stat-num" style="color: #ef4444">${missing}</div><div class="stat-label">Missing</div></div>
      <div class="stat"><div class="stat-num">${filesTotal}</div><div class="stat-label">Files</div></div>
      <div class="stat"><div class="stat-num">${kbTotal}</div><div class="stat-label">KB Files</div></div>
    </div>
  </div>
</section>

<!-- Memory Map -->
<section>
  <div class="section-header">
    <div>
      <div class="section-title">Memory Map</div>
      <div class="section-desc">Everything your agent knows — click any node to inspect</div>
    </div>
    <span class="section-count">${nodes.length} nodes · ${present}/${LAYER_TYPES.length} layers</span>
  </div>
  <div class="memory-map">
    <div class="map-hint">Interactive · Click a node</div>
    <svg viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="agent-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#7c3aed" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="agent-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a78bfa"/>
          <stop offset="50%" stop-color="#7c3aed"/>
          <stop offset="100%" stop-color="#4f46e5"/>
        </linearGradient>
        <filter id="agent-glow-filter" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ${LAYER_TYPES.map(layer => {
          const c = LAYER_COLORS[layer];
          return `
            <radialGradient id="grad-${layer}" cx="30%" cy="30%">
              <stop offset="0%" stop-color="${c}" stop-opacity="1"/>
              <stop offset="100%" stop-color="${c}" stop-opacity="0.6"/>
            </radialGradient>
            <filter id="glow-${layer}" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          `;
        }).join('')}
      </defs>

      <!-- Background web lines -->
      <circle cx="500" cy="400" r="280" fill="none" stroke="rgba(167,139,250,0.04)" stroke-width="1"/>
      <circle cx="500" cy="400" r="180" fill="none" stroke="rgba(167,139,250,0.03)" stroke-width="1"/>
      <circle cx="500" cy="400" r="80" fill="none" stroke="rgba(167,139,250,0.02)" stroke-width="1"/>

      <!-- Agent spoke lines — connect the AI agent to every present cluster -->
      ${clusters.filter(c => c.status === 'present').map(c => `
        <line x1="500" y1="400" x2="${c.x}" y2="${c.y}" stroke="#a78bfa" stroke-width="0.8" opacity="0.18" stroke-dasharray="2 4"/>
      `).join('')}

      <!-- Central AI Agent graphic -->
      <g class="agent-center">
        <!-- Outer pulsing glow -->
        <circle class="agent-pulse-outer" cx="500" cy="400" r="70" fill="url(#agent-glow)"/>
        <circle class="agent-pulse-inner" cx="500" cy="400" r="45" fill="url(#agent-glow)" opacity="0.6"/>

        <!-- Hexagonal frame -->
        <polygon
          points="500,356 538,378 538,422 500,444 462,422 462,378"
          fill="url(#agent-fill)"
          stroke="#a78bfa"
          stroke-width="1.5"
          opacity="0.95"
          filter="url(#agent-glow-filter)"
        />

        <!-- Inner dark core -->
        <circle cx="500" cy="400" r="22" fill="#06060e" stroke="#c4b5fd" stroke-width="1" opacity="0.9"/>

        <!-- Neural network dots inside -->
        <circle cx="493" cy="394" r="1.5" fill="#c4b5fd"/>
        <circle cx="507" cy="394" r="1.5" fill="#c4b5fd"/>
        <circle cx="500" cy="400" r="2" fill="#fff"/>
        <circle cx="493" cy="406" r="1.5" fill="#c4b5fd"/>
        <circle cx="507" cy="406" r="1.5" fill="#c4b5fd"/>
        <line x1="493" y1="394" x2="500" y2="400" stroke="#c4b5fd" stroke-width="0.5" opacity="0.6"/>
        <line x1="507" y1="394" x2="500" y2="400" stroke="#c4b5fd" stroke-width="0.5" opacity="0.6"/>
        <line x1="493" y1="406" x2="500" y2="400" stroke="#c4b5fd" stroke-width="0.5" opacity="0.6"/>
        <line x1="507" y1="406" x2="500" y2="400" stroke="#c4b5fd" stroke-width="0.5" opacity="0.6"/>

        <!-- AGENT label -->
        <text x="500" y="472" text-anchor="middle" fill="#a78bfa" font-size="9" font-weight="700" letter-spacing="3" opacity="0.8">AGENT</text>
      </g>

      <!-- Links between nodes -->
      ${links.map(link => {
        const from = nodes.find(n => n.id === link.from);
        const to = nodes.find(n => n.id === link.to);
        if (!from || !to) return '';
        // Curved connection via quadratic bezier
        const midX = (from.x + to.x) / 2 + (Math.random() - 0.5) * 20;
        const midY = (from.y + to.y) / 2 + (Math.random() - 0.5) * 20;
        return `<path class="map-link" d="M ${from.x} ${from.y} Q ${midX} ${midY}, ${to.x} ${to.y}" stroke="#a78bfa" stroke-width="0.8" opacity="${link.opacity}"/>`;
      }).join('')}

      <!-- Cluster labels — offset scales with node count so labels always sit above the topmost node -->
      ${clusters.map(cluster => {
        // Match the spread calculation used when positioning nodes
        const nodeSpread = cluster.nodeCount > 1 ? Math.min(36, 18 + cluster.nodeCount * 4) : 0;
        // Max node radius is 16, + 22px padding for font height + gap
        const labelOffset = Math.max(38, nodeSpread + 22);
        const countOffset = Math.max(48, nodeSpread + 32);
        const labelY = cluster.y - labelOffset;
        const countY = cluster.y + countOffset;
        const opacity = cluster.status === 'present' ? 0.9 : 0.4;
        return `
          <text class="map-cluster-label" x="${cluster.x}" y="${labelY}" text-anchor="middle" fill="${cluster.color}" opacity="${opacity}">${cluster.layerName}</text>
          ${cluster.status === 'present' && cluster.nodeCount > 0 ? `<text class="map-cluster-count" x="${cluster.x}" y="${countY}" text-anchor="middle" fill="${cluster.color}" opacity="0.5">${cluster.nodeCount}</text>` : ''}
        `;
      }).join('')}

      <!-- Missing layer circles -->
      ${clusters.filter(c => c.status === 'missing').map(c => `
        <circle class="map-missing-circle" cx="${c.x}" cy="${c.y}" r="22" stroke="${c.color}" stroke-width="1.5" opacity="0.35"/>
        <text class="map-cluster-count" x="${c.x}" y="${c.y + 4}" text-anchor="middle" fill="${c.color}" opacity="0.5" font-size="14">+</text>
      `).join('')}

      <!-- Present nodes -->
      ${nodes.map(node => {
        const baseSize = Math.max(9, Math.min(16, Math.sqrt(node.size / 50)));
        return `
          <g class="map-node-group" data-node-id="${node.id}">
            <circle cx="${node.x}" cy="${node.y}" r="${baseSize + 10}" fill="${node.color}" opacity="0.15"/>
            <circle class="map-node" cx="${node.x}" cy="${node.y}" r="${baseSize}" fill="url(#grad-${node.layer})" stroke="${node.color}" stroke-width="1.5" filter="url(#glow-${node.layer})" data-node-id="${node.id}">
              <title>${escapeHtml(node.title)}</title>
            </circle>
            <circle cx="${node.x - baseSize * 0.3}" cy="${node.y - baseSize * 0.3}" r="${baseSize * 0.4}" fill="url(#node-glow)" pointer-events="none"/>
          </g>
        `;
      }).join('')}
    </svg>
    <div class="map-legend">
      <span><span class="dot dot-present"></span>Present layer</span>
      <span><span class="dot dot-missing"></span>Missing layer</span>
    </div>
  </div>
</section>

<!-- Layer Coverage -->
<section>
  <div class="section-header">
    <div>
      <div class="section-title">Layer Coverage</div>
      <div class="section-desc">12 instruction categories that define your agent</div>
    </div>
    <span class="section-count">${present}/${LAYER_TYPES.length} present</span>
  </div>
  <div class="layer-grid">
    ${analysis.layers.map(layer => {
      const status = layer.status;
      const color = LAYER_COLORS[layer.kind] ?? '#6b7280';
      return `
        <div class="layer-card ${status}" style="color: ${color}" data-layer="${layer.kind}">
          <span class="layer-dot" style="background: ${status === 'present' ? color : 'transparent'}"></span>
          <div style="flex: 1">
            <div class="layer-card-name" style="color: #e2e8f0">${layer.kind}</div>
            <div class="layer-card-hint">${LAYER_HINTS[layer.kind] ?? ''}</div>
          </div>
          <span class="layer-card-count">${layer.files.length || '—'}</span>
        </div>
      `;
    }).join('')}
  </div>
</section>

${scanResult.suggestions.length > 0 ? `
<section>
  <div class="section-header">
    <div>
      <div class="section-title">Suggestions</div>
      <div class="section-desc">Based on what's in your project</div>
    </div>
    <span class="section-count">${scanResult.suggestions.length} ideas</span>
  </div>
  <div class="suggestion-grid">
    ${scanResult.suggestions.map(s => `
      <div class="suggestion">
        <span class="suggestion-layer">${s.layer}</span>
        <span class="suggestion-name">${escapeHtml(s.name)}</span>
        <div>
          <div class="suggestion-desc">${escapeHtml(s.description)}</div>
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${escapeHtml(s.url)}</a>
        </div>
      </div>
    `).join('')}
  </div>
</section>
` : ''}

${scanResult.knowledgeBase.length > 0 ? `
<section>
  <div class="section-header">
    <div>
      <div class="section-title">Knowledge Base</div>
      <div class="section-desc">Files your AI already sees at runtime</div>
    </div>
    <span class="section-count">${kbTotal} files (${formatSize(kbSize)})</span>
  </div>
  <div class="kb-grid">
    ${scanResult.knowledgeBase.map(f => `
      <div class="kb-item">
        <span class="kb-path">${escapeHtml(f.relativePath)}</span>
        <span class="kb-desc">${escapeHtml(f.description)}</span>
        <span class="kb-size">${formatSize(f.size)}</span>
      </div>
    `).join('')}
  </div>
</section>
` : ''}

<!-- Next Steps -->
<section>
  <div class="section-header">
    <div>
      <div class="section-title">Next Steps</div>
      <div class="section-desc">CLI commands to keep going</div>
    </div>
  </div>
  <div class="next-steps">
    <div class="next-step">
      <div class="next-step-cmd">staipler watch</div>
      <div class="next-step-desc">Live dashboard that updates your empowerment score as you edit files. Like jest --watch for your AI context.</div>
    </div>
    <div class="next-step">
      <div class="next-step-cmd">staipler optimize</div>
      <div class="next-step-desc">AI reads your project and generates the missing instruction layers. Each layer is a markdown file you can review.</div>
    </div>
    <div class="next-step">
      <div class="next-step-cmd">staipler ci --min-score 70</div>
      <div class="next-step-desc">Add to your CI/CD pipeline. Fails the build if your empowerment score drops below your threshold.</div>
    </div>
    <div class="next-step">
      <div class="next-step-cmd">staipler init --proof</div>
      <div class="next-step-desc">Run a blind A/B test on your project — tests your agent before and after optimization. ~90 seconds.</div>
    </div>
  </div>
</section>

<!-- CTA -->
<div class="cta-section">
  <div class="cta-content">
    <div class="cta-badge">
      <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#10b981"/></svg>
      Free to start
    </div>
    <h2>Track your project, <span class="cta-gradient">connect more data</span>, and share with your team</h2>
    <p>The CLI is just the beginning. Sign up for a free account at staipler.com to track your empowerment score over time, connect GitHub and Notion, run benchmarks, and see your memory map sync live as you work.</p>

    <div class="cta-features">
      <div class="cta-feature">
        <div class="cta-feature-icon">📈</div>
        <div class="cta-feature-text">
          <h4>Track progress over time</h4>
          <p>See your empowerment score evolve as you add layers and optimize.</p>
        </div>
      </div>
      <div class="cta-feature">
        <div class="cta-feature-icon">🔗</div>
        <div class="cta-feature-text">
          <h4>Connect data sources</h4>
          <p>GitHub, Notion, Google Docs, and more — all mapped into your instruction stack.</p>
        </div>
      </div>
      <div class="cta-feature">
        <div class="cta-feature-icon">💬</div>
        <div class="cta-feature-text">
          <h4>Test your agent live</h4>
          <p>Side-by-side chat — your agent with stAIpler context vs without. See the difference.</p>
        </div>
      </div>
      <div class="cta-feature">
        <div class="cta-feature-icon">👥</div>
        <div class="cta-feature-text">
          <h4>Collaborate with your team</h4>
          <p>Share projects, review generated layers, keep everyone's agent aligned.</p>
        </div>
      </div>
    </div>

    <div class="cta-actions">
      <a href="https://staipler.com/signup" target="_blank" rel="noopener noreferrer" class="cta-btn-primary">
        Create free account
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </a>
      <a href="https://staipler.com" target="_blank" rel="noopener noreferrer" class="cta-btn-secondary">Learn more →</a>
    </div>
    <div class="cta-meta">No credit card required · Open source · Your data stays yours</div>
  </div>
</div>

<footer class="footer">
  Generated by <a href="https://staipler.com" target="_blank" rel="noopener noreferrer">stAIpler</a> ·
  <a href="https://github.com/firedock/stAIpler" target="_blank" rel="noopener noreferrer">GitHub</a>
</footer>

</div>

<!-- Hover Tooltip (hidden until cursor is over a node) -->
<div class="node-tooltip" id="node-tooltip" aria-hidden="true"></div>

<!-- Detail Panel (hidden until a node is clicked) -->
<div class="backdrop" id="backdrop"></div>
<aside class="detail-panel" id="detail-panel" aria-hidden="true">
  <div class="detail-header">
    <button class="detail-close" id="detail-close" aria-label="Close">×</button>
    <div id="detail-layer-wrap"></div>
    <div class="detail-title" id="detail-title"></div>
    <div class="detail-path" id="detail-path"></div>
  </div>
  <div class="detail-body" id="detail-body"></div>
</aside>

<script>
  // Embedded data
  const NODES = ${JSON.stringify(nodeData)};
  const CLUSTERS = ${JSON.stringify(clusterData)};

  function formatSize(bytes) {
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'K';
    return bytes + 'B';
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openDetail(node) {
    const panel = document.getElementById('detail-panel');
    const backdrop = document.getElementById('backdrop');
    const layerWrap = document.getElementById('detail-layer-wrap');
    const title = document.getElementById('detail-title');
    const path = document.getElementById('detail-path');
    const body = document.getElementById('detail-body');

    layerWrap.innerHTML = '<div class="detail-layer-badge" style="background:' + node.color + '20;color:' + node.color + '">' + node.layerName + '</div>';
    title.textContent = node.title;
    path.textContent = node.sourcePath;

    const confPct = Math.round(node.confidence * 100);
    const sizeStr = formatSize(node.size);

    let html = '<div class="detail-meta">';
    html += '<div class="detail-meta-item"><div class="detail-meta-label">Size</div><div class="detail-meta-value">' + sizeStr + '</div></div>';
    html += '<div class="detail-meta-item"><div class="detail-meta-label">Confidence</div><div class="detail-meta-value">' + confPct + '%</div></div>';
    html += '<div class="detail-meta-item"><div class="detail-meta-label">Layer</div><div class="detail-meta-value">' + node.layer + '</div></div>';
    html += '</div>';
    html += '<div style="margin-bottom:12px;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Content</div>';
    html += '<div class="detail-content">' + escapeHtml(node.content || '(empty)') + '</div>';
    body.innerHTML = html;

    panel.classList.add('open');
    backdrop.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }

  function openClusterDetail(cluster) {
    const panel = document.getElementById('detail-panel');
    const backdrop = document.getElementById('backdrop');
    const layerWrap = document.getElementById('detail-layer-wrap');
    const title = document.getElementById('detail-title');
    const path = document.getElementById('detail-path');
    const body = document.getElementById('detail-body');

    layerWrap.innerHTML = '<div class="detail-layer-badge" style="background:' + cluster.color + '20;color:' + cluster.color + '">' + cluster.layerName + '</div>';
    title.textContent = cluster.layerName + ' Layer';
    path.textContent = cluster.hint;

    let html = '';
    if (cluster.status === 'missing') {
      html += '<div class="detail-empty">';
      html += '<h3>No ' + cluster.layer + ' layer yet</h3>';
      html += '<p>Your agent has no guidance for ' + cluster.hint.toLowerCase() + '.</p>';
      html += '<div class="detail-empty-cta">staipler optimize</div>';
      html += '<p style="margin-top:16px;font-size:0.75rem">Generate this layer automatically with AI</p>';
      html += '</div>';
    } else {
      const clusterNodes = NODES.filter(n => n.layer === cluster.layer);
      html += '<div style="margin-bottom:16px;font-size:0.8rem;color:#94a3b8">' + clusterNodes.length + ' file(s) in this layer — click to inspect</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px">';
      for (const n of clusterNodes) {
        html += '<button onclick="openDetail(NODES.find(x => x.id === \\'' + n.id + '\\'))" style="text-align:left;padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;color:#e2e8f0;font-family:inherit;transition:all 0.15s" onmouseover="this.style.borderColor=\\'' + cluster.color + '50\\'" onmouseout="this.style.borderColor=\\'rgba(255,255,255,0.05)\\'">';
        html += '<div style="font-size:0.85rem;font-weight:600;margin-bottom:2px">' + escapeHtml(n.title) + '</div>';
        html += '<div style="font-size:0.7rem;color:#64748b;font-family:SF Mono,monospace">' + escapeHtml(n.sourcePath) + '</div>';
        html += '</button>';
      }
      html += '</div>';
    }
    body.innerHTML = html;

    panel.classList.add('open');
    backdrop.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    const panel = document.getElementById('detail-panel');
    const backdrop = document.getElementById('backdrop');
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('backdrop').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDetail();
  });

  // Hover tooltip
  const tooltip = document.getElementById('node-tooltip');

  function showTooltip(node, clientX, clientY) {
    if (!tooltip) return;
    const preview = (node.content || '(empty)').trim().slice(0, 240);
    const confPct = Math.round(node.confidence * 100);
    const sizeStr = formatSize(node.size);

    let html = '<div class="node-tooltip-layer" style="background:' + node.color + '20;color:' + node.color + '">' + node.layerName + '</div>';
    html += '<div class="node-tooltip-title">' + escapeHtml(node.title) + '</div>';
    html += '<div class="node-tooltip-path">' + escapeHtml(node.sourcePath) + '</div>';
    html += '<div class="node-tooltip-preview">' + escapeHtml(preview) + '</div>';
    html += '<div class="node-tooltip-hint">';
    html += '<span>Click to inspect →</span>';
    html += '<span class="node-tooltip-meta">' + sizeStr + ' · ' + confPct + '%</span>';
    html += '</div>';
    tooltip.innerHTML = html;

    // Position after render so we can measure
    tooltip.classList.add('visible');
    const rect = tooltip.getBoundingClientRect();
    const padding = 14;
    let left = clientX + 18;
    let top = clientY + 18;

    // Keep within viewport
    if (left + rect.width + padding > window.innerWidth) {
      left = clientX - rect.width - 18;
    }
    if (top + rect.height + padding > window.innerHeight) {
      top = clientY - rect.height - 18;
    }
    if (left < padding) left = padding;
    if (top < padding) top = padding;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  // Wire up node clicks + hover
  document.querySelectorAll('.map-node-group').forEach(group => {
    group.style.cursor = 'pointer';
    const nodeId = group.getAttribute('data-node-id');
    const node = NODES.find(n => n.id === nodeId);

    group.addEventListener('click', function() {
      hideTooltip();
      if (node) openDetail(node);
    });

    if (node) {
      group.addEventListener('mouseenter', function(e) {
        showTooltip(node, e.clientX, e.clientY);
      });
      group.addEventListener('mousemove', function(e) {
        if (tooltip && tooltip.classList.contains('visible')) {
          const rect = tooltip.getBoundingClientRect();
          const padding = 14;
          let left = e.clientX + 18;
          let top = e.clientY + 18;
          if (left + rect.width + padding > window.innerWidth) left = e.clientX - rect.width - 18;
          if (top + rect.height + padding > window.innerHeight) top = e.clientY - rect.height - 18;
          if (left < padding) left = padding;
          if (top < padding) top = padding;
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
        }
      });
      group.addEventListener('mouseleave', hideTooltip);
    }
  });

  // Wire up missing cluster clicks
  document.querySelectorAll('.map-missing-circle').forEach((el, i) => {
    const missingClusters = CLUSTERS.filter(c => c.status === 'missing');
    const cluster = missingClusters[i];
    if (!cluster) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function() {
      openClusterDetail(cluster);
    });
  });

  // Wire up layer card clicks
  document.querySelectorAll('.layer-card').forEach(card => {
    card.addEventListener('click', function() {
      const layer = card.getAttribute('data-layer');
      const cluster = CLUSTERS.find(c => c.layer === layer);
      if (cluster) openClusterDetail(cluster);
    });
  });
</script>

</body>
</html>`;
}
