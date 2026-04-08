/**
 * Memory Graph Builder
 *
 * Constructs a MemoryGraph from scan results, analysis, and retrieval events.
 * Pure functions — no side effects, no provider calls.
 */

import type { ScanResult, KnowledgeFile, ScannedFile } from '../optimizer/scanner.js';
import type { AnalysisResult } from '../optimizer/analyzer.js';
import type {
  MemoryGraph,
  MemoryNode,
  MemoryLink,
  MemoryCluster,
  MemoryStats,
  MemorySourceType,
  RetrievalEvent,
  ClusterType,
} from './types.js';
import { LAYER_COLORS, SOURCE_COLORS } from './types.js';

// ---- Node Construction ----

function createNodeId(prefix: string, path: string): string {
  const clean = path.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 60);
  return `${prefix}-${clean}`;
}

function fileToNode(file: ScannedFile): MemoryNode {
  const sourceType: MemorySourceType = file.sourceType === 'mcp-config'
    ? 'mcp-config'
    : file.sourceType === 'memory-provider'
    ? 'ai-generated'
    : file.parsedAsset
    ? 'instruction-file'
    : 'instruction-file';

  return {
    id: createNodeId('file', file.relativePath),
    content: file.content.slice(0, 5000),
    title: file.name,
    sourceType,
    sourcePath: file.relativePath,
    layer: file.inferredKind,
    confidence: file.inferredConfidence,
    size: file.contentLength,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: null,
    useCount: 0,
    tags: [file.inferredKind ?? 'unclassified', file.sourceType],
  };
}

function knowledgeFileToNode(file: KnowledgeFile): MemoryNode {
  return {
    id: createNodeId('kb', file.relativePath),
    content: '', // Content loaded on demand, not stored in graph
    title: file.relativePath,
    sourceType: 'knowledge-base',
    sourcePath: file.relativePath,
    layer: null,
    confidence: 1.0,
    size: file.size,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: null,
    useCount: 0,
    tags: [file.category, 'knowledge-base'],
  };
}

// ---- Link Detection ----

/**
 * Detect relationships between nodes based on content and layer type.
 */
function detectLinks(nodes: MemoryNode[]): MemoryLink[] {
  const links: MemoryLink[] = [];

  // Same-layer nodes reinforce each other
  const byLayer = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    if (node.layer) {
      if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
      byLayer.get(node.layer)!.push(node);
    }
  }

  for (const [, layerNodes] of byLayer) {
    for (let i = 0; i < layerNodes.length; i++) {
      for (let j = i + 1; j < layerNodes.length; j++) {
        links.push({
          from: layerNodes[i].id,
          to: layerNodes[j].id,
          relationship: 'reinforces',
          strength: 0.8,
        });
      }
    }
  }

  // Constraints depend on context (need domain knowledge to enforce rules)
  const constraintNodes = nodes.filter(n => n.layer === 'constraints');
  const contextNodes = nodes.filter(n => n.layer === 'context');
  for (const c of constraintNodes) {
    for (const ctx of contextNodes) {
      links.push({
        from: c.id,
        to: ctx.id,
        relationship: 'depends-on',
        strength: 0.6,
      });
    }
  }

  // Style relates to identity (voice comes from persona)
  const styleNodes = nodes.filter(n => n.layer === 'style');
  const identityNodes = nodes.filter(n => n.layer === 'identity');
  for (const s of styleNodes) {
    for (const id of identityNodes) {
      links.push({
        from: s.id,
        to: id.id,
        relationship: 'extends',
        strength: 0.5,
      });
    }
  }

  // Knowledge base files are related to context nodes
  const kbNodes = nodes.filter(n => n.sourceType === 'knowledge-base');
  for (const kb of kbNodes) {
    for (const ctx of contextNodes) {
      links.push({
        from: kb.id,
        to: ctx.id,
        relationship: 'related',
        strength: 0.4,
      });
    }
  }

  // Skills depend on tools (workflows use tools)
  const skillNodes = nodes.filter(n => n.layer === 'skills');
  const toolNodes = nodes.filter(n => n.layer === 'tools');
  for (const sk of skillNodes) {
    for (const t of toolNodes) {
      links.push({
        from: sk.id,
        to: t.id,
        relationship: 'depends-on',
        strength: 0.5,
      });
    }
  }

  return links;
}

