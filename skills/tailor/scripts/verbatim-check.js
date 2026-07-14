#!/usr/bin/env node
// verbatim-check.js — anti-fabrication gate for the tailor-resume skill.
//
// Verifies every EXPERIENCE bullet and PERSONAL PROJECTS entry in a tailored CV
// appears VERBATIM in the candidate's master experience bank. Profile / job-blurb
// lines are intentionally NOT checked — reusable profile copy permits light
// tailoring. This is what stops a bullet from being silently reworded or invented.
//
// Usage:
//   node verbatim-check.js <master-bank.md> <cv-optimised.md>
//
// Exit 0 = clean; exit 1 = drift found (do NOT render until resolved); exit 2 = bad args.

const fs = require('fs');

const masterPath = process.argv[2];
const cvPath = process.argv[3];
if (!masterPath || !cvPath) {
  console.error('usage: node verbatim-check.js <master-bank.md> <cv-optimised.md>');
  process.exit(2);
}
for (const [label, p] of [['master bank', masterPath], ['CV', cvPath]]) {
  if (!fs.existsSync(p)) { console.error(`${label} not found: ${p}`); process.exit(2); }
}

// Normalise whitespace so trivial spacing differences aren't flagged.
const norm = s => s.replace(/\s+/g, ' ').trim();
// Looser key: drop everything but alphanumerics + spaces, lowercase. Absorbs
// punctuation/markdown differences (e.g. "**Name** — desc" vs "**Name:** desc")
// so the gate catches real content drift, not formatting reshuffles.
const loose = s => norm(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Strip a leading bank tag like `[Backend]` or `[Backend · Game]` that some banks
// use to route bullets. Removes the tag whether or not it's wrapped in backticks.
const stripTag = s => s.replace(/^`?\s*\[[^\]]*\]\s*`?\s*/, '');

// Build the verbatim bullet set from the master bank (any `- ` line, tag stripped).
const master = fs.readFileSync(masterPath, 'utf8').split(/\r?\n/);
const bankExact = new Set();
const bankLoose = new Set();
for (const line of master) {
  const m = line.match(/^\s*-\s+(.*)$/);
  if (!m) continue;
  const body = stripTag(m[1]);
  bankExact.add(norm(body));
  bankLoose.add(loose(body));
}

// A CV bullet is verbatim if it matches the bank exactly, OR its loose key matches
// (tolerates the "**Name:** desc" vs "**Name** — desc" punctuation difference etc).
const inBank = body => bankExact.has(norm(body)) || bankLoose.has(loose(body));

// Sections whose bullets must be verbatim. Case-insensitive; matches common aliases.
const CHECKED = /^##\s+(experience|work experience|personal projects|projects)\b/i;

const cv = fs.readFileSync(cvPath, 'utf8').split(/\r?\n/);
let checking = false;
const bad = [];
for (const raw of cv) {
  const s = raw.replace(/\r$/, '');
  if (s.startsWith('## ')) checking = CHECKED.test(s);
  if (!checking) continue;
  const m = s.match(/^\s*-\s+(.*)$/);
  if (!m) continue;
  const body = stripTag(m[1]);
  if (!inBank(body)) bad.push(norm(body));
}

// Dash policy: no em-dashes (U+2014) or en-dashes (U+2013) anywhere in the CV -
// plain hyphens only. Fancy dashes read as an AI-writing tell and cause encoding
// churn; the loose verbatim match already tolerates the '-' swap, so this is safe.
const dashLines = [];
cv.forEach((raw, idx) => {
  const s = raw.replace(/\r$/, '');
  if (/[–—]/.test(s)) dashLines.push(`line ${idx + 1}: ${s.trim().slice(0, 120)}`);
});

console.log(`Verbatim check: ${cvPath}`);
console.log(`  master bank: ${masterPath}  (${bankExact.size} bullets)`);
console.log(`  CV bullets not verbatim in the bank: ${bad.length}`);
bad.forEach(b => console.log('    !! ' + b.slice(0, 140)));
console.log(`  CV lines with em/en dashes (use '-' instead): ${dashLines.length}`);
dashLines.forEach(d => console.log('    !! ' + d));

const problems = [];
if (bad.length) problems.push(`${bad.length} non-verbatim bullet(s)`);
if (dashLines.length) problems.push(`${dashLines.length} line(s) with em/en dashes`);
if (problems.length) {
  console.log(`RESULT: FAIL - ${problems.join('; ')}. Do not render until fixed.`);
  process.exit(1);
}
console.log('RESULT: OK - all checked bullets are verbatim and no em/en dashes present.');
