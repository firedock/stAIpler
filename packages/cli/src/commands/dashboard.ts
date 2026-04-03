import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import {
  findProjectRoot,
  scan,
  analyze,
  loadKpiHistory,
  saveKpiSnapshot,
  generateDashboard,
} from '@staipler/core';
import type { KpiSnapshot, DashboardData } from '@staipler/core';

export const dashboardCommand = new Command('dashboard')
  .description('Generate and open the project context dashboard')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--no-open', 'Generate report without opening in browser')
  .action((dir: string | undefined, opts: { open: boolean }) => {
    try {
      const projectRoot = findProjectRoot(process.cwd());
      const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;

      // Scan and analyze
      console.log('\n  Scanning project...');
      const scanResult = scan(scanDir);
      const analysis = analyze(scanResult);

      // Save scan snapshot
      const snapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: analysis.readinessScore,
        grade: analysis.grade,
        layerScores: Object.fromEntries(analysis.layers.map(l => [l.kind, l.qualityScore])),
        action: 'scan',
      };
      saveKpiSnapshot(projectRoot, snapshot);

      // Load KPI history
      const kpiHistory = loadKpiHistory(projectRoot);

      // Determine project name from config or directory
      const projectName = kpiHistory.projectName || scanDir.split('/').pop() || 'Project';

      // Generate dashboard
      const dashboardData: DashboardData = {
        projectName,
        currentAnalysis: analysis,
        kpiHistory,
        generatedAt: new Date().toISOString(),
      };

      const html = generateDashboard(dashboardData);
      const outputDir = resolve(projectRoot, '.output');
      mkdirSync(outputDir, { recursive: true });
      const outputPath = resolve(outputDir, 'dashboard.html');
      writeFileSync(outputPath, html);

      console.log(`  Empowerment: ${analysis.readinessScore}/100 (${analysis.grade})`);
      console.log(`  Layers: ${analysis.layers.filter(l => l.status === 'present').length} present, ${analysis.layers.filter(l => l.status === 'missing').length} missing`);
      console.log(`  History: ${kpiHistory.snapshots.length} snapshots`);
      console.log(`\n  Dashboard: ${outputPath}\n`);

      // Open in browser
      if (opts.open) {
        try {
          execSync(`open "${outputPath}"`, { stdio: 'ignore' });
        } catch {
          // open command may not exist on all platforms
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
