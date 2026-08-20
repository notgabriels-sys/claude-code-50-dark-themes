#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const packRoot = path.join(root, 'pack');
const customer = path.join(packRoot, 'Mix_Revision_and_Mastering_Handoff_Kit');
const pythonCandidates = [
  process.env.MRH_PYTHON,
  '/Users/notgabriels/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12',
  'python3',
].filter(Boolean);

const python = pythonCandidates.find((candidate) => {
  const probe = spawnSync(candidate, ['-c', 'import reportlab'], { stdio: 'ignore' });
  return probe.status === 0;
});
if (!python) {
  throw new Error('No Python interpreter with ReportLab is available. Set MRH_PYTHON to one that has reportlab installed.');
}

await rm(packRoot, { recursive: true, force: true });
await mkdir(path.join(customer, 'Templates'), { recursive: true });
await cp(path.join(root, 'templates'), path.join(customer, 'Templates'), { recursive: true });
await cp(path.join(root, 'worked-example'), path.join(customer, 'Worked_Example'), { recursive: true });
await cp(path.join(root, 'README.txt'), path.join(customer, 'README.txt'));
await cp(path.join(root, 'LICENSE.txt'), path.join(customer, 'LICENSE.txt'));

const guide = path.join(customer, 'Mix_Revision_and_Mastering_Handoff_Guide.pdf');
const built = spawnSync(python, [path.join(root, 'build-guide.py'), guide], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

async function walk(dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const absolute = path.join(dir, name);
    const info = await stat(absolute);
    if (info.isDirectory()) out.push(...await walk(absolute));
    else out.push(absolute);
  }
  return out;
}

const files = await walk(customer);
const manifest = [];
for (const absolute of files) {
  const data = await readFile(absolute);
  manifest.push({
    path: path.relative(customer, absolute).split(path.sep).join('/'),
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}
await writeFile(path.join(customer, 'MANIFEST.json'), JSON.stringify({
  product: 'Mix Revision & Mastering Handoff Kit',
  version: '1.1',
  creator: 'Gabriel Garcia Alonso / Hologram People',
  scope: 'Eleven blank templates, one completed fictional worked example and one workflow guide',
  files: manifest,
}, null, 2) + '\n');
console.log(customer);
