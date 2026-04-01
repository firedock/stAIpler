import type { Adapter } from './index.js';
import type { Asset } from '../types.js';

export const copilotAdapter: Adapter = {
  name: 'copilot',
  canHandle(filePath: string, _content: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.includes('.github/copilot') ||
      lower.endsWith('copilot-instructions.md');
  },
  parse(filePath: string, content: string): Asset {
    return {
      frontmatter: {
        id: 'imported.copilot',
        kind: 'context',
        version: '1.0.0',
        title: 'Copilot Instructions',
        priority: 50,
      },
      body: content.trim(),
      source: filePath,
      resolvedPath: filePath,
      format: 'imported',
    };
  },
};