// ---- Cluster Construction ----

function buildClusters(nodes: MemoryNode[], links: MemoryLink[]): MemoryCluster[] {
  const clusters: MemoryCluster[] = [];

  // Layer clusters — group by instruction layer
  const byLayer = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    const key = node.layer ?? 'unclassified';
    if (!byLayer.has(key)) byLayer.set(key, []);
    byLayer.get(key)!.push(node);
  }
  for (const [layer, layerNodes] of byLayer) {
    const avgConf = layerNodes.reduce((s, n) => s + n.confidence, 0) / layerNodes.length;
    clusters.push({
      id: `layer-${layer}`,
      name: layer.charAt(0).toUpperCase() + layer.slice(1),
      type: 'layer',
      nodeIds: layerNodes.map(n => n.id),
      confidence: Math.round(avgConf * 100) / 100,
      color: LAYER_COLORS[layer] ?? '#6b7280',
    });
  }

  // Source clusters — group by origin
  const bySource = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    if (!bySource.has(node.sourceType)) bySource.set(node.sourceType, []);
    bySource.get(node.sourceType)!.push(node);
  }
  for (const [source, sourceNodes] of bySource) {
    const labels: Record<string, string> = {
      'instruction-file': 'Instruction Files',
      'knowledge-base': 'Knowledge Base',
      'chat-interaction': 'Chat History',
      'user-input': 'User Input',
      'data-source': 'Data Sources',
      'ai-generated': 'AI Generated',
      'mcp-config': 'MCP Servers',
      'env-config': 'Environment',
    };
    clusters.push({
      id: `source-${source}`,
      name: labels[source] ?? source,
      type: 'source',
      nodeIds: sourceNodes.map(n => n.id),
      confidence: 1.0,
      color: SOURCE_COLORS[source as MemorySourceType] ?? '#6b7280',
    });
  }

  // Strength clusters — group by confidence level
  const strong = nodes.filter(n => n.confidence >= 0.8);
  const moderate = nodes.filter(n => n.confidence >= 0.5 && n.confidence < 0.8);
  const weak = nodes.filter(n => n.confidence < 0.5);

  if (strong.length > 0) {
    clusters.push({
      id: 'strength-strong',
      name: 'High Confidence',
      type: 'strength',
      nodeIds: strong.map(n => n.id),
      confidence: 0.9,
      color: '#10b981',
    });
  }
  if (moderate.length > 0) {
    clusters.push({
      id: 'strength-moderate',
      name: 'Moderate Confidence',
      type: 'strength',
      nodeIds: moderate.map(n => n.id),
      confidence: 0.6,
      color: '#f59e0b',
    });
  }
  if (weak.length > 0) {
    clusters.push({
      id: 'strength-weak',
      name: 'Low Confidence',
      type: 'strength',
      nodeIds: weak.map(n => n.id),
      confidence: 0.3,
      color: '#ef4444',
    });
  }

  return clusters;
}

// ---- Stats ----

function computeStats(nodes: MemoryNode[], links: MemoryLink[], clusters: MemoryCluster[], retrievals: RetrievalEvent[]): MemoryStats {
  const coverageByLayer: Record<string, number> = {};
  const coverageBySource: Record<string, number> = {};

  for (const node of nodes) {
    const layer = node.layer ?? 'unclassified';
    coverageByLayer[layer] = (coverageByLayer[layer] ?? 0) + 1;
    coverageBySource[node.sourceType] = (coverageBySource[node.sourceType] ?? 0) + 1;
  }

  const sortedByAge = [...nodes].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  return {
    totalNodes: nodes.length,
    totalLinks: links.length,
    totalClusters: clusters.length,
    totalRetrievals: retrievals.length,
    coverageByLayer,
    coverageBySource,
    lastUpdated: new Date().toISOString(),
    stalestNode: sortedByAge[0]?.id ?? null,
  };
}

