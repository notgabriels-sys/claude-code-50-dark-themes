#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(sourceRoot, 'pack', 'Mix_Revision_and_Mastering_Handoff_Kit'));
const errors = [];
const ok = (condition, message) => condition ? console.log(`PASS  ${message}`) : errors.push(message);

const templates = path.join(root, 'Templates');
const names = (await readdir(templates)).sort();
ok(names.length === 11, 'exactly 11 editable templates');
ok(names.every((name, i) => name.startsWith(String(i + 1).padStart(2, '0') + '_')), 'templates numbered 01 through 11');

for (const name of names.filter(n => n.endsWith('.csv'))) {
  const rows = (await readFile(path.join(templates, name), 'utf8')).trim().split(/\r?\n/).map(line => line.split(','));
  const width = rows[0].length;
  ok(rows.every(row => row.length === width), `${name} has consistent CSV columns`);
  ok(rows[0].every(Boolean) && new Set(rows[0]).size === width, `${name} has non-empty unique headers`);
}

const requiredHeadings = {
  '01_PROJECT_BRIEF.md': ['# Project Brief', '## Scope', '## Creative direction', '## Technical contract'],
  '04_CONSOLIDATED_FEEDBACK.md': ['# Consolidated Mix Feedback', '## Timestamped requests', '## Conflicts and questions'],
  '05_APPROVAL_RECORD.md': ['# Approval Record', '## Decision', '## Statement'],
  '06_MASTERING_BRIEF.md': ['# Mastering Brief', '## Creative intent', '## Technical destination'],
  '07_DELIVERY_REQUIREMENTS.md': ['# Delivery Requirements', '## Blockers'],
};
for (const [name, headings] of Object.entries(requiredHeadings)) {
  const text = await readFile(path.join(templates, name), 'utf8');
  for (const heading of headings) ok(text.includes(heading), `${name} contains ${heading}`);
}

const manifestPath = path.join(root, 'MANIFEST.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
ok(manifest.files.length === 14, 'manifest covers README, license, guide and 11 templates');
for (const entry of manifest.files) {
  const data = await readFile(path.join(root, entry.path));
  ok(data.length === entry.bytes, `${entry.path} byte count matches manifest`);
  ok(createHash('sha256').update(data).digest('hex') === entry.sha256, `${entry.path} checksum matches manifest`);
}

const guide = path.join(root, 'Mix_Revision_and_Mastering_Handoff_Guide.pdf');
const pdfinfo = spawnSync('pdfinfo', [guide], { encoding: 'utf8' });
ok(pdfinfo.status === 0, 'guide PDF is readable');
const pages = Number(pdfinfo.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
ok(pages === 7, 'guide PDF contains 7 pages');
const pdftotext = spawnSync('pdftotext', [guide, '-'], { encoding: 'utf8' });
ok(pdftotext.status === 0, 'guide text extracts successfully');
for (const phrase of ['The control loop', 'Revisions and version identity', 'Approval and mastering handoff', 'Export, QC and delivery', 'not a legal contract']) {
  ok(pdftotext.stdout.includes(phrase), `guide contains “${phrase}”`);
}

for (const required of ['README.txt', 'LICENSE.txt', 'MANIFEST.json']) {
  ok((await stat(path.join(root, required))).isFile(), `${required} exists`);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL  ${error}`);
  console.error(`\n${errors.length} validation failure(s)`);
  process.exit(1);
}
console.log('\nALL PACKAGE CHECKS PASSED');
