#!/usr/bin/env node
// merge-jobs.mjs — day-over-day merge + dealbreaker/relevance pre-screen.
//
//   node merge-jobs.mjs <jobs.json> --incoming <sourced.json> --config <cfg.json>
//                       [--candidates-out <to-score.json>]
//
// This is the idempotency engine. Given the freshly-sourced postings
// (`--incoming`, an array of normalized jobs from fetch-jobs.mjs + Indeed/webfetch)
// it reconciles them against the EXISTING jobs.json so the morning digest can show
// what's genuinely new:
//
//   • Known id (seen before)  → keep firstSeen, cart, dismissed, status, score,
//                               breakdown, rationale, decision; bump lastSeen;
//                               set isNew=false. Never re-scored.
//   • New id                  → stamp firstSeen=today, isNew=true, and route it:
//         – trips a dealbreaker → recorded decision:"dealbreaker" (not scored)
//         – off-target (relevance) → recorded decision:"rejected", score 25 (not scored)
//         – otherwise → written to <to-score.json> for the SKILL to LLM-score
//
// jobs.json is rewritten with all carried-over + newly-prescored records; the
// new *candidates* are emitted separately so only they get scored. Re-running the
// same day is a no-op (every id is already known). Deterministic, no deps.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const pos = [];
let incomingPath = null, configPath = null, candidatesOut = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--incoming') incomingPath = argv[++i];
  else if (argv[i] === '--config') configPath = argv[++i];
  else if (argv[i] === '--candidates-out') candidatesOut = argv[++i];
  else pos.push(argv[i]);
}
const jobsPath = pos[0];
if (!jobsPath || !incomingPath || !configPath) {
  console.error('usage: node merge-jobs.mjs <jobs.json> --incoming <sourced.json> --config <cfg.json> [--candidates-out <to-score.json>]');
  process.exit(2);
}
candidatesOut = candidatesOut || path.join(path.dirname(path.resolve(jobsPath)), '_to-score.json');

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeAtomic = (p, o) => { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, p); };

const cfg = readJson(configPath, {});
const incoming = readJson(incomingPath, []);
const prior = readJson(jobsPath, []);
const today = new Date().toISOString();

// ── stable id (must match fetch-jobs.mjs) ────────────────────────────────────
const canon = u => { try { const x = new URL(u); x.hash = ''; [...x.searchParams.keys()].forEach(k => { if (/^utm_|^gh_|^ref$|^src$/i.test(k)) x.searchParams.delete(k); }); if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, ''); return x.toString(); } catch { return (u || '').trim(); } };
const jobId = j => j.id || crypto.createHash('sha1').update(`${(j.company || '').toLowerCase().trim()}|${(j.title || '').toLowerCase().trim()}|${canon(j.url)}`).digest('hex').slice(0, 16);
const watchedOf = co => (cfg.watchedCompanies || []).find(w => (co || '').toLowerCase().includes(w.toLowerCase()));

// ── dealbreaker gate (config-driven) ─────────────────────────────────────────
const db = (cfg.rubric && cfg.rubric.dealbreakers) || {};
const junior = /\b(junior|jr\.?|intern(ship)?|entry[- ]level|new[- ]grad|graduate|associate|apprentice|trainee)\b/i;
const excl = (db.excludeKeywords || []).map(k => k.toLowerCase());
const dealbreak = j => {
  const blob = `${j.title} ${j.description || ''}`.toLowerCase();
  if (db.seniorityFloor === 'Senior' && junior.test(j.title)) return 'below seniority floor (title reads junior/entry)';
  for (const k of excl) if (blob.includes(k)) return `excluded keyword: "${k}"`;
  if (db.requireRemote && !j.remote) return 'not remote (requireRemote)';
  for (const loc of (db.disallowedLocations || [])) if ((j.location || '').toLowerCase().includes(loc.toLowerCase())) return `disallowed location: ${loc}`;
  return null;
};