// ---- Main Graph Builder ----

/**
 * Build a complete MemoryGraph from scan results and analysis.
 * This is the primary entry point — takes raw data and produces
 * the full three-layer model (raw, organization, retrieval).
 */
export function buildMemoryGraph(
  scanResult: ScanResult,
  analysis: AnalysisResult,
  retrievals: RetrievalEvent[] = [],
): MemoryGraph {
  // Build nodes from all sources
  const nodes: MemoryNode[] = [];

  // Instruction files → nodes
  for (const file of scanResult.files) {
    nodes.push(fileToNode(file));
  }

  // Knowledge base → nodes
  for (const kb of scanResult.knowledgeBase) {
    nodes.push(knowledgeFileToNode(kb));
  }

  // Detect relationships
  const links = detectLinks(nodes);

  // Build organizational clusters
  const clusters = buildClusters(nodes, links);

  // Compute stats
  const stats = computeStats(nodes, links, clusters, retrievals);

  return { nodes, links, clusters, retrievals, stats };
}

/**
 * Add a retrieval event to an existing graph.
 * Called after a chat response to track which memories were used.
 */
export function addRetrievalEvent(graph: MemoryGraph, event: RetrievalEvent): MemoryGraph {
  const newRetrievals = [...graph.retrievals, event];

  // Update use counts on nodes
  const newNodes = graph.nodes.map(node => {
    const wasUsed = event.used.find(u => u.nodeId === node.id);
    if (wasUsed) {
      return {
        ...node,
        lastUsedAt: event.timestamp,
        useCount: node.useCount + 1,
      };
    }
    return node;
  });

  const stats = computeStats(newNodes, graph.links, graph.clusters, newRetrievals);

  return { ...graph, nodes: newNodes, retrievals: newRetrievals, stats };
}

/**
 * Simulate retrieval attribution for a system prompt.
 * Given the compiled system prompt and the original nodes,
 * determine which nodes contributed to the prompt.
 */
export function attributeRetrieval(
  nodes: MemoryNode[],
  systemPrompt: string,
  userQuery: string,
): RetrievalEvent {
  const considered: { nodeId: string; relevanceScore: number }[] = [];
  const used: { nodeId: string; reason: 'direct-match' | 'related-concept' | 'constraint-check' | 'style-guide' | 'domain-context' | 'example-reference' | 'chain-synthesis' }[] = [];
  const rejected: { nodeId: string; reason: string }[] = [];

  for (const node of nodes) {
    if (!node.content || node.content.length === 0) {
      continue;
    }

    // Check if this node's content appears in the system prompt
    const contentSample = node.content.slice(0, 200).toLowerCase();
    const inPrompt = systemPrompt.toLowerCase().includes(contentSample.slice(0, 50));

    if (inPrompt) {
      // Determine reason based on layer type
      let reason: typeof used[0]['reason'] = 'domain-context';
      switch (node.layer) {
        case 'constraints': reason = 'constraint-check'; break;
        case 'style': reason = 'style-guide'; break;
        case 'examples': reason = 'example-reference'; break;
        case 'context': reason = 'domain-context'; break;
        case 'identity': reason = 'direct-match'; break;
        default: reason = 'related-concept';
      }

      considered.push({ nodeId: node.id, relevanceScore: node.confidence });
      used.push({ nodeId: node.id, reason });
    } else if (node.layer) {
      // Node exists but wasn't included in this prompt
      considered.push({ nodeId: node.id, relevanceScore: node.confidence * 0.3 });
      rejected.push({ nodeId: node.id, reason: 'Not included in compiled system prompt' });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    query: userQuery,
    considered,
    used,
    rejected,
  };
}
