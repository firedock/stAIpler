import { createHash } from 'crypto';
import type { BenchmarkReadyBundle, CompiledInstructionBundle, LayerType, SectionProvenance } from '@staipler/core';

export function makeBundle(overrides?: Partial<CompiledInstructionBundle>): CompiledInstructionBundle {
  const sections = overrides?.sections ?? [
    { layer: 'identity' as LayerType, content: 'You are a focused code-review assistant.', status: 'source-grounded' as const },
    { layer: 'constraints' as LayerType, content: 'Do not modify files outside packages/core.', status: 'source-grounded' as const },
    { layer: 'context' as LayerType, content: 'This is a pnpm monorepo with three packages.', status: 'source-grounded' as const },
    { layer: 'skills' as LayerType, content: '## Triage\n\nWhen a test fails, identify the root cause first.\n\n## Commit\n\nNever force-push to main.', status: 'mixed' as const },
  ];
  const provenance: SectionProvenance[] = overrides?.provenance ?? sections.map(s => ({
    layer: s.layer,
    sources: [
      {
        sourceTitle: `docs/${s.layer}.md`,
        sourceUrl: null,
        provider: 'filesystem',
        span: null,
        importedAt: '2026-04-20T00:00:00.000Z',
        extractedAt: '2026-04-20T00:00:00.000Z',
      },
    ],
  }));
  const systemPrompt = sections.map(s => `## ${s.layer[0].toUpperCase() + s.layer.slice(1)}\n\n${s.content}`).join('\n\n');
  const hash = createHash('sha256').update(systemPrompt).digest('hex');
  return {
    systemPrompt,
    hash,
    sections,
    provenance,
    conflicts: [],
    gaps: [],
    metadata: {
      tokenEstimate: Math.ceil(systemPrompt.length / 4),
      sourceDocumentCount: 1,
      layerCandidateCount: sections.length,
      compiledAt: '2026-04-20T00:00:00.000Z',
    },
    ...overrides,
  };
}

export function makeReadyBundle(overrides?: Partial<BenchmarkReadyBundle>): BenchmarkReadyBundle {
  return {
    bundle: makeBundle(),
    coverage: {
      present: ['constraints', 'context', 'identity', 'skills'],
      weak: [],
      missing: ['evals', 'examples', 'goals', 'memory', 'policies', 'prompts', 'style', 'tools'],
      readinessScore: 55,
      grade: 'F',
      qualityScores: {},
    },
    contract_version: 1,
    ...overrides,
  };
}
