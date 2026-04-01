import type { Adapter } from './index.js';
import { parseAssetFile } from '../parser.js';

export const nativeAdapter: Adapter = {
  name: 'native',
  canHandle(filePath: string, content: string): boolean {
    return content.trimStart().startsWith('---') && filePath.endsWith('.md');
  },
  parse(filePath: string, content: string) {
    return parseAssetFile(filePath, content);
  },
};
