import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AssetFrontmatterSchema, StackDefinitionSchema } from '../packages/core/src/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, '..', 'schemas');
mkdirSync(schemasDir, { recursive: true });

const assetSchema = zodToJsonSchema(AssetFrontmatterSchema, 'AssetFrontmatter');
writeFileSync(
  resolve(schemasDir, 'asset-frontmatter.json'),
  JSON.stringify(assetSchema, null, 2) + '\n',
);

const stackSchema = zodToJsonSchema(StackDefinitionSchema, 'StackDefinition');
writeFileSync(
  resolve(schemasDir, 'stack-definition.json'),
  JSON.stringify(stackSchema, null, 2) + '\n',
);

console.log('Generated schemas in schemas/');
