import type { BenchmarkReadyBundle } from '@staipler/core';
import type { SourceRef } from './manifest.js';

export interface RenderedSkill {
  slug: string;
  path: string;
  body: string;
  /** Sources that contributed to the skills layer — surfaced in the manifest for visibility. */
  sources: SourceRef[];
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length === 0 ? 'skill' : base;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return '';
}

function buildSkillFile(name: string, body: string): string {
  const description = firstNonEmptyLine(body).slice(0, 200) || name;
  const fmLines = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
  ];
  return `${fmLines.join('\n')}${body.trim()}\n`;
}

export function renderSkills(input: BenchmarkReadyBundle): RenderedSkill[] {
  const skillsSection = input.bundle.sections.find(s => s.layer === 'skills');
  if (!skillsSection) return [];
  const content = skillsSection.content.trim();
  if (content.length === 0) return [];

  const skillsProvenance = input.bundle.provenance.find(p => p.layer === 'skills');
  const sources: SourceRef[] = (skillsProvenance?.sources ?? []).map(s => ({
    sourceTitle: s.sourceTitle,
    sourceUrl: s.sourceUrl,
    provider: s.provider,
  }));

  const headingRe = /^##\s+(.+?)\s*$/gm;
  const matches: Array<{ name: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(content)) !== null) {
    matches.push({ name: match[1].trim(), start: match.index, end: headingRe.lastIndex });
  }

  if (matches.length === 0) {
    return [
      {
        slug: 'general',
        path: '.claude/skills/general/SKILL.md',
        body: buildSkillFile('general', content),
        sources,
      },
    ];
  }

  const skills: RenderedSkill[] = [];
  const usedSlugs = new Map<string, number>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const bodyStart = m.end;
    const bodyEnd = next ? next.start : content.length;
    const body = content.slice(bodyStart, bodyEnd).trim();
    if (body.length === 0) continue;

    let slug = slugify(m.name);
    const existing = usedSlugs.get(slug);
    if (existing !== undefined) {
      const nextCount = existing + 1;
      usedSlugs.set(slug, nextCount);
      slug = `${slug}-${nextCount}`;
    } else {
      usedSlugs.set(slug, 1);
    }

    skills.push({
      slug,
      path: `.claude/skills/${slug}/SKILL.md`,
      body: buildSkillFile(m.name, body),
      sources,
    });
  }

  if (skills.length === 0) {
    return [
      {
        slug: 'general',
        path: '.claude/skills/general/SKILL.md',
        body: buildSkillFile('general', content),
        sources,
      },
    ];
  }

  return skills;
}
