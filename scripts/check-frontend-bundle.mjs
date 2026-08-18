#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distArg = process.argv[2] ?? 'dist';
const distDir = resolve(process.cwd(), distArg);
const htmlPath = join(distDir, 'index.html');
const EAGER_RAW = 360 * 1024;
const EAGER_GZIP = 120 * 1024;
const LAZY_RAW = 300 * 1024;
const XYFLOW_RAW = 360 * 1024;

if (!existsSync(htmlPath)) {
  console.error(`bundle gate: missing ${htmlPath}`);
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf8');
const eagerFiles = new Set();
for (const match of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) {
  const file = match[1].replace(/^\//, '');
  eagerFiles.add(join(distDir, file.replace(/^assets\//, 'assets/')));
}

const assetsDir = join(distDir, 'assets');
const jsFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((name) => name.endsWith('.js')).map((name) => join(assetsDir, name))
  : [];

function measure(file) {
  const rawBuffer = readFileSync(file);
  return {
    file: file.slice(distDir.length + 1),
    raw: rawBuffer.length,
    gzip: gzipSync(rawBuffer).length,
    source: rawBuffer.toString('utf8'),
  };
}

let failed = false;
let eagerRaw = 0;
let eagerGzip = 0;

console.log('role\tfile\traw\tgzip');
for (const file of jsFiles) {
  const stats = measure(file);
  const eager = [...eagerFiles].some((candidate) => resolve(candidate) === resolve(file))
    || html.includes(stats.file.split('/').pop());
  const xyflow = /xyflow/i.test(stats.file) || stats.source.includes('@xyflow/react');
  const role = eager ? 'eager' : xyflow ? 'xyflow-lazy' : 'lazy';
  console.log(`${role}\t${stats.file}\t${stats.raw}\t${stats.gzip}`);
  if (eager) {
    eagerRaw += stats.raw;
    eagerGzip += stats.gzip;
  } else if (xyflow) {
    if (stats.raw > XYFLOW_RAW) {
      console.error(`xyflow vendor chunk ${stats.file} exceeds ${XYFLOW_RAW} raw (${stats.raw})`);
      failed = true;
    }
  } else if (stats.raw > LAZY_RAW) {
    console.error(`lazy chunk ${stats.file} exceeds ${LAZY_RAW} raw (${stats.raw})`);
    failed = true;
  }
}

console.log(`eager_total\t-\t${eagerRaw}\t${eagerGzip}`);
if (eagerRaw > EAGER_RAW) {
  console.error(`eager raw ${eagerRaw} exceeds ${EAGER_RAW}`);
  failed = true;
}
if (eagerGzip > EAGER_GZIP) {
  console.error(`eager gzip ${eagerGzip} exceeds ${EAGER_GZIP}`);
  failed = true;
}

if (failed) process.exit(1);
console.log('bundle gate passed');
