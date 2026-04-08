'use client';

import { useState, useEffect, useRef } from 'react';

// ---- Types (matches API response) ----
interface MemNode {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  sourcePath: string;
  layer: string | null;
  confidence: number;
  size: number;
  createdAt: string;
  tags: string[];
  // Computed for layout
  x?: number;
  y?: number;
}

interface MemLink {
  from: string;
  to: string;
  relationship: string;
  strength: number;
}

interface MemCluster {
  id: string;
  name: string;
  type: string;
  nodeIds: string[];
  confidence: number;
  color: string;
  status?: string;
}

interface MemStats {
  totalNodes: number;
  totalLinks: number;
  totalClusters: number;
  coverageByLayer: Record<string, number>;
  coverageBySource: Record<string, number>;
  projectName: string;
  readinessScore: number;
  grade: string;
}

interface MemoryGraphData {
  nodes: MemNode[];
  links: MemLink[];
  clusters: MemCluster[];
  stats: MemStats;
  history: any[];
}

interface MemoryMapProps {
  projectId: string;
}

const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444', context: '#3b82f6', evals: '#6b7280',
  examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
  memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
  skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
};

const SOURCE_LABELS: Record<string, string> = {
  'instruction-file': 'Instruction',
  'ai-generated': 'AI Generated',
  'data-source': 'Data Source',
  'knowledge-base': 'Knowledge',
  'mcp-config': 'MCP',
};

// ---- Layout: position nodes in a radial cluster layout ----
function layoutNodes(clusters: MemCluster[], nodes: MemNode[]): MemNode[] {
  const layerClusters = clusters.filter(c => c.type === 'layer');
  const centerX = 400;
  const centerY = 300;
  const radius = 220;
  const positioned = new Map<string, { x: number; y: number }>();

  // Position layer clusters in a circle
  layerClusters.forEach((cluster, i) => {
    const angle = (i / layerClusters.length) * 2 * Math.PI - Math.PI / 2;
    const cx = centerX + Math.cos(angle) * radius;
    const cy = centerY + Math.sin(angle) * radius;

    // Position nodes within cluster
    cluster.nodeIds.forEach((nodeId, j) => {
      const spread = Math.min(40, 15 + cluster.nodeIds.length * 5);
      const nodeAngle = (j / Math.max(cluster.nodeIds.length, 1)) * 2 * Math.PI;
      const nx = cx + Math.cos(nodeAngle) * spread;
      const ny = cy + Math.sin(nodeAngle) * spread;
      positioned.set(nodeId, { x: nx, y: ny });
    });
  });

  // Position any unpositioned nodes near center
  return nodes.map(node => {
    const pos = positioned.get(node.id);
    return {
      ...node,
      x: pos?.x ?? centerX + (Math.random() - 0.5) * 100,
      y: pos?.y ?? centerY + (Math.random() - 0.5) * 100,
    };
  });
}

