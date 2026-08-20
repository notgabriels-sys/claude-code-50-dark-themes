#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const rootArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const archiveReopen = Boolean(rootArgument);
const root = path.resolve(rootArgument || path.join(sourceRoot, 'pack', 'Mix_Revision_and_Mastering_Handoff_Kit'));
const errors = [];
const passes = [];
const ok = (condition, message) => {
  if (condition) {
    passes.push(message);
    console.log(`PASS  ${message}`);
  } else {
    errors.push(message);
  }
};

const templateNames = [
  '01_PROJECT_BRIEF.md',
  '02_REFERENCE_TRACK_LOG.csv',
  '03_MIX_REVISION_LOG.csv',
  '04_CONSOLIDATED_FEEDBACK.md',
  '05_APPROVAL_RECORD.md',
  '06_MASTERING_BRIEF.md',
  '07_DELIVERY_REQUIREMENTS.md',
  '08_EXPORT_MATRIX.csv',
  '09_FILENAME_BUILDER.csv',
  '10_FINAL_QC_CHECKLIST.txt',
  '11_DELIVERY_MANIFEST.csv',
];
const csvNames = templateNames.filter((name) => name.endsWith('.csv'));
const expectedManifestPaths = [
  'LICENSE.txt',
  'Mix_Revision_and_Mastering_Handoff_Guide.pdf',
  'README.txt',
  ...templateNames.map((name) => `Templates/${name}`),
  'Worked_Example/README_EXAMPLE.txt',
  ...templateNames.map((name) => `Worked_Example/${name}`),
].sort();
const expectedCustomerPaths = [...expectedManifestPaths, 'MANIFEST.json'].sort();

async function walk(directory, relativeRoot = directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relativePath = path.relative(relativeRoot, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink()) {
      errors.push(`Symbolic links are not allowed in the customer package: ${relativePath}`);
    } else if (entry.isDirectory()) {
      files.push(...await walk(absolute, relativeRoot));
    } else if (entry.isFile()) {
      files.push(absolute);
    } else {
      errors.push(`Unsupported filesystem entry in customer package: ${relativePath}`);
    }
  }
  return files;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readPngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('invalid PNG signature');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

let customerFiles = [];
try {
  customerFiles = await walk(root);
} catch (error) {
  errors.push(`Customer package root could not be read: ${error.message}`);
}
const customerPaths = customerFiles.map((absolute) => path.relative(root, absolute).split(path.sep).join('/')).sort();
ok(sameStringArray(customerPaths, expectedCustomerPaths), 'customer package contains the exact expected 27 files');
for (const customerPath of customerPaths) {
  ok(!customerPath.split('/').some((part) => part.startsWith('.')), `${customerPath} is not hidden metadata`);
  ok(!customerPath.includes('..') && !path.isAbsolute(customerPath), `${customerPath} is a safe relative path`);
}

for (const folder of ['Templates', 'Worked_Example']) {
  let names = [];
  try {
    names = (await readdir(path.join(root, folder))).filter((name) => name !== 'README_EXAMPLE.txt').sort();
  } catch (error) {
    errors.push(`${folder} could not be read: ${error.message}`);
  }
  ok(sameStringArray(names, templateNames), `${folder} contains exactly the eleven numbered workflow files`);
}

for (const folder of ['Templates', 'Worked_Example']) {
  for (const name of csvNames) {
    try {
      const rows = parseCsv(await readFile(path.join(root, folder, name), 'utf8'));
      const width = rows[0]?.length || 0;
      ok(rows.length >= 2, `${folder}/${name} contains a header and at least one row`);
      ok(width > 1 && rows.every((row) => row.length === width), `${folder}/${name} is valid rectangular CSV`);
      ok(rows[0].every(Boolean) && new Set(rows[0]).size === width, `${folder}/${name} has non-empty unique headers`);
      if (folder === 'Worked_Example') {
        ok(rows.slice(1).every((row) => row.every((cell) => cell.trim().length > 0)), `${folder}/${name} has no unexplained empty example fields`);
      }
    } catch (error) {
      errors.push(`${folder}/${name} could not be parsed as CSV: ${error.message}`);
    }
  }
}