// ── relevance pre-screen (config.prescreen overrides these defaults) ─────────
const ps = cfg.prescreen || {};
const relevant = new RegExp(ps.relevanceKeywords ? ps.relevanceKeywords.join('|') : 'back[- ]?end|platform|infrastructure|\\binfra\\b|distributed|reliability|\\bsre\\b|site reliability|\\bsystems?\\b|software engineer|\\bswe\\b|golang|\\bgo\\b|gameplay|game ?dev|\\bengine\\b|unreal|c\\+\\+|staff engineer|principal engineer|devops|micro ?services|data engineer|security engineer|full[- ]?stack', 'i');
const hardNeg = new RegExp(ps.hardNegatives ? ps.hardNegatives.join('|') : '\\b(marketing|sales|seller|account (executive|manager)|advertis\\w+|designer|ux|ui\\/ux|recruiter|copywriter|content writer|social media|community|manager|director|vp|head of|counsel|attorney|paralegal|legal|analyst|scientist|accountant|bookkeeper|nurse|driver|therapist|clinical|customer (support|success|experience)|support agent|\\bhr\\b|people ops|talent|proposal|casino|tester|policy)\\b', 'i');
const strongTitle = /(senior|staff|principal|lead|sr\.?|distinguished)\b.*(back[- ]?end|platform|infrastructure|infra|distributed|reliability|\bsre\b|site reliability|systems?|software engineer|golang|\bgo\b|game|gameplay|engine|unreal|c\+\+|services|devops|cloud)|(\bgolang\b|\brust\b|c\+\+|unreal|gameplay|distributed systems|site reliability)/i;
const noisy = new RegExp(`^(${(ps.noisySources || ['hn-whoishiring', 'remoteok', 'weworkremotely']).join('|')})`);
const offTarget = j => {
  if (hardNeg.test(j.title)) return true;
  if (noisy.test(j.source || '')) return !strongTitle.test(j.title || '');
  return !relevant.test(j.title || '');
};

// ── merge ─────────────────────────────────────────────────────────────────────
const priorById = new Map(prior.map(j => [j.id, j]));
const out = new Map(prior.map(j => [j.id, { ...j, isNew: false }])); // start from prior, default not-new
const candidates = [];
let seenAgain = 0, newDealbreak = 0, newOff = 0, newCand = 0;

for (const raw of incoming) {
  const id = jobId(raw);
  const watched = !!watchedOf(raw.company);
  if (priorById.has(id)) {
    // Known posting: preserve everything, just refresh volatile bits.
    const keep = out.get(id);
    keep.lastSeen = today;
    keep.isNew = false;
    keep.watched = watched;                 // watch-list may have changed
    if (raw.comp && !keep.comp) keep.comp = raw.comp;
    seenAgain++;
    continue;
  }
  // Brand-new posting.
  const base = { ...raw, id, watched, watchedName: watchedOf(raw.company) || null, firstSeen: today, lastSeen: today, isNew: true, cart: false, dismissed: false };
  const dbReason = dealbreak(raw);
  if (dbReason) {
    out.set(id, { ...base, score: null, breakdown: [], rationale: `Dealbreaker: ${dbReason}.`, decision: 'dealbreaker', status: 'new', resumeDir: null, resumePdf: null, appliedAt: null, dismissedAt: null });
    newDealbreak++; continue;
  }
  if (offTarget(raw)) {
    out.set(id, { ...base, score: 25, breakdown: [], rationale: 'Off-target: title falls outside the backend / platform / SRE / game focus.', decision: 'rejected', status: 'new', resumeDir: null, resumePdf: null, appliedAt: null, dismissedAt: null });
    newOff++; continue;
  }
  // Relevant & new → needs scoring. Placeholder record now; apply-scores fills it.
  out.set(id, { ...base, score: null, breakdown: [], rationale: '', decision: 'unscored', status: 'new', resumeDir: null, resumePdf: null, appliedAt: null, dismissedAt: null });
  candidates.push(base);
  newCand++;
}

writeAtomic(jobsPath, [...out.values()]);
writeAtomic(candidatesOut, candidates);

console.error(`[merge] incoming ${incoming.length} | prior ${prior.length} | seen-again ${seenAgain} | NEW: ${newCand} to-score, ${newOff} off-target, ${newDealbreak} dealbreaker`);
console.error(`[merge] jobs.json now ${out.size} records; ${candidates.length} candidates -> ${candidatesOut}`);
