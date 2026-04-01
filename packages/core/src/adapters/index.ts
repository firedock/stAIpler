import type { Asset } from '../types.js';

export interface Adapter {
  name: string;
  canHandle(filePath: string, content: string): boolean;
  parse(filePath: string, content: string): Asset;
}
