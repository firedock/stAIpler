import { describe, it, expect } from 'vitest';
import { renderSkills } from '../src/render-skills.js';
import { makeReadyBundle } from './fixtures.js';

describe('renderSkills', () => {
  it('splits multi-skill content into one file per ## heading', () => {
    const skills = renderSkills(makeReadyBundle());
    expect(skills).toHaveLength(2);
    expect(skills[0].slug).toBe('triage');
    expect(skills[0].path).toBe('.claude/skills/triage/SKILL.md');
    expect(skills[1].slug).toBe('commit');
    expect(skills[0].body).toContain('name: Triage');
    expect(skills[0].body).toContain('When a test fails');
    expect(skills[1].body).toContain('Never force-push to main.');
  });

  it('falls back to a single general skill when there are no ## headings', () => {
    const bundle = makeReadyBundle();
    bundle.bundle.sections = bundle.bundle.sections.map(s =>
      s.layer === 'skills'
        ? { ...s, content: 'Follow the triage workflow on every failure.' }
        : s,
    );
    const skills = renderSkills(bundle);
    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe('general');
    expect(skills[0].path).toBe('.claude/skills/general/SKILL.md');
    expect(skills[0].body).toContain('name: general');
  });

  it('returns an empty list when the skills section is absent or empty', () => {
    const bundle = makeReadyBundle();
    bundle.bundle.sections = bundle.bundle.sections.filter(s => s.layer !== 'skills');
    expect(renderSkills(bundle)).toEqual([]);
  });

  it('disambiguates duplicate slugs with numeric suffixes', () => {
    const bundle = makeReadyBundle();
    bundle.bundle.sections = bundle.bundle.sections.map(s =>
      s.layer === 'skills'
        ? { ...s, content: '## Deploy\n\nFirst.\n\n## Deploy\n\nSecond.' }
        : s,
    );
    const skills = renderSkills(bundle);
    expect(skills.map(s => s.slug)).toEqual(['deploy', 'deploy-2']);
  });
});
