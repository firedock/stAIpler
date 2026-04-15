import { describe, it, expect } from 'vitest';
import { renderArticle, renderPromptView, type EligibleAtom } from '../../src/lib/knowledge/render';

function atom(overrides: Partial<EligibleAtom> = {}): EligibleAtom {
  return {
    id: 'a-01',
    concept_slug: 'trust-hierarchy',
    atom_type: 'claim',
    content: 'Compiled knowledge never overrides source-grounded context.',
    status: 'stable',
    is_pinned: false,
    source_authority: 'user',
    source_log_ids: [],
    source_document_ids: [],
    ...overrides,
  };
}

describe('render: renderArticle', () => {
  it('produces deterministic, byte-identical output on repeat calls', () => {
    const atoms = [
      atom({ id: 'a-02', atom_type: 'heuristic', content: 'Always ground claims in sources.' }),
      atom({ id: 'a-01' }),
      atom({ id: 'a-03', atom_type: 'decision_note', content: 'Manual promotion to stable.' }),
    ];
    const a = renderArticle('trust-hierarchy', atoms);
    const b = renderArticle('trust-hierarchy', [...atoms].reverse());
    expect(a.body).toEqual(b.body);
    expect(a.atomIds).toEqual(b.atomIds);
  });

  it('assigns sections by atom_type', () => {
    const { body } = renderArticle('x', [
      atom({ id: '1', atom_type: 'claim', content: 'C' }),
      atom({ id: '2', atom_type: 'heuristic', content: 'H' }),
      atom({ id: '3', atom_type: 'question', content: 'Q?' }),
      atom({ id: '4', atom_type: 'decision_note', content: 'D' }),
      atom({ id: '5', atom_type: 'answer', content: 'A' }),
    ]);
    expect(body).toContain('## Summary');
    expect(body).toContain('## Known Heuristics');
    expect(body).toContain('## Open Questions');
    expect(body).toContain('## Key Decisions');
    expect(body).toContain('## Current Understanding');
  });

  it('auto-assembles Evidence from dedup\'d log + document ids', () => {
    const { body } = renderArticle('x', [
      atom({ id: '1', source_log_ids: ['l1', 'l2'], source_document_ids: ['d1'] }),
      atom({ id: '2', source_log_ids: ['l1'], source_document_ids: ['d2'] }),
    ]);
    expect(body).toContain('## Evidence');
    expect(body).toContain('l1, l2');
    expect(body).toContain('d1, d2');
  });

  it('includes no timestamps in body (determinism anchor)', () => {
    const { body } = renderArticle('x', [atom()]);
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('render: renderPromptView', () => {
  it('returns empty for empty input', () => {
    expect(renderPromptView([])).toEqual({ body: '', tokens: 0, atomIds: [] });
  });

  it('groups by concept, sorts concepts and atoms by id', () => {
    const result = renderPromptView([
      atom({ id: 'b-2', concept_slug: 'b', content: 'beta 2' }),
      atom({ id: 'a-1', concept_slug: 'a', content: 'alpha 1' }),
      atom({ id: 'a-2', concept_slug: 'a', content: 'alpha 2' }),
      atom({ id: 'b-1', concept_slug: 'b', content: 'beta 1' }),
    ]);
    const aIdx = result.body.indexOf('[A]');
    const bIdx = result.body.indexOf('[B]');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    // Within A, alpha 1 precedes alpha 2
    expect(result.body.indexOf('alpha 1')).toBeLessThan(result.body.indexOf('alpha 2'));
    expect(result.atomIds).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
  });

  it('is deterministic across permutations', () => {
    const atoms = [
      atom({ id: '1', content: 'one' }),
      atom({ id: '2', content: 'two' }),
      atom({ id: '3', content: 'three' }),
    ];
    const a = renderPromptView(atoms);
    const b = renderPromptView([...atoms].reverse());
    expect(a.body).toBe(b.body);
    expect(a.tokens).toBe(b.tokens);
  });
});
