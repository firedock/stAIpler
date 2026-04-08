import { describe, it, expect } from 'vitest';
import {
  AssetFrontmatterSchema,
  StackDefinitionSchema,
  LAYER_TYPES,
  STATIC_LAYER_TYPES,
  RUNTIME_LAYER_TYPES,
  REQUIRED_LAYER_TYPES,
  DEFAULT_MERGE_STRATEGIES,
} from '../src/schema.js';

describe('AssetFrontmatterSchema', () => {
  const validFrontmatter = {
    id: 'core.identity',
    kind: 'identity',
    version: '1.0.0',
    title: 'Core Identity',
  };

  it('parses valid identity frontmatter', () => {
    const result = AssetFrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('core.identity');
      expect(result.data.kind).toBe('identity');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.title).toBe('Core Identity');
    }
  });

  it('parses valid skills frontmatter with optional fields', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      kind: 'skills',
      tags: ['support'],
      inputs: ['customer_message'],
      outputs: ['category', 'priority'],
      summary: 'Triage skills',
      compatibility: {
        models: ['anthropic', 'openai'],
        surfaces: ['api'],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(['support']);
      expect(result.data.inputs).toEqual(['customer_message']);
      expect(result.data.outputs).toEqual(['category', 'priority']);
      expect(result.data.compatibility?.models).toEqual(['anthropic', 'openai']);
    }
  });

  it('rejects missing id', () => {
    const { id, ...noId } = validFrontmatter;
    const result = AssetFrontmatterSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('rejects missing kind', () => {
    const { kind, ...noKind } = validFrontmatter;
    const result = AssetFrontmatterSchema.safeParse(noKind);
    expect(result.success).toBe(false);
  });

  it('rejects missing version', () => {
    const { version, ...noVersion } = validFrontmatter;
    const result = AssetFrontmatterSchema.safeParse(noVersion);
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const { title, ...noTitle } = validFrontmatter;
    const result = AssetFrontmatterSchema.safeParse(noTitle);
    expect(result.success).toBe(false);
  });

  it('rejects invalid kind', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      kind: 'personality',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid semver', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      version: '1.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects priority below 0', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      priority: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects priority above 100', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      priority: 150,
    });
    expect(result.success).toBe(false);
  });

  it('defaults priority to 50', () => {
    const result = AssetFrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(50);
    }
  });

  it('accepts valid dot-notation id', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      id: 'support.skills.triage',
    });
    expect(result.success).toBe(true);
  });

  it('accepts compatibility fields as optional', () => {
    const result = AssetFrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compatibility).toBeUndefined();
    }
  });

  it('accepts inherits field', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      inherits: 'core.base-identity',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inherits).toBe('core.base-identity');
    }
  });

  it('accepts sources array', () => {
    const result = AssetFrontmatterSchema.safeParse({
      ...validFrontmatter,
      sources: [{ type: 'url', ref: 'https://example.com' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('StackDefinitionSchema', () => {
  const validStack = {
    name: 'customer-support',
    version: '1.0.0',
    description: 'Customer support stack',
    includes: [{ asset: 'core/identity' }],
  };

  it('parses valid stack definition', () => {
    const result = StackDefinitionSchema.safeParse(validStack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('customer-support');
      expect(result.data.includes).toHaveLength(1);
    }
  });

  it('rejects missing name', () => {
    const { name, ...noName } = validStack;
    const result = StackDefinitionSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it('rejects missing includes', () => {
    const { includes, ...noIncludes } = validStack;
    const result = StackDefinitionSchema.safeParse(noIncludes);
    expect(result.success).toBe(false);
  });

  it('rejects empty includes array', () => {
    const result = StackDefinitionSchema.safeParse({
      ...validStack,
      includes: [],
    });
    expect(result.success).toBe(false);
  });

  it('parses stack with build config', () => {
    const result = StackDefinitionSchema.safeParse({
      ...validStack,
      build: {
        max_tokens: 8000,
        merge: { skills: 'last-wins' },
        target: { modelFamily: 'anthropic' },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.build?.max_tokens).toBe(8000);
      expect(result.data.build?.merge?.skills).toBe('last-wins');
      expect(result.data.build?.target?.modelFamily).toBe('anthropic');
    }
  });

  it('rejects invalid merge strategy', () => {
    const result = StackDefinitionSchema.safeParse({
      ...validStack,
      build: {
        merge: { skills: 'blend' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('parses partial compile target', () => {
    const result = StackDefinitionSchema.safeParse({
      ...validStack,
      build: {
        target: { modelFamily: 'anthropic' },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.build?.target?.surface).toBeUndefined();
    }
  });

  it('parses asset reference with priority override', () => {
    const result = StackDefinitionSchema.safeParse({
      ...validStack,
      includes: [{ asset: 'core/identity', priority: 90 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includes[0].priority).toBe(90);
    }
  });
});

describe('Constants', () => {
  it('LAYER_TYPES includes all static and runtime types', () => {
    expect(LAYER_TYPES).toEqual([
      'constraints', 'context', 'evals', 'examples',
      'goals', 'identity', 'memory', 'policies',
      'prompts', 'skills', 'style', 'tools',
    ]);
  });

  it('REQUIRED_LAYER_TYPES is identity and constraints', () => {
    expect(REQUIRED_LAYER_TYPES).toEqual(['identity', 'constraints']);
  });

  it('DEFAULT_MERGE_STRATEGIES has correct defaults', () => {
    expect(DEFAULT_MERGE_STRATEGIES.identity).toBe('last-wins');
    expect(DEFAULT_MERGE_STRATEGIES.goals).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.context).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.constraints).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.skills).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.style).toBe('last-wins');
    expect(DEFAULT_MERGE_STRATEGIES.examples).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.tools).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.policies).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.evals).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.prompts).toBe('concatenate');
    expect(DEFAULT_MERGE_STRATEGIES.memory).toBe('concatenate');
  });
});
