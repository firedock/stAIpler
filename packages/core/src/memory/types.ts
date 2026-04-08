/**
 * Memory Platform Types
 *
 * Three-layer model:
 * 1. Raw — source artifacts (instruction files, chat snippets, docs, decisions)
 * 2. Organization — clusters, links, labels, confidence, relationships
 * 3. Retrieval — which memories were used in a response and why
 */

// ---- Raw Layer ----

export type MemorySourceType =
  | 'instruction-file'   // CLAUDE.md, CONSTRAINTS.md, etc.
  | 'knowledge-base'     // README, package.json, schemas
  | 'chat-interaction'   // conversation snippet
  | 'user-input'         // manually added context
  | 'data-source'        // imported from GitHub, Notion, etc.
  | 'ai-generated'       // created by staipler optimize
  | 'mcp-config'         // MCP server definitions
  | 'env-config';        // environment/config files

export interface MemoryNode {
  /** Unique identifier */
  id: string;
  /** The actual content */
  content: string;
  /** Short title/label */
  title: string;
  /** Where this memory came from */
  sourceType: MemorySourceType;
  /** Source file path or URL */
  sourcePath: string;
  /** Which instruction layer this maps to (if applicable) */
  layer: string | null;
  /** Confidence that this classification is correct (0-1) */
  confidence: number;
  /** Content size in characters */
  size: number;
  /** When this memory was added */
  createdAt: string;
  /** When this memory was last updated */
  updatedAt: string;
  /** When this memory was last used in a response */
  lastUsedAt: string | null;
  /** How many times this memory has been used in responses */
  useCount: number;
  /** Tags for organization */
  tags: string[];
}

// ---- Organization Layer ----

export type ClusterType =
  | 'layer'        // grouped by instruction layer (identity, constraints, etc.)
  | 'topic'        // grouped by domain topic (auth, database, API, etc.)
  | 'source'       // grouped by origin (github, manual, ai-generated)
  | 'recency'      // grouped by time (active, stale, archived)
  | 'strength';    // grouped by confidence/importance

export interface MemoryCluster {
  /** Cluster identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** How this cluster was formed */
  type: ClusterType;
  /** Node IDs belonging to this cluster */
  nodeIds: string[];
  /** Cluster-level confidence (average of members) */
  confidence: number;
  /** Visual color for the map */
  color: string;
}

export interface MemoryLink {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Relationship type */
  relationship: 'reinforces' | 'contradicts' | 'extends' | 'depends-on' | 'related';
  /** Link strength (0-1) */
  strength: number;
}

// ---- Retrieval Layer ----

export type RetrievalReason =
  | 'direct-match'      // content directly matched the query
  | 'related-concept'   // semantically related
  | 'constraint-check'  // consulted for safety/policy
  | 'style-guide'       // used for formatting/tone
  | 'domain-context'    // background knowledge
  | 'example-reference' // used as few-shot example
  | 'chain-synthesis';  // synthesized across multiple memories

export interface RetrievalEvent {
  /** When the retrieval happened */
  timestamp: string;
  /** The user's query/message that triggered retrieval */
  query: string;
  /** Nodes that were considered */
  considered: { nodeId: string; relevanceScore: number }[];
  /** Nodes that were actually used in the response */
  used: { nodeId: string; reason: RetrievalReason }[];
  /** Nodes that were considered but rejected */
  rejected: { nodeId: string; reason: string }[];
}

// ---- Memory Graph (complete state) ----

export interface MemoryGraph {
  /** All memory nodes */
  nodes: MemoryNode[];
  /** Relationships between nodes */
  links: MemoryLink[];
  /** Organizational clusters (multiple views) */
  clusters: MemoryCluster[];
  /** Retrieval history */
  retrievals: RetrievalEvent[];
  /** Graph-level stats */
  stats: MemoryStats;
}

export interface MemoryStats {
  totalNodes: number;
  totalLinks: number;
  totalClusters: number;
  totalRetrievals: number;
  coverageByLayer: Record<string, number>;  // layer → node count
  coverageBySource: Record<string, number>; // source type → node count
  lastUpdated: string;
  stalestNode: string | null;  // ID of least recently updated node
}

// ---- Layer colors for visualization ----

export const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444',   // red
  context: '#3b82f6',       // blue
  evals: '#6b7280',         // gray
  examples: '#f59e0b',      // amber
  goals: '#10b981',         // emerald
  identity: '#8b5cf6',      // violet
  memory: '#ec4899',        // pink
  policies: '#f97316',      // orange
  prompts: '#06b6d4',       // cyan
  skills: '#14b8a6',        // teal
  style: '#a855f7',         // purple
  tools: '#64748b',         // slate
};

export const SOURCE_COLORS: Record<MemorySourceType, string> = {
  'instruction-file': '#8b5cf6',
  'knowledge-base': '#3b82f6',
  'chat-interaction': '#10b981',
  'user-input': '#f59e0b',
  'data-source': '#06b6d4',
  'ai-generated': '#a855f7',
  'mcp-config': '#64748b',
  'env-config': '#6b7280',
};
