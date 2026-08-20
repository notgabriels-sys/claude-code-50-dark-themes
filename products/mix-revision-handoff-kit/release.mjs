#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const packName = 'Mix_Revision_and_Mastering_Handoff_Kit';
const packRoot = path.join(root, 'pack', packName);
const archiveName = `${packName}.zip`;
const distRoot = path.join(root, 'dist');
const qaRoot = path.join(root, 'qa');
const archivePath = path.join(distRoot, archiveName);
const fixedTime = new Date('2026-08-20T00:00:00.000Z');
const handoffFlag = process.argv.indexOf('--handoff');
const handoffRoot = handoffFlag >= 0 ? path.resolve(process.argv[handoffFlag + 1] || '') : null;

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function sha256File(filename) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function walk(directory) {
  const files = [];
  const directories = [directory];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(absolute);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return { files, directories };
}

async function normalizeTimestamps(directory) {
  const { files, directories } = await walk(directory);
  for (const filename of files) await utimes(filename, fixedTime, fixedTime);
  for (const dirname of directories.sort((a, b) => b.length - a.length)) await utimes(dirname, fixedTime, fixedTime);
}

await rm(distRoot, { recursive: true, force: true });
await rm(qaRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await mkdir(path.join(qaRoot, 'pdf-pages'), { recursive: true });

run(process.execPath, [path.join(root, 'generate-package.mjs')]);
run(process.execPath, [path.join(root, 'verify-package.mjs')]);
await normalizeTimestamps(packRoot);
run('zip', ['-X', '-q', '-r', archivePath, packName], { cwd: path.join(root, 'pack') });
run('unzip', ['-t', archivePath]);

const archiveSha256 = await sha256File(archivePath);
await writeFile(path.join(distRoot, 'SHA256SUMS.txt'), `${archiveSha256}  ${archiveName}\n`);

const extractionRoot = await mkdtemp(path.join(tmpdir(), 'mix-revision-handoff-'));
try {
  run('unzip', ['-q', archivePath, '-d', extractionRoot]);
  run(process.execPath, [path.join(root, 'verify-package.mjs'), path.join(extractionRoot, packName)]);
} finally {
  await rm(extractionRoot, { recursive: true, force: true });
}

const guidePath = path.join(packRoot, 'Mix_Revision_and_Mastering_Handoff_Guide.pdf');
run('pdftoppm', ['-png', '-r', '144', guidePath, path.join(qaRoot, 'pdf-pages', 'page')]);
const renderedPages = (await readdir(path.join(qaRoot, 'pdf-pages'))).filter((name) => name.endsWith('.png')).sort();
if (renderedPages.length !== 7) throw new Error(`Expected seven rendered guide pages; found ${renderedPages.length}.`);

const [archiveStats, guideStats, guideSha256, coverSha256, thumbnailSha256] = await Promise.all([
  stat(archivePath),
  stat(guidePath),
  sha256File(guidePath),
  sha256File(path.join(root, 'cover-1280x720.png')),
  sha256File(path.join(root, 'thumbnail-800x800.png')),
]);
const customerFiles = (await walk(packRoot)).files;
let visualQa = { status: 'UNVERIFIED', reason: 'VISUAL_QA.json is missing or unreadable.' };
try {
  const record = JSON.parse(await readFile(path.join(root, 'VISUAL_QA.json'), 'utf8'));
  const hashesMatch =
    record.guide_pdf_sha256 === guideSha256 &&
    record.cover_sha256 === coverSha256 &&
    record.thumbnail_sha256 === thumbnailSha256;
  visualQa = {
    ...record,
    verified: record.status === 'PASSED' && hashesMatch,
    hashes_match_current_assets: hashesMatch,
  };
} catch (error) {
  visualQa = { status: 'UNVERIFIED', verified: false, reason: error.message };
}
const report = {
  verdict: visualQa.verified
    ? 'READY TO UPLOAD - LIVE UPDATE NOT APPLIED'
    : 'AUTOMATED PACKAGE QA PASSED - FINAL VISUAL REVIEW REQUIRED',
  checked_at: new Date().toISOString(),
  product: 'Mix Revision & Mastering Handoff Kit',
  version: '1.1',
  archive: { name: archiveName, bytes: archiveStats.size, sha256: archiveSha256 },
  guide: { pages: renderedPages.length, bytes: guideStats.size, sha256: guideSha256 },
  artwork: {
    cover_sha256: coverSha256,
    thumbnail_sha256: thumbnailSha256,
  },
  visual_qa: visualQa,
  customer_file_count_including_manifest: customerFiles.length,
  source_report: 'QA_REPORT_SOURCE.json',
  archive_report: 'QA_REPORT_ARCHIVE.json',
  rendered_pages: renderedPages,
};
await writeFile(path.join(qaRoot, 'RELEASE_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);

if (handoffRoot) {
  if (path.basename(handoffRoot) !== 'mix-revision-handoff-kit') {
    throw new Error('Handoff target must end in mix-revision-handoff-kit.');
  }
  await mkdir(handoffRoot, { recursive: true });
  const existing = await readdir(handoffRoot);
  if (existing.length > 0) throw new Error(`Handoff target is not empty: ${handoffRoot}`);
  const handoffFiles = [
    [archivePath, archiveName],
    [path.join(distRoot, 'SHA256SUMS.txt'), 'SHA256SUMS.txt'],
    [path.join(root, 'cover-1280x720.png'), 'cover-1280x720.png'],
    [path.join(root, 'thumbnail-800x800.png'), 'thumbnail-800x800.png'],
    [path.join(root, 'LISTING.md'), 'LISTING.md'],
    [path.join(root, 'PUBLISHING.md'), 'PUBLISHING.md'],
    [path.join(root, 'VISUAL_QA.json'), 'VISUAL_QA.json'],
    [path.join(qaRoot, 'QA_REPORT_SOURCE.json'), 'QA_REPORT_SOURCE.json'],
    [path.join(qaRoot, 'QA_REPORT_ARCHIVE.json'), 'QA_REPORT_ARCHIVE.json'],
    [path.join(qaRoot, 'RELEASE_REPORT.json'), 'RELEASE_REPORT.json'],
  ];
  for (const [source, destination] of handoffFiles) await copyFile(source, path.join(handoffRoot, destination));
}

console.log(`${archiveSha256}  ${archivePath}`);
console.log(`Guide SHA-256: ${guideSha256}`);
console.log(`Rendered pages: ${renderedPages.length}`);
if (handoffRoot) console.log(`Handoff: ${handoffRoot}`);
