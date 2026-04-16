import { describe, it, expect } from 'vitest';
import { pickRule, type CandidateAtom } from '../../src/lib/knowledge/promote';

function atom(overrides: Partial<CandidateAtom> = {}): CandidateAtom {
  return {
    id: 'a1',
    project_id: 'p1',
    status: 'candidate',
    source_authority: 'assistant',
    reinforcement_count: 0,
    distinct_session_count: 1,
    authority_breakdown: null,
    ...overrides,
  };
}

describe('promote: pickRule', () => {
  it('promotes user-authority candidates', () => {
    expect(pickRule(atom({ source_authority: 'user' }))).toBe('user_authority');
  });

  it('promotes source-document-authority candidates', () => {
    expect(pickRule(atom({ source_authority: 'source_document' }))).toBe('source_document_authority');
  });

  it('does NOT promote assistant-only candidates with no reinforcement', () => {
    expect(pickRule(atom({ source_authority: 'assistant' }))).toBeNull();
  });

  it('promotes assistant-only candidates once reinforcement + sessions >= 3', () => {
    expect(
      pickRule(atom({ source_authority: 'assistant', reinforcement_count: 2, distinct_session_count: 1 })),
    ).toBe('reinforced_threshold');
  });

  it('does not promote non-candidates', () => {
    expect(pickRule(atom({ status: 'provisional', source_authority: 'user' }))).toBeNull();
    expect(pickRule(atom({ status: 'stable', source_authority: 'user' }))).toBeNull();
  });

  it('promotes mixed authority only when assistant weight is zero', () => {
    expect(
      pickRule(atom({ source_authority: 'mixed', authority_breakdown: { user: 1, assistant: 0 } })),
    ).toBe('mixed_no_assistant');
    expect(
      pickRule(atom({ source_authority: 'mixed', authority_breakdown: { user: 0.5, assistant: 0.5 } })),
    ).toBeNull();
  });

  it('never returns stable — system rules cap at provisional', () => {
    // Every possible rule outcome is a string name (or null); none of them
    // is "stable". This test is a contract anchor: if a future rule ever
    // returns a status here, this assertion will catch it.
    const outcomes = [
      pickRule(atom({ source_authority: 'user' })),
      pickRule(atom({ source_authority: 'source_document' })),
      pickRule(atom({ source_authority: 'assistant', reinforcement_count: 5 })),
      pickRule(atom({ source_authority: 'mixed', authority_breakdown: { user: 1, assistant: 0 } })),
    ];
    for (const o of outcomes) {
      expect(o).not.toBe('stable');
    }
  });
});
