import type { Adapter } from './index.js';
import type { Asset } from '../types.js';
import matter from 'gray-matter';

export const skillAdapter: Adapter = {
  name: 'skill',
  canHandle(filePath: string, content: string): boolean {
    return filePath.toUpperCase().includes('SKILL.MD') ||
      (content.trimStart().startsWith('---') && content.includes('skill_name:'));
  },
  parse(filePath: string, content: string): Asset {
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;

    return {
      frontmatter: {
        id: (data.skill_name as string) ?? 'imported.skill',
        kind: 'skills',
        version: (data.version as string) ?? '1.0.0',
        title: (data.title as string) ?? (data.skill_name as string) ?? 'Imported Skill',
        summary: data.description as string | undefined,
        tags: data.tags as string[] | undefined,
        priority: 50,
      },
      body: parsed.content.trim(),
      source: filePath,
      resolvedPath: filePath,
      format: 'imported',
    };
  },
};