const requiredHeadings = {
  '01_PROJECT_BRIEF.md': ['# Project Brief', '## Scope', '## Creative direction', '## Technical contract'],
  '04_CONSOLIDATED_FEEDBACK.md': ['# Consolidated Mix Feedback', '## Timestamped requests', '## Conflicts and questions'],
  '05_APPROVAL_RECORD.md': ['# Approval Record', '## Decision', '## Statement'],
  '06_MASTERING_BRIEF.md': ['# Mastering Brief', '## Creative intent', '## Technical destination'],
  '07_DELIVERY_REQUIREMENTS.md': ['# Delivery Requirements', '| Requirement | Status | Value | Authoritative source / owner |', '## Blockers'],
};
for (const folder of ['Templates', 'Worked_Example']) {
  for (const [name, headings] of Object.entries(requiredHeadings)) {
    try {
      const text = await readFile(path.join(root, folder, name), 'utf8');
      for (const heading of headings) ok(text.includes(heading), `${folder}/${name} contains ${heading}`);
      if (folder === 'Worked_Example') {
        ok(!text.split(/\r?\n/).some((line) => /^- [^[][^:]*:\s*$/.test(line)), `${folder}/${name} has no empty labelled example fields`);
      }
    } catch (error) {
      errors.push(`${folder}/${name} could not be read: ${error.message}`);
    }
  }
}

let manifest = null;
try {
  manifest = JSON.parse(await readFile(path.join(root, 'MANIFEST.json'), 'utf8'));
  ok(manifest.product === 'Mix Revision & Mastering Handoff Kit', 'manifest product identity is exact');
  ok(manifest.version === '1.1', 'manifest version is 1.1');
  ok(manifest.creator === 'Gabriel Garcia Alonso / Hologram People', 'manifest creator identity is exact');
  const manifestPaths = manifest.files.map((entry) => entry.path).sort();
  ok(sameStringArray(manifestPaths, expectedManifestPaths), 'manifest covers every customer file except itself, with no extras');
  ok(new Set(manifestPaths).size === manifestPaths.length, 'manifest paths are unique');
  for (const entry of manifest.files) {
    const data = await readFile(path.join(root, entry.path));
    ok(data.length === entry.bytes, `${entry.path} byte count matches manifest`);
    ok(sha256(data) === entry.sha256, `${entry.path} checksum matches manifest`);
  }
} catch (error) {
  errors.push(`MANIFEST.json could not be verified: ${error.message}`);
}

for (const customerPath of customerPaths.filter((name) => /\.(?:csv|json|md|txt)$/i.test(name))) {
  try {
    const data = await readFile(path.join(root, customerPath));
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    ok(!data.includes(0), `${customerPath} is valid UTF-8 text without NUL bytes`);
  } catch (error) {
    errors.push(`${customerPath} is not clean UTF-8 text: ${error.message}`);
  }
}

const guide = path.join(root, 'Mix_Revision_and_Mastering_Handoff_Guide.pdf');
const pdfinfo = run('pdfinfo', [guide]);
ok(pdfinfo.status === 0, 'guide PDF is readable by Poppler');
ok(/^Title:\s+Mix Revision & Mastering Handoff Guide$/m.test(pdfinfo.stdout), 'guide PDF title metadata is exact');
ok(/^Author:\s+Gabriel Garcia Alonso \/ Hologram People$/m.test(pdfinfo.stdout), 'guide PDF author metadata is exact');
ok(/^Pages:\s+7$/m.test(pdfinfo.stdout), 'guide PDF contains seven pages');
ok(/^Page size:\s+595\.276 x 841\.89 pts \(A4\)$/m.test(pdfinfo.stdout), 'guide PDF uses A4 pages');
ok(/^Encrypted:\s+no$/m.test(pdfinfo.stdout), 'guide PDF is not encrypted');
ok(/^Form:\s+none$/m.test(pdfinfo.stdout), 'guide PDF has no unexpected form fields');
ok(/^JavaScript:\s+no$/m.test(pdfinfo.stdout), 'guide PDF contains no JavaScript');

const extracted = run('pdftotext', ['-layout', guide, '-']);
ok(extracted.status === 0, 'guide text extracts successfully');
for (const phrase of [
  'The control loop',
  'Revisions and version identity',
  'Approval and mastering handoff',
  'Export, QC and delivery',
  'not a legal contract',
  'SUPERSEDED',
  'INCOMPLETE',
]) {
  ok(extracted.stdout.includes(phrase), `guide contains the unbroken phrase “${phrase}”`);
}
ok(!/[\u2010-\u2015\u2212]/u.test(extracted.stdout), 'guide uses ASCII hyphens rather than Unicode dash characters');

const artwork = {};
for (const [name, expected] of [
  ['cover-1280x720.png', { width: 1280, height: 720 }],
  ['thumbnail-800x800.png', { width: 800, height: 800 }],
]) {
  try {
    const data = await readFile(path.join(sourceRoot, name));
    const dimensions = readPngDimensions(data);
    artwork[name] = { ...dimensions, bytes: data.length, sha256: sha256(data) };
    ok(dimensions.width === expected.width && dimensions.height === expected.height, `${name} dimensions are ${expected.width} x ${expected.height}`);
  } catch (error) {
    errors.push(`${name} could not be verified: ${error.message}`);
  }
}

const verdict = errors.length > 0
  ? 'BLOCKED - PACKAGE QA FAILED'
  : archiveReopen
    ? 'ARCHIVE VERIFIED - VISUAL REVIEW REQUIRED'
    : 'SOURCE VERIFIED - ARCHIVE REOPEN REQUIRED';
const report = {
  verdict,
  checked_at: new Date().toISOString(),
  package_root: root,
  archive_reopen: archiveReopen,
  expected_customer_files: expectedCustomerPaths.length,
  verified_manifest_entries: manifest?.files?.length || 0,
  artwork,
  passes,
  errors,
};
await mkdir(path.join(sourceRoot, 'qa'), { recursive: true });
const reportPath = path.join(sourceRoot, 'qa', archiveReopen ? 'QA_REPORT_ARCHIVE.json' : 'QA_REPORT_SOURCE.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL  ${error}`);
  console.error(`\n${errors.length} validation failure(s)`);
  process.exit(1);
}
console.log(`\n${verdict}`);
console.log(`Report: ${reportPath}`);
