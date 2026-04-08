import { Command } from 'commander';
import { resolve } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  buildMemoryGraph,
  LAYER_COLORS,
} from '@staipler/core';

const purple = '\x1b[38;5;135m';
const r = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';

export const memoryCommand = new Command('memory')
  .description('Inspect your agent\'s memory — what it knows, how it\'s organized, and what\'s missing')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--json', 'Output as JSON')
  .action(async (dir: string | undefined, opts: { json?: boolean }) => {
    let projectRoot: string;
    try {
      projectRoot = findProjectRoot(process.cwd());
    } catch {
      projectRoot = process.cwd();
    }

    const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;
    const projectName = scanDir.split('/').pop() ?? 'project';

    // Scan and analyze
    const scanResult = scan(scanDir);
    const analysis = analyze(scanResult);

    // Build memory graph
    const graph = buildMemoryGraph(scanResult, analysis);

    if (opts.json) {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }

    // ---- Render ----
    console.log(`\n  ${purple}${bold}Memory Map — ${projectName}${r}\n`);

    // Stats bar
    console.log(`  ${dim}${graph.stats.totalNodes} nodes · ${graph.stats.totalLinks} links · ${graph.stats.totalClusters} clusters${r}\n`);

    // Layer coverage (the organization view)
    console.log(`  ${purple}Instruction Layers${r}\n`);

    const layerClusters = graph.clusters.filter(c => c.type === 'layer');
    for (const cluster of layerClusters) {
      const icon = cluster.nodeIds.length > 0 ? `${green}✓${r}` : `${red}✗${r}`;
      const countStr = cluster.nodeIds.length > 0
        ? `${cluster.nodeIds.length} node${cluster.nodeIds.length > 1 ? 's' : ''}`
        : 'empty';
      const confStr = cluster.nodeIds.length > 0
        ? `${Math.round(cluster.confidence * 100)}%`
        : '';

      console.log(`    ${icon} ${cluster.name.padEnd(14)} ${dim}${countStr.padEnd(10)} ${confStr}${r}`);

      // Show node details within cluster
      if (cluster.nodeIds.length > 0) {
        const clusterNodes = graph.nodes.filter(n => cluster.nodeIds.includes(n.id));
        for (const node of clusterNodes.slice(0, 3)) {
          const sourceLabel = node.sourceType === 'ai-generated' ? 'AI' : node.sourceType === 'instruction-file' ? 'file' : node.sourceType;
          console.log(`      ${dim}└ ${node.title} (${sourceLabel}, ${node.size > 1024 ? `${(node.size / 1024).toFixed(1)}K` : `${node.size}B`})${r}`);
        }
        if (clusterNodes.length > 3) {
          console.log(`      ${dim}  ... +${clusterNodes.length - 3} more${r}`);
        }
      }
    }

    // Knowledge base
    const kbNodes = graph.nodes.filter(n => n.sourceType === 'knowledge-base');
    if (kbNodes.length > 0) {
      console.log(`\n  ${purple}Knowledge Base${r}\n`);
      for (const node of kbNodes) {
        console.log(`    ${dim}•${r} ${node.title.padEnd(40)} ${dim}${node.size > 1024 ? `${(node.size / 1024).toFixed(1)}K` : `${node.size}B`}${r}`);
      }
    }

    // Relationships summary
    const relCounts: Record<string, number> = {};
    for (const link of graph.links) {
      relCounts[link.relationship] = (relCounts[link.relationship] ?? 0) + 1;
    }

    if (graph.links.length > 0) {
      console.log(`\n  ${purple}Relationships${r}\n`);
      for (const [rel, count] of Object.entries(relCounts)) {
        const label = rel === 'reinforces' ? 'reinforce each other'
          : rel === 'depends-on' ? 'depend on'
          : rel === 'extends' ? 'extend'
          : rel === 'contradicts' ? 'contradict'
          : 'are related to';
        console.log(`    ${dim}${count} nodes ${label}${r}`);
      }
    }

    // Source breakdown
    const sourceClusters = graph.clusters.filter(c => c.type === 'source');
    if (sourceClusters.length > 0) {
      console.log(`\n  ${purple}By Source${r}\n`);
      for (const cluster of sourceClusters) {
        console.log(`    ${dim}${cluster.name.padEnd(20)} ${cluster.nodeIds.length} nodes${r}`);
      }
    }

    // Missing layers — actionable
    const missingLayers = layerClusters.filter(c => c.nodeIds.length === 0);
    if (missingLayers.length > 0) {
      console.log(`\n  ${yellow}Missing (${missingLayers.length} layers)${r}\n`);
      console.log(`    ${dim}Run ${bold}staipler optimize${r}${dim} to generate these layers${r}`);
      console.log(`    ${dim}or create them manually as markdown files.${r}`);
    }

    console.log('');
  });
