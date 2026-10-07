import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const skip = new Set(['node_modules', 'dist', 'coverage']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const rootPath = fileURLToPath(root);
const files = await walk(rootPath);
const jsFiles = files.filter(file => extname(file) === '.js' || extname(file) === '.mjs');
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`IDs duplicados: ${[...new Set(duplicates)].join(', ')}`);

const app = await readFile(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const referenced = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const missing = [...new Set(referenced.filter(id => !ids.includes(id)))];
if (missing.length) throw new Error(`IDs referenciados pelo app e ausentes no HTML: ${missing.join(', ')}`);

console.log(`OK: ${jsFiles.length} arquivos JS válidos, ${ids.length} IDs únicos e referências DOM consistentes.`);
