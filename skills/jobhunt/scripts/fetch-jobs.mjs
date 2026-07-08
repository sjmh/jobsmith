#!/usr/bin/env node
// fetch-jobs.mjs — the jobhunt source RUNNER.
//
//   node fetch-jobs.mjs <jobhunt.config.json>
//   node fetch-jobs.mjs --config <path>
//
// Reads the config's `sources[]`, dispatches each entry to the adapter whose
// `type` matches (auto-discovered from ./adapters/*.mjs), merges the results,
// dedupes by a stable id, and prints ONE JSON object to stdout:
//
//   {
//     "jobs": [ { id, title, company, location, url, source, remote, postedAt,
//                 description }, ... ],
//     "pendingExtraction": [ { source, url, hint, pageText }, ... ],
//     "errors": [ { source, message }, ... ]
//   }
//
// The runner is deliberately site-agnostic: ALL site logic lives in adapters, so
// adding coverage never touches this file. A failing source is logged into
// `errors` and skipped — it never aborts the run. `pendingExtraction` holds
// `webfetch`-type sources that need an AI pass (handled by the SKILL, not here).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = path.join(__dirname, 'adapters');

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let configPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--config') configPath = argv[++i];
  else if (!configPath && !argv[i].startsWith('--')) configPath = argv[i];
}
if (!configPath) {
  console.error('usage: node fetch-jobs.mjs <jobhunt.config.json>');
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ── stable id (must match the SKILL's dedup rule) ────────────────────────────
export function jobId(job) {
  const key = `${(job.company || '').toLowerCase().trim()}|${(job.title || '')
    .toLowerCase()
    .trim()}|${job.url || ''}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// ── adapter auto-discovery ───────────────────────────────────────────────────
async function loadAdapters() {
  const registry = new Map();
  for (const file of fs.readdirSync(ADAPTERS_DIR)) {
    if (!file.endsWith('.mjs') || file.startsWith('_')) continue;
    try {
      const mod = await import(pathToFileURL(path.join(ADAPTERS_DIR, file)).href);
      if (mod.type && typeof mod.fetch === 'function') {
        registry.set(mod.type, mod);
      }
    } catch (e) {
      console.error(`[fetch-jobs] failed to load adapter ${file}: ${e.message}`);
    }
  }
  return registry;
}

// ── main ──────────────────────────────────────────────────────────────────────
const adapters = await loadAdapters();
const sources = Array.isArray(config.sources) ? config.sources : [];

const jobs = [];
const pendingExtraction = [];
const errors = [];
const seen = new Set();

for (const src of sources) {
  if (src.enabled === false) continue;
  const adapter = adapters.get(src.type);
  const label = src.label || src.company || src.url || src.type;
  if (!adapter) {
    errors.push({ source: `${src.type}:${label}`, message: `no adapter for type "${src.type}"` });
    continue;
  }
  try {
    const result = await adapter.fetch(src);
    if (adapter.requiresLLM) {
      // webfetch-style: hand off to the SKILL for AI extraction.
      pendingExtraction.push({ source: src.type, ...result });
      continue;
    }
    for (const job of result || []) {
      if (!job || !job.title) continue;
      const id = jobId(job);
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push({ id, ...job });
    }
  } catch (e) {
    errors.push({ source: `${src.type}:${label}`, message: e.message });
  }
}

process.stdout.write(JSON.stringify({ jobs, pendingExtraction, errors }, null, 2) + '\n');
console.error(
  `[fetch-jobs] ${jobs.length} jobs from ${sources.length} sources` +
    (pendingExtraction.length ? `, ${pendingExtraction.length} pending AI extraction` : '') +
    (errors.length ? `, ${errors.length} source error(s)` : ''),
);
