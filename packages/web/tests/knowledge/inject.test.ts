import { describe, it, expect } from 'vitest';
import { classifyExclusion, type InjectAtomRow } from '../../src/lib/knowledge/inject';

function atom(overrides: Partial<InjectAtomRow> = {}): InjectAtomRow {
  return {
    id: 'a1',
    status: 'candidate',
    source_authority: 'assistant',
    review_state: 'pending',
    is_pinned: false,
    reinforcement_count: 0,
    distinct_session_count: 0,
    superseded_by: null,
    content: 'hello',
    ...overrides,
  };
}

describe('inject: classifyExclusion', () => {
  it('candidate in review queue → pending_review', () => {
    expect(classifyExclusion(atom({ review_state: 'pending' }))).toBe('pending_review');
  });

  it('candidate with assistant-only authority and no reinforcement → low_authority', () => {
    expect(
      classifyExclusion(atom({ review_state: 'approved', source_authority: 'assistant' })),
    ).toBe('low_authority');
  });

  it('candidate with user authority (post-review) → status_below_threshold', () => {
    // (In practice this should have been auto-promoted; this case protects
    // against ordering bugs in the promote stage.)
    expect(
      classifyExclusion(atom({ review_state: 'approved', source_authority: 'user' })),
    ).toBe('status_below_threshold');
  });

  it('provisional without pin → status_below_threshold', () => {
    expect(classifyExclusion(atom({ status: 'provisional' }))).toBe('status_below_threshold');
  });

  it('provisional with pin → token_budget (treated as eligible-but-unrendered)', () => {
    expect(
      classifyExclusion(atom({ status: 'provisional', is_pinned: true })),
    ).toBe('token_budget');
  });

  it('contradicted → contradicted', () => {
    expect(classifyExclusion(atom({ status: 'contradicted' }))).toBe('contradicted');
  });

  it('deprecated with superseded_by → superseded', () => {
    expect(
      classifyExclusion(atom({ status: 'deprecated', superseded_by: 'peer' })),
    ).toBe('superseded');
  });

  it('deprecated without superseder → null (skip entirely)', () => {
    expect(classifyExclusion(atom({ status: 'deprecated' }))).toBeNull();
  });

  it('stable not in prompt view → token_budget', () => {
    expect(classifyExclusion(atom({ status: 'stable' }))).toBe('token_budget');
  });
});