export function MemoryMap({ projectId }: MemoryMapProps) {
  const [data, setData] = useState<MemoryGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<MemNode | null>(null);
  const [viewMode, setViewMode] = useState<'layer' | 'source' | 'all'>('layer');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/memory?projectId=${projectId}`);
        const json = await res.json();
        // Layout nodes
        json.nodes = layoutNodes(json.clusters, json.nodes);
        setData(json);
      } catch (err) {
        console.error('Failed to load memory graph:', err);
      }
      setLoading(false);
    }
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-slate-600 animate-pulse">Loading memory map...</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div>
          <div className="text-sm text-slate-500 mb-2">No memory nodes yet</div>
          <div className="text-xs text-slate-700">Connect a data source or run staipler optimize to populate the memory map.</div>
        </div>
      </div>
    );
  }

  const layerClusters = data.clusters.filter(c => c.type === 'layer');
  const presentLayers = layerClusters.filter(c => c.nodeIds.length > 0);
  const missingLayers = layerClusters.filter(c => c.nodeIds.length === 0);

  // Get links connected to hovered node
  const highlightedLinks = hoveredNode
    ? data.links.filter(l => l.from === hoveredNode || l.to === hoveredNode)
    : [];
  const highlightedNodeIds = new Set(
    highlightedLinks.flatMap(l => [l.from, l.to])
  );

  return (
    <div className="rounded-xl bg-[#0a0a18] border border-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Memory Map</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
            {data.stats.totalNodes} nodes · {presentLayers.length}/12 layers
          </span>
        </div>
        <div className="flex gap-1">
          {(['layer', 'source', 'all'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`text-[10px] px-2.5 py-1 rounded-md transition ${
                viewMode === mode
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {mode === 'layer' ? 'By Layer' : mode === 'source' ? 'By Source' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* SVG Graph */}
        <div className="flex-1 relative">
          <svg
            ref={svgRef}
            viewBox="0 0 800 600"
            className="w-full h-[500px]"
          >
            {/* Links */}
            {data.links.map((link, i) => {
              const from = data.nodes.find(n => n.id === link.from);
              const to = data.nodes.find(n => n.id === link.to);
              if (!from?.x || !to?.x) return null;

              const isHighlighted = highlightedLinks.includes(link);
              const opacity = hoveredNode
                ? isHighlighted ? 0.6 : 0.05
                : 0.15;

              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y!}
                  x2={to.x}
                  y2={to.y!}
                  stroke={isHighlighted ? '#a78bfa' : '#334155'}
                  strokeWidth={isHighlighted ? 1.5 : 0.5}
                  opacity={opacity}
                />
              );
            })}

            {/* Cluster labels (behind nodes) */}
            {layerClusters.filter(c => c.nodeIds.length > 0).map(cluster => {
              const clusterNodes = data.nodes.filter(n => cluster.nodeIds.includes(n.id));
              if (clusterNodes.length === 0) return null;
              const cx = clusterNodes.reduce((s, n) => s + (n.x ?? 0), 0) / clusterNodes.length;
              const cy = clusterNodes.reduce((s, n) => s + (n.y ?? 0), 0) / clusterNodes.length;

              return (
                <text
                  key={cluster.id}
                  x={cx}
                  y={cy - 35}
                  textAnchor="middle"
                  fill={cluster.color}
                  fontSize="9"
                  fontWeight="600"
                  opacity={0.6}
                >
                  {cluster.name.toUpperCase()}
                </text>
              );
            })}

            {/* Nodes */}
            {data.nodes.map(node => {
              if (!node.x || !node.y) return null;

              const color = node.layer ? (LAYER_COLORS[node.layer] ?? '#6b7280') : '#475569';
              const isHovered = hoveredNode === node.id;
              const isConnected = highlightedNodeIds.has(node.id);
              const dimmed = hoveredNode && !isHovered && !isConnected;
              const r = Math.max(4, Math.min(12, Math.sqrt(node.size / 100)));

              return (
                <g key={node.id}>
                  {/* Glow for hovered */}
                  {isHovered && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 6}
                      fill={color}
                      opacity={0.15}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={color}
                    opacity={dimmed ? 0.15 : isHovered ? 1 : 0.7}
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={1.5}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => setSelectedNode(node)}
                  />
                  {/* Title on hover */}
                  {isHovered && (
                    <text
                      x={node.x}
                      y={node.y! - r - 6}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="10"
                      fontWeight="500"
                    >
                      {node.title}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Missing layer indicators */}
            {missingLayers.map((cluster, i) => {
              const angle = (layerClusters.indexOf(cluster) / layerClusters.length) * 2 * Math.PI - Math.PI / 2;
              const x = 400 + Math.cos(angle) * 220;
              const y = 300 + Math.sin(angle) * 220;

              return (
                <g key={cluster.id} opacity={0.3}>
                  <circle cx={x} cy={y} r={16} fill="none" stroke={cluster.color} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={x} y={y + 3} textAnchor="middle" fill={cluster.color} fontSize="8" fontWeight="600">?</text>
                  <text x={x} y={y + 28} textAnchor="middle" fill={cluster.color} fontSize="8" opacity={0.5}>
                    {cluster.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right panel — node detail or stats */}
        <div className="w-72 border-l border-white/[0.04] p-4 overflow-y-auto max-h-[500px]">
          {selectedNode ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold truncate">{selectedNode.title}</h4>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-xs text-slate-600 hover:text-slate-400"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {/* Layer badge */}
                {selectedNode.layer && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: LAYER_COLORS[selectedNode.layer] ?? '#6b7280' }}
                    />
                    <span className="text-xs text-slate-400 capitalize">{selectedNode.layer}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">{Math.round(selectedNode.confidence * 100)}% confidence</span>
                  </div>
                )}

                {/* Source */}
                <div className="text-[10px] text-slate-600">
                  <span className="text-slate-500">Source:</span> {SOURCE_LABELS[selectedNode.sourceType] ?? selectedNode.sourceType}
                </div>
                <div className="text-[10px] text-slate-600 font-mono truncate">
                  {selectedNode.sourcePath}
                </div>

                {/* Content preview */}
                {selectedNode.content && (
                  <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-[10px] text-slate-500 mb-1">Content preview</div>
                    <div className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {selectedNode.content.slice(0, 400)}
                      {selectedNode.content.length > 400 ? '...' : ''}
                    </div>
                  </div>
                )}

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedNode.tags.map((tag, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Metadata */}
                <div className="text-[10px] text-slate-700 mt-2 space-y-1">
                  <div>Size: {selectedNode.size > 1024 ? `${(selectedNode.size / 1024).toFixed(1)}K` : `${selectedNode.size}B`}</div>
                  <div>Added: {new Date(selectedNode.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h4 className="text-sm font-semibold mb-4">Graph Overview</h4>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2 rounded-lg bg-white/[0.02]">
                  <div className="text-lg font-bold text-purple-400">{data.stats.totalNodes}</div>
                  <div className="text-[10px] text-slate-600">Nodes</div>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02]">
                  <div className="text-lg font-bold text-purple-400">{presentLayers.length}/12</div>
                  <div className="text-[10px] text-slate-600">Layers</div>
                </div>
              </div>

              {/* Layer coverage */}
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Layer Coverage</div>
              <div className="space-y-1.5">
                {layerClusters.map(cluster => (
                  <div key={cluster.id} className="flex items-center gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cluster.color, opacity: cluster.nodeIds.length > 0 ? 1 : 0.2 }}
                    />
                    <span className={`text-xs flex-1 ${cluster.nodeIds.length > 0 ? 'text-slate-400' : 'text-slate-700'}`}>
                      {cluster.name}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {cluster.nodeIds.length > 0 ? `${cluster.nodeIds.length}` : '—'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Source breakdown */}
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 mt-4">By Source</div>
              <div className="space-y-1.5">
                {Object.entries(data.stats.coverageBySource).map(([source, count]) => (
                  <div key={source} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 flex-1">{SOURCE_LABELS[source] ?? source}</span>
                    <span className="text-[10px] text-slate-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
