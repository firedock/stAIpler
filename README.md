# stAIpler

An open contract and delivery system for AI instruction layers.

stAIpler standardizes how markdown-based instruction assets (identity, skills, context, constraints, style, memory) are described, composed, versioned, and compiled into runtime packages for apps and agents.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Validate all stacks
node packages/cli/dist/index.js validate

# Compile a stack
node packages/cli/dist/index.js build customer-support --format text

# Output as JSON with full provenance
node packages/cli/dist/index.js build customer-support

# Run tests
pnpm test
```

## Concepts

| Concept | Definition |
|---------|------------|
| **Asset** | One markdown instruction file + frontmatter metadata. The atomic unit. |
| **Stack** | A deployment recipe (`stack.yaml`) that references assets by path. |
| **Compiled Bundle** | The resolved runtime artifact: final text + sections + provenance. |
| **Contract** | Optional structural constraint that validates asset sets. |

## Project Structure

```
staipler/
├── packages/
│   ├── core/          # @staipler/core - types, schemas, parser, compiler
│   └── cli/           # @staipler/cli - build + validate commands
├── library/           # Reusable instruction assets
├── stacks/            # Deployment recipes (stack.yaml)
├── contracts/         # User-authored structural constraints
├── schemas/           # Generated JSON schemas
└── diagrams/          # Mermaid architecture diagrams
```

## Asset Format

Assets are markdown files with YAML frontmatter:

```markdown
---
id: support.skills.triage
kind: skills
version: 1.0.0
title: Triage Skills
tags: [support]
compatibility:
  models: [anthropic, openai]
priority: 60
---

Classify incoming messages into: billing, technical, account, general.
```

**Layer types:** identity, goals, context, constraints, skills, style, examples, tools, memory

## Stack Format

Stacks reference assets and configure compilation:

```yaml
name: customer-support
version: 1.0.0
description: Customer support agent
includes:
  - asset: core/identity          # from library/
  - asset: core/safety
  - asset: support/skills
  - asset: ./local-override.md    # stack-local file
build:
  max_tokens: 8000
  merge:
    skills: last-wins
  target:
    modelFamily: anthropic
```

## Contracts

Contracts define structural requirements for asset sets:

```yaml
name: support-agent
scope: asset-set
applies_to:
  tags: [support]
requires:
  must_have_kinds: [skills, context, constraints]
  all_must_declare:
    compatibility:
      models: [anthropic]
```

## Sample Output

```bash
$ node packages/cli/dist/index.js build customer-support --format text

## Core Identity
You are an AI assistant powered by the stAIpler instruction framework...

## Support Context
You operate in a customer support environment...

## Safety Constraints
- Never generate harmful, illegal, or deceptive content...

## Support Skills
Classify incoming messages into: billing, technical, account, general...
```

## SDK Usage

```typescript
import { buildStack, parseAsset, validateStack } from '@staipler/core';

const bundle = buildStack('customer-support', stacksDir, {
  libraryDir: '/path/to/library',
  contractsDir: '/path/to/contracts',
});

console.log(bundle.fullText);        // compiled instruction text
console.log(bundle.hash);            // SHA-256 content hash
console.log(bundle.sections);        // individual compiled sections
console.log(bundle.contractResults); // validation results
```

## Architecture

See [diagrams/](diagrams/) for Mermaid architecture diagrams covering:
- Full system pipeline
- Asset reference resolution
- Two-layer validation model
- Compiled bundle structure

## License

See [LICENSE](LICENSE) for details.
