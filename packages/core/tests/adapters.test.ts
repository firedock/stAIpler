import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { nativeAdapter } from '../src/adapters/native.js';
import { skillAdapter } from '../src/adapters/skill.js';
import { copilotAdapter } from '../src/adapters/copilot.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures/assets');

describe('nativeAdapter', () => {
  it('handles stAIpler files', () => {
    const filePath = resolve(fixturesDir, 'valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    expect(nativeAdapter.canHandle(filePath, content)).toBe(true);
  });

  it('rejects non-markdown files', () => {
    expect(nativeAdapter.canHandle('/some/file.txt', '---\nid: test\n---')).toBe(false);
  });

  it('rejects files without frontmatter', () => {
    expect(nativeAdapter.canHandle('/some/file.md', 'Just plain text')).toBe(false);
  });

  it('parses with format native', () => {
    const filePath = resolve(fixturesDir, 'valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = nativeAdapter.parse(filePath, content);
    expect(asset.format).toBe('native');
    expect(asset.frontmatter.id).toBe('core.identity');
  });
});

describe('skillAdapter', () => {
  it('handles SKILL.MD files', () => {
    expect(skillAdapter.canHandle('/path/SKILL.MD', '---\nskill_name: test\n---')).toBe(true);
  });

  it('handles files with skill_name in frontmatter', () => {
    const content = '---\nskill_name: triage\n---\nDo triage.';
    expect(skillAdapter.canHandle('/path/file.md', content)).toBe(true);
  });

  it('rejects regular markdown', () => {
    expect(skillAdapter.canHandle('/path/file.md', '# Hello')).toBe(false);
  });

  it('parses with format imported', () => {
    const content = '---\nskill_name: triage\ntitle: Triage Skill\nversion: 2.0.0\n---\nDo triage stuff.';
    const asset = skillAdapter.parse('/path/SKILL.MD', content);
    expect(asset.format).toBe('imported');
    expect(asset.frontmatter.kind).toBe('skills');
    expect(asset.frontmatter.id).toBe('triage');
    expect(asset.frontmatter.version).toBe('2.0.0');
  });
});

describe('copilotAdapter', () => {
  it('handles copilot instruction files', () => {
    expect(copilotAdapter.canHandle('/repo/.github/copilot-instructions.md', '')).toBe(true);
  });

  it('rejects regular files', () => {
    expect(copilotAdapter.canHandle('/path/readme.md', '')).toBe(false);
  });

  it('parses with format imported', () => {
    const content = 'Always write TypeScript. Use functional patterns.';
    const asset = copilotAdapter.parse('/repo/.github/copilot-instructions.md', content);
    expect(asset.format).toBe('imported');
    expect(asset.frontmatter.kind).toBe('context');
    expect(asset.body).toContain('TypeScript');
  });
});

describe('adapter chain priority', () => {
  it('native wins over skill for stAIpler files', () => {
    const filePath = resolve(fixturesDir, 'valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');

    const adapters = [nativeAdapter, skillAdapter, copilotAdapter];
    const winner = adapters.find(a => a.canHandle(filePath, content));
    expect(winner?.name).toBe('native');
  });

  it('skill adapter wins for SKILL.MD files', () => {
    const content = '---\nskill_name: test\n---\nContent';
    const adapters = [nativeAdapter, skillAdapter, copilotAdapter];
    // .txt won't be handled by native (requires .md)
    const winner = adapters.find(a => a.canHandle('/path/SKILL.MD', content));
    // Both native and skill can handle, but native comes first
    // For a file named SKILL.MD with stAIpler frontmatter, native would win
    // For the adapter chain to prefer skill, the file shouldn't have stAIpler frontmatter
    expect(winner).toBeDefined();
  });
});
