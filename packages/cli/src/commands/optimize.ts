import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  optimize,
  saveKpiSnapshot,
  loadKpiHistory,
  generateDemoReport,
} from '@staipler/core';
import type { KpiSnapshot } from '@staipler/core';

export const optimizeCommand = new Command('optimize')
  .description('Scan, analyze, and optimize your instruction stack')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--model <model>', 'Claude model to use for optimization', 'sonnet')
  .option('--out <dir>', 'Output directory for optimized assets', 'library/optimized')
  .option('--scan-only', 'Only scan and analyze, don\'t generate')
  .option('--dry-run', 'Show the optimization plan without executing')
  .option('--report', 'Generate an interactive HTML report')
  .action(async (dir: string | undefined, opts: { model: string; out: string; scanOnly?: boolean; dryRun?: boolean; report?: boolean }) => {
    try {
      const projectRoot = findProjectRoot(process.cwd());
      const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;

      // Phase 1: Scan
      console.log('\n  Scanning for instruction files...\n');
      const scanResult = scan(scanDir);

      console.log(`  Found ${scanResult.files.length} instruction file(s):\n`);
      for (const file of scanResult.files) {
        const kindLabel = file.inferredKind
          ? `${file.inferredKind} (${Math.round(file.inferredConfidence * 100)}%)`
          : 'unclassified';
        const sourceLabel = file.sourceType === 'staipler-native' ? '' : ` [${file.sourceType}]`;
        console.log(`    ${file.relativePath}  →  ${kindLabel}${sourceLabel}`);
      }

      // Phase 2: Analyze
      console.log('\n  Analyzing layer coverage...\n');
      const analysis = analyze(scanResult);

      // Display analysis
      console.log(`  Readiness: ${analysis.readinessScore}/100 (${analysis.grade})\n`);
      console.log('  Layer Status:');
      for (const layer of analysis.layers) {
        const icon = layer.status === 'present' ? '✓' : layer.status === 'weak' ? '~' : '✗';
        const color = layer.status === 'present' ? '' : layer.status === 'weak' ? '' : '';
        const importance = layer.importance === 'critical' ? ' [CRITICAL]' : layer.importance === 'recommended' ? '' : ' [optional]';
        console.log(`    ${icon} ${layer.kind.padEnd(12)} ${String(layer.qualityScore).padStart(3)}/100  ${layer.diagnosis}${importance}`);
      }

      if (analysis.criticalIssues.length > 0) {
        console.log('\n  Critical Issues:');
        for (const issue of analysis.criticalIssues) {
          console.log(`    ! ${issue}`);
        }
      }

      // Save scan KPI
      const scanSnapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: analysis.readinessScore,
        grade: analysis.grade,
        layerScores: Object.fromEntries(analysis.layers.map(l => [l.kind, l.qualityScore])),
        action: 'scan',
      };
      saveKpiSnapshot(projectRoot, scanSnapshot);

      if (opts.scanOnly) {
        if (opts.report) {
          const kpiHistory = loadKpiHistory(projectRoot);
          const reportHtml = generateDemoReport(analysis, null, kpiHistory);
          const reportDir = resolve(projectRoot, '.output');
          mkdirSync(reportDir, { recursive: true });
          const reportPath = resolve(reportDir, 'optimize-report.html');
          writeFileSync(reportPath, reportHtml);
          console.log(`  Report: ${reportPath}`);
        }
        console.log('\n  Scan complete. Run without --scan-only to optimize.\n');
        return;
      }

      // Phase 3: Plan
      const { createPlan: plan } = await import('@staipler/core');
      const optimizationPlan = plan(analysis);

      console.log('\n  Optimization Plan:');
      if (optimizationPlan.generate.length > 0) {
        console.log(`    Generate: ${optimizationPlan.generate.map(l => l.kind).join(', ')}`);
      }
      if (optimizationPlan.improve.length > 0) {
        console.log(`    Improve:  ${optimizationPlan.improve.map(l => l.kind).join(', ')}`);
      }
      if (optimizationPlan.keep.filter(k => k.existingContent).length > 0) {
        console.log(`    Keep:     ${optimizationPlan.keep.filter(k => k.existingContent).map(l => l.kind).join(', ')}`);
      }

      if (opts.dryRun) {
        console.log('\n  Dry run complete. Remove --dry-run to execute.\n');
        return;
      }

      if (optimizationPlan.generate.length === 0 && optimizationPlan.improve.length === 0) {
        console.log('\n  Nothing to optimize — your stack looks good!\n');
        return;
      }

      // Phase 4: Optimize
      console.log('\n  Optimizing with AI...\n');
      const result = await optimize(analysis, opts.model, (msg) => {
        console.log(`    ${msg}`);
      });

      // Write optimized assets
      const outDir = resolve(projectRoot, opts.out);
      mkdirSync(outDir, { recursive: true });

      for (const asset of result.assets) {
        const fileName = `${asset.kind}.md`;
        const filePath = resolve(outDir, fileName);
        writeFileSync(filePath, asset.content);
        const actionLabel = asset.action === 'generated' ? '+ NEW' : asset.action === 'improved' ? '↑ IMPROVED' : '= KEPT';
        console.log(`    ${actionLabel}  ${opts.out}/${fileName}`);
      }

      // Save optimization KPI
      const optSnapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: result.afterScore,
        grade: result.afterScore >= 90 ? 'A' : result.afterScore >= 80 ? 'B' : result.afterScore >= 70 ? 'C' : 'D',
        layerScores: Object.fromEntries(result.assets.map(a => [a.kind, a.action === 'kept' ? 70 : 85])),
        action: 'optimize',
        notes: `Before: ${result.beforeScore}, After: ${result.afterScore}`,
      };
      saveKpiSnapshot(projectRoot, optSnapshot);

      console.log(`\n  Optimization complete!`);
      console.log(`  Before: ${result.beforeScore}/100 → After: ${result.afterScore}/100`);
      console.log(`  Assets written to: ${opts.out}/\n`);

      // Generate report if requested
      if (opts.report) {
        const kpiHistory = loadKpiHistory(projectRoot);
        const reportHtml = generateDemoReport(analysis, result, kpiHistory);
        const reportDir = resolve(projectRoot, '.output');
        mkdirSync(reportDir, { recursive: true });
        const reportPath = resolve(reportDir, 'optimize-report.html');
        writeFileSync(reportPath, reportHtml);
        console.log(`  Report: ${reportPath}\n`);
      }

    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
