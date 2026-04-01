import matter from 'gray-matter';
import { AssetFrontmatterSchema } from './schema.js';
import { ParseError } from './errors.js';
import type { Asset } from './types.js';

export function parseAssetFile(filePath: string, content: string): Asset {
  if (!content.trimStart().startsWith('---')) {
    throw new ParseError('No frontmatter delimiters found', filePath);
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (err) {
    throw new ParseError(
      `Failed to parse frontmatter: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  const result = AssetFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new ParseError(`Invalid frontmatter: ${issues.join(', ')}`, filePath);
  }

  return {
    frontmatter: result.data,
    body: parsed.content.trim(),
    source: filePath,
    resolvedPath: filePath,
    format: 'native',
  };
}
