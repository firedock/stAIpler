import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { compile } from '../src/compiler.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

describe('compiler', () => {
  describe('basic compilation', () => {
    it('compiles basic-stack successfully', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.stackId).toBe('basic-stack');
      expect(bundle.version).toBe('1.0.0');
      expect(bundle.fullText).toBeTruthy();
      expect(bundle.sections.length).toBeGreaterThan(0);
    });

    it('hash is SHA-256 of fullText', () => {
      const bundle = compile('basic-stack', fixturesDir);
      const expected = createHash('sha256').update(bundle.fullText).digest('hex');
      expect(bundle.hash).toBe(expected);
    });

    it('token estimate calculated', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.metadata.tokenEstimate).toBe(Math.ceil(bundle.fullText.length / 4));
    });

    it('sections in canonical order', () => {
      const bundle = compile('basic-stack', fixturesDir);
      const kinds = bundle.sections.map(s => s.kind);
      const canonical = ['constraints', 'context', 'evals', 'examples', 'goals', 'identity', 'memory', 'policies', 'prompts', 'skills', 'style', 'tools'];
      const filtered = canonical.filter(k => kinds.includes(k as any));
      expect(kinds).toEqual(filtered);
    });

    it('buildConfig on bundle top-level', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.buildConfig).toBeDefined();
    });

    it('compileOrder matches applied assets', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.compileOrder.length).toBeGreaterThan(0);
      expect(bundle.compileOrder).toContain('core.identity');
    });

    it('sources lists all file paths', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.metadata.sources.length).toBeGreaterThan(0);
      expect(bundle.metadata.sources.every(s => s.endsWith('.md'))).toBe(true);
    });

    it('assetCount correct', () => {
      const bundle = compile('basic-stack', fixturesDir);
      expect(bundle.metadata.assetCount).toBe(bundle.sections.length);
    });

    it('non-memory sections not injectable', () => {
      const bundle = compile('basic-stack', fixturesDir);
      const nonMemory = bundle.sections.filter(s => s.kind !== 'memory');
      expect(nonMemory.every(s => s.runtimeInjectable === false)).toBe(true);
    });
  });

  describe('inheritance', () => {
    it('inherited asset included in resolvedAssets', () => {
      const bundle = compile('inherited-stack', fixturesDir);
      const inherited = bundle.resolvedAssets.find(a => a.id === 'core.base-identity');
      expect(inherited).toBeDefined();
      expect(inherited!.inherited).toBe(true);
    });

    it('inherited parent in compileOrder', () => {
      const bundle = compile('inherited-stack', fixturesDir);
      expect(bundle.compileOrder).toContain('core.base-identity');
    });

    it('parent body prepended', () => {
      const bundle = compile('inherited-stack', fixturesDir);
      const identitySection = bundle.sections.find(s => s.kind === 'identity');
      expect(identitySection).toBeDefined();
      expect(identitySection!.content).toContain('stAIpler framework');
      expect(identitySection!.content).toContain('customer support');
    });
  });

  describe('target filtering', () => {
    it('filters incompatible asset with warning', () => {
      const bundle = compile('filtered-stack', fixturesDir);
      const warning = bundle.warnings.find(w => w.code === 'FILTERED_ASSET');
      expect(warning).toBeDefined();
      expect(warning!.asset).toContain('support.skills');
    });

    it('filtered asset not in sections', () => {
      const bundle = compile('filtered-stack', fixturesDir);
      const skillSection = bundle.sections.find(s => s.id === 'support.skills');
      expect(skillSection).toBeUndefined();
    });

    it('critical filter = build error', () => {
      expect(() => compile('critical-filter-fail', fixturesDir)).toThrow(/CRITICAL_LAYER_REMOVED/);
    });
  });

  describe('contracts', () => {
    it('contract results in bundle', () => {
      const bundle = compile('contracted-stack', fixturesDir);
      const userContract = bundle.contractResults.find(c => c.contract === 'user:support-agent');
      expect(userContract).toBeDefined();
      expect(userContract!.passed).toBe(true);
    });

    it('contract failure in bundle', () => {
      const bundle = compile('contract-fail', fixturesDir);
      const userContract = bundle.contractResults.find(c => c.contract === 'user:support-agent');
      expect(userContract).toBeDefined();
      expect(userContract!.passed).toBe(false);
    });
  });

  describe('merge', () => {
    it('merge override applied', () => {
      const bundle = compile('merge-override', fixturesDir);
      const skillSections = bundle.sections.filter(s => s.kind === 'skills');
      expect(skillSections).toHaveLength(1);
      expect(skillSections[0].id).toBe('support.skills.advanced');
    });
  });

  describe('memory', () => {
    it('memory section has runtimeInjectable: true', () => {
      const bundle = compile('memory-section', fixturesDir);
      const memorySection = bundle.sections.find(s => s.kind === 'memory');
      expect(memorySection).toBeDefined();
      expect(memorySection!.runtimeInjectable).toBe(true);
    });
  });

  describe('error cases', () => {
    it('missing ref = clear error', () => {
      expect(() => compile('missing-ref', fixturesDir)).toThrow(/not found/i);
    });

    it('circular inherit = clear error', () => {
      expect(() => compile('circular-inherit', fixturesDir)).toThrow(/circular/i);
    });

    it('deep inherit = clear error', () => {
      expect(() => compile('deep-inherit', fixturesDir)).toThrow(/depth|max/i);
    });
  });
});
