#!/usr/bin/env node
// apply-scores.mjs — fold LLM scores into jobs.json for this run's new candidates.
//
//   node apply-scores.mjs <jobs.json> --scores <scores.json> --config <cfg.json>
//
// `--scores` is the array the SKILL's scoring step produced:
//   [{ id, score, breakdown:[{key,score}], rationale }]
// For each, this finds the matching "unscored" record in jobs.json and finalizes:
//   • watched bump (config.watchedScoreBump, capped 100)
//   • breakdown labels/weights re-derived from config.rubric.factors
//   • near = within config.nearWindow just below the bar
//   • decision:
//       - config.autoTailor === false → "qualified" if bumped >= bar else "rejected"
//         (tailoring happens on demand from the digest; nothing auto-generated)
//       - otherwise                    → "qualified" too; the SKILL's tailor step
//         flips the winners to "tailored" after it generates résumés
// Records already scored on a previous day are left untouched. Deterministic.

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const pos = [];
let scoresPath = null, configPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--scores') scoresPath = argv[++i];
  else if (argv[i] === '--config') configPath = argv[++i];
  else pos.push(argv[i]);
}
const jobsPath = pos[0];
if (!jobsPath || !scoresPath || !configPath) {
  console.error('usage: node apply-scores.mjs <jobs.json> --scores <scores.json> --config <cfg.json>');
  process.exit(2);
}

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeAtomic = (p, o) => { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, p); };

const cfg = readJson(configPath, {});
const jobs = readJson(jobsPath, []);
const scores = readJson(scoresPath, []);

const bar = cfg.bar ?? 80;
const nearWindow = cfg.nearWindow ?? 10;
const bump = cfg.watchedScoreBump ?? 0;
const factorMeta = Object.fromEntries(((cfg.rubric && cfg.rubric.factors) || []).map(f => [f.key, { label: f.label, weight: f.weight }]));
const byId = new Map(jobs.map(j => [j.id, j]));

let applied = 0, missing = 0;
for (const s of scores) {
  const j = byId.get(s.id);
  if (!j) { missing++; continue; }
  const breakdown = (s.breakdown || []).map(b => ({ key: b.key, label: (factorMeta[b.key] && factorMeta[b.key].label) || b.key, weight: (factorMeta[b.key] && factorMeta[b.key].weight) || 0, score: b.score }));
  const bumped = Math.min(100, (s.score || 0) + (j.watched ? bump : 0));
  j.score = bumped;
  j.breakdown = breakdown;
  j.rationale = (s.rationale || '') + (j.watched && bump ? ` (+${bump} watched: ${j.watchedName || j.company})` : '');
  j.near = bumped < bar && bumped >= bar - nearWindow;
  j.decision = bumped >= bar ? 'qualified' : 'rejected';
  applied++;
}

// Any candidate that never got a score stays visible but below the bar.
for (const j of jobs) {
  if (j.decision === 'unscored') { j.decision = 'rejected'; j.score = j.score ?? 40; j.rationale = j.rationale || 'Not scored this run; left below bar for review.'; }
}

writeAtomic(jobsPath, jobs);
const q = jobs.filter(j => j.decision === 'qualified').length;
console.error(`[apply] scored ${applied}${missing ? `, ${missing} score ids not found` : ''} | qualified now ${q} | bar ${bar}, autoTailor ${cfg.autoTailor !== false}`);
