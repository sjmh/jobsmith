#!/usr/bin/env node
// server.mjs — local "daily job-hunt digest" web server.
//
//   node server.mjs <jobs.json path> [--port 8123] [--open]
//
// Serves a single-page "morning briefing" rendered from a jobs.json data store
// (an array of scored/tailored job records produced by the fetch/tailor
// pipeline). The page is fetched-then-rendered client-side; the server exposes a
// tiny JSON API to record Apply / Dismiss decisions back into jobs.json.
//
// jobs.json is read FRESH from disk on every GET, so a morning pipeline run that
// rewrites the file shows up on refresh. Writes are atomic-ish (temp file + rename)
// so a concurrent pipeline reader never sees a half-written file.
//
// Data store: an ARRAY of records shaped like —
//   { id, title, company, url, source, watched, near, firstSeen, lastSeen, score,
//     breakdown:[{key,label,weight,score}], rationale,
//     decision:"qualified"|"tailored"|"rejected"|"dealbreaker", resumeDir, resumePdf,
//     status:"new"|"qualified"|"tailored"|"applied"|"dismissed", appliedAt, dismissedAt }
//
// "qualified" = scored at/above the bar but not auto-tailored (autoTailor off):
// the digest shows these in "Ready to review" with a one-click copy-tailor button.
// The `id` (sha1 hex string) is the primary key for all mutations.
//
// No external dependencies — Node 18+ standard library only.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = [];
const opts = { port: 8123, open: false };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') opts.port = parseInt(argv[++i], 10) || 8123;
  else if (argv[i] === '--open') opts.open = true;
  else positional.push(argv[i]);
}
const jobsPath = positional[0];
if (!jobsPath) {
  console.error('usage: node server.mjs <jobs.json path> [--port 8123] [--open]');
  process.exit(2);
}
const JOBS_PATH = path.resolve(jobsPath);

// ── data store I/O ──────────────────────────────────────────────────────────
// Read the store fresh from disk. Missing file → empty array. A corrupt/partial
// file should not crash the server, so parse defensively.
function readJobs() {
  let raw;
  try {
    raw = fs.readFileSync(JOBS_PATH, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Atomic-ish write: serialise to a temp file in the same directory, then rename
// over the target. rename() is atomic on the same filesystem, so a concurrent
// reader sees either the old file or the new one — never a partial write.
function writeJobs(jobs) {
  const tmp = path.join(path.dirname(JOBS_PATH), `.jobs.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2));
  fs.renameSync(tmp, JOBS_PATH);
}

// The base status a record reverts to when an Apply/Dismiss is undone. Tailored
// or qualified (scored ≥ bar but not yet tailored) jobs go back to their own
// state; everything else back to "new".
const baseStatus = job =>
  job.decision === 'tailored' ? 'tailored'
  : job.decision === 'qualified' ? 'qualified'
  : 'new';

// ── HTTP helpers ────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// Read a request body and JSON-parse it; reject invalid JSON with a 400.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// Mutate the record with the given id in place, persist the whole store, and
// return the found record (or null). Keeps read-modify-write atomic per request.
function mutate(id, fn) {
  const jobs = readJobs();
  const job = jobs.find(j => j && j.id === id);
  if (!job) return null;
  fn(job);
  writeJobs(jobs);
  return job;
}

// ── request handler ─────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${opts.port}`);
  const { pathname } = url;

  try {
    if (req.method === 'GET' && pathname === '/') {
      const html = renderPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/jobs') {
      sendJson(res, 200, readJobs());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/apply') {
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad body' }); }
      const job = mutate(body.id, j => { j.status = 'applied'; j.appliedAt = new Date().toISOString(); });
      if (!job) return sendJson(res, 404, { ok: false, error: 'not found' });
      return sendJson(res, 200, { ok: true, url: job.url || null });
    }

    if (req.method === 'POST' && pathname === '/api/dismiss') {
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad body' }); }
      const job = mutate(body.id, j => { j.status = 'dismissed'; j.dismissedAt = new Date().toISOString(); });
      if (!job) return sendJson(res, 404, { ok: false, error: 'not found' });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/unapply') {
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad body' }); }
      const job = mutate(body.id, j => { j.status = baseStatus(j); j.appliedAt = null; });
      if (!job) return sendJson(res, 404, { ok: false, error: 'not found' });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/undismiss') {
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad body' }); }
      const job = mutate(body.id, j => { j.status = baseStatus(j); j.dismissedAt = null; });
      if (!job) return sendJson(res, 404, { ok: false, error: 'not found' });
      return sendJson(res, 200, { ok: true });
    }

    // fall through — unknown route
    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
  }
});

server.listen(opts.port, () => {
  const addr = `http://localhost:${opts.port}`;
  console.log(`Digest → ${addr}`);
  if (opts.open) {
    // Best-effort open in the default browser; never fatal if it fails.
    const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    import('child_process').then(({ exec }) => exec(`${cmd} ${addr}`)).catch(() => {});
  }
});

// ── the HTML page ─────────────────────────────────────────────────────────────
// Rendered as a single self-contained string: all CSS + JS inlined, no external
// assets. The page fetches /api/jobs itself and renders everything client-side.
function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Hunt — Daily Digest</title>
<style>
:root{
  --accent:#1F4E79;
  --accent-soft:#1F4E7914;
  --bg:#f5f6f8;
  --card:#ffffff;
  --card-border:#e4e7ec;
  --text:#1b2430;
  --muted:#667085;
  --rule:#eceef1;
  --shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  --green:#0f7b46; --green-bg:#e4f5ec;
  --amber:#9a6700; --amber-bg:#fbf1d6;
  --grey:#667085; --grey-bg:#eef0f3;
  --red:#b42318; --red-bg:#fdeceb;
}
@media (prefers-color-scheme: dark){
  :root{
    --accent:#5a97d6;
    --accent-soft:#5a97d61f;
    --bg:#0e1116;
    --card:#161b22;
    --card-border:#232a33;
    --text:#e6e9ee;
    --muted:#93a0b0;
    --rule:#232a33;
    --shadow:0 1px 2px rgba(0,0,0,.3);
    --green:#4ecb8a; --green-bg:#12301f;
    --amber:#e0b64a; --amber-bg:#332a12;
    --grey:#93a0b0; --grey-bg:#1d232b;
    --red:#f0837a; --red-bg:#331714;
  }
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:var(--bg);color:var(--text);line-height:1.45;
  overflow-x:hidden;
}
.wrap{max-width:920px;margin:0 auto;padding:28px 20px 80px}

/* header */
header.top{margin-bottom:22px}
.title{font-size:26px;font-weight:700;letter-spacing:-.01em;margin:0}
.subtitle{color:var(--muted);font-size:14px;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.chip{
  display:flex;align-items:baseline;gap:7px;background:var(--card);
  border:1px solid var(--card-border);border-radius:10px;padding:9px 13px;
  box-shadow:var(--shadow);
}
.chip .n{font-size:19px;font-weight:700;line-height:1}
.chip .l{font-size:12px;color:var(--muted)}
.chip.accent .n{color:var(--accent)}

/* bar control */
.barctl{
  display:flex;align-items:center;gap:14px;margin-top:20px;padding:14px 16px;
  background:var(--card);border:1px solid var(--card-border);border-radius:12px;
  box-shadow:var(--shadow);flex-wrap:wrap;
}
.barctl label{font-size:13px;font-weight:600;white-space:nowrap}
.barctl .hint{font-size:12px;color:var(--muted)}
.barctl input[type=range]{flex:1;min-width:140px;accent-color:var(--accent)}
.barctl input[type=number]{
  width:66px;padding:6px 8px;border:1px solid var(--card-border);border-radius:8px;
  background:var(--bg);color:var(--text);font-size:14px;font-weight:600;
}
.barval{font-variant-numeric:tabular-nums}

/* sections */
.section{margin-top:26px}
.sec-head{
  display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;
  padding:6px 2px;
}
.sec-head .caret{transition:transform .15s;color:var(--muted);font-size:13px}
.section.collapsed .caret{transform:rotate(-90deg)}
.sec-head h2{font-size:15px;font-weight:700;margin:0;letter-spacing:.01em}
.sec-head .count{
  font-size:12px;font-weight:600;color:var(--muted);background:var(--grey-bg);
  border-radius:20px;padding:2px 9px;
}
.sec-desc{font-size:12.5px;color:var(--muted);margin:-2px 0 8px 24px}
.section.collapsed .sec-body,.section.collapsed .sec-desc{display:none}
.sec-body{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.empty{color:var(--muted);font-size:13px;padding:10px 2px;font-style:italic}

/* cards */
.card{
  background:var(--card);border:1px solid var(--card-border);border-radius:12px;
  padding:15px 17px;box-shadow:var(--shadow);
}
.card.watched{border-color:var(--accent);border-left-width:4px;background:var(--accent-soft)}
.card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.card-title{font-size:16px;font-weight:650;margin:0;letter-spacing:-.005em}
.card-meta{font-size:13px;color:var(--muted);margin-top:3px}
.card-meta .company{color:var(--text);font-weight:600}
.dot{opacity:.5;margin:0 6px}
.badges{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.badge{
  font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;
  background:var(--accent);color:#fff;
}
.badge.ghost{background:transparent;color:var(--amber);border:1px solid var(--amber)}
.pill{
  font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:20px;
  white-space:nowrap;font-variant-numeric:tabular-nums;
}
.pill.green{color:var(--green);background:var(--green-bg)}
.pill.amber{color:var(--amber);background:var(--amber-bg)}
.pill.grey{color:var(--grey);background:var(--grey-bg)}
.pill.red{color:var(--red);background:var(--red-bg)}

.rationale{font-size:13.5px;color:var(--text);margin:11px 0 0}
.applied-at{font-size:12.5px;color:var(--muted);margin-top:8px}

/* breakdown mini-bars */
.breakdown{margin-top:12px;display:grid;grid-template-columns:auto 1fr auto;
  gap:5px 10px;align-items:center}
.bk-label{font-size:11.5px;color:var(--muted);white-space:nowrap}
.bk-track{height:6px;background:var(--grey-bg);border-radius:4px;overflow:hidden}
.bk-fill{height:100%;background:var(--accent);border-radius:4px}
.bk-val{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;text-align:right}

/* actions */
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
button.btn,a.btn{
  font:inherit;font-size:13px;font-weight:600;cursor:pointer;border-radius:8px;
  padding:7px 14px;border:1px solid var(--card-border);background:var(--card);
  color:var(--text);text-decoration:none;display:inline-block;
}
button.btn:hover,a.btn:hover{border-color:var(--accent)}
button.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
button.btn.primary:hover{filter:brightness(1.08)}
button.btn.link{border-color:transparent;background:transparent;color:var(--accent);padding-left:4px}
a.btn.view{border-color:transparent;background:transparent;color:var(--accent);padding-left:4px}

.loading{text-align:center;color:var(--muted);padding:60px 0;font-size:14px}
@media (max-width:560px){
  .card-top{flex-direction:column}
  .badges{justify-content:flex-start}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1 class="title">Job Hunt — Daily Digest</h1>
    <div class="subtitle" id="today"></div>
    <div class="chips" id="chips"></div>
    <div class="barctl">
      <label for="barrange">Score bar</label>
      <input type="range" id="barrange" min="0" max="100" step="1">
      <input type="number" id="barnum" min="0" max="100" step="1">
      <span class="barval" id="barval"></span>
      <span class="hint">worth-a-look vs below-bar cutoff</span>
    </div>
  </header>
  <div id="app"><div class="loading">Loading digest…</div></div>
</div>
<script>
"use strict";

// ── small helpers ───────────────────────────────────────────────────────────
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

const $ = sel => document.querySelector(sel);

function scoreClass(s){
  if (s == null) return "grey";
  if (s >= 80) return "green";
  if (s >= 60) return "amber";
  return "grey";
}
function fmtDate(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}

let JOBS = [];        // the loaded array from /api/jobs
let bar = 70;         // client-side score-bar cutoff

// Slash command the user runs to tailor a résumé on demand (autoTailor:false flow).
const TAILOR_CMD = "/jobsmith:tailor";
// A job sits in the actionable "ready" area when it's tailored or qualified.
const isReady = j => j && (j.decision === "tailored" || j.decision === "qualified");
// Status a record reverts to when Apply/Dismiss is undone.
const baseOf = j => !j ? "new"
  : j.decision === "tailored" ? "tailored"
  : j.decision === "qualified" ? "qualified"
  : "new";

// ── data load ────────────────────────────────────────────────────────────────
async function load(){
  const res = await fetch("/api/jobs");
  JOBS = await res.json();
  if (!Array.isArray(JOBS)) JOBS = [];
  initBar();
  render();
}

// Default the bar to the highest score among tailored jobs (the natural cutoff
// the pipeline already used), so it starts somewhere meaningful.
function initBar(){
  // Prefer the configured bar (min score among ready jobs) so the cutoff starts
  // where the pipeline drew the line.
  const scores = JOBS
    .filter(j => isReady(j) && typeof j.score === "number")
    .map(j => j.score);
  bar = scores.length ? Math.min(...scores) : 70;
  $("#barrange").value = bar;
  $("#barnum").value = bar;
  $("#barval").textContent = bar;
}

// ── POST helpers ─────────────────────────────────────────────────────────────
async function post(path, id){
  const res = await fetch(path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id})
  });
  return res.json();
}

// Mutate the local record + re-render, keeping the view in sync with the server.
function setLocal(id, changes){
  const j = JOBS.find(x => x && x.id === id);
  if (j) Object.assign(j, changes);
  render();
}

async function doApply(id){
  const j = JOBS.find(x => x && x.id === id);
  if (j && j.url) window.open(j.url, "_blank");   // open the JD for the user
  const r = await post("/api/apply", id);
  if (r && r.ok) setLocal(id, {status:"applied", appliedAt:new Date().toISOString()});
}
async function doDismiss(id){
  const r = await post("/api/dismiss", id);
  if (r && r.ok) setLocal(id, {status:"dismissed", dismissedAt:new Date().toISOString()});
}
async function doUnapply(id){
  const r = await post("/api/unapply", id);
  if (r && r.ok){
    const j = JOBS.find(x => x && x.id === id);
    const base = baseOf(j);
    setLocal(id, {status:base, appliedAt:null});
  }
}
async function doUndismiss(id){
  const r = await post("/api/undismiss", id);
  if (r && r.ok){
    const j = JOBS.find(x => x && x.id === id);
    const base = baseOf(j);
    setLocal(id, {status:base, dismissedAt:null});
  }
}

// ── card + fragment rendering ────────────────────────────────────────────────
function metaLine(j){
  const bits = [];
  if (j.company) bits.push('<span class="company">'+esc(j.company)+'</span>');
  if (j.location) bits.push(esc(j.location));
  if (j.source) bits.push(esc(j.source));
  return bits.join('<span class="dot">·</span>');
}

function scorePill(j){
  if (typeof j.score === "number")
    return '<span class="pill '+scoreClass(j.score)+'">'+j.score+'</span>';
  if (j.decision === "dealbreaker")
    return '<span class="pill red">dealbreaker</span>';
  return "";
}

function breakdownHtml(j){
  if (!Array.isArray(j.breakdown) || !j.breakdown.length) return "";
  const rows = j.breakdown.map(b => {
    const label = esc(b && (b.label || b.key) || "");
    const sc = (b && typeof b.score === "number") ? Math.max(0, Math.min(100, b.score)) : 0;
    return '<div class="bk-label">'+label+'</div>'
      + '<div class="bk-track"><div class="bk-fill" style="width:'+sc+'%"></div></div>'
      + '<div class="bk-val">'+sc+'</div>';
  }).join("");
  return '<div class="breakdown">'+rows+'</div>';
}

// Build one card. The variant argument selects which action buttons appear.
function cardHtml(j, variant){
  const watched = j.watched === true;
  const badges = [];
  if (watched) badges.push('<span class="badge">★ Watched</span>');
  const pill = scorePill(j);

  let body = "";
  if (variant === "review" || variant === "rejected") body += breakdownHtml(j);
  if (j.rationale) body += '<p class="rationale">'+esc(j.rationale)+'</p>';

  // Qualified = scored ≥ bar but not yet tailored (autoTailor off): flag it and
  // offer a one-click "copy tailor command" instead of a résumé link.
  if (variant === "review" && j.decision === "qualified") badges.push('<span class="badge ghost">needs tailoring</span>');

  let actions = "";
  if (variant === "review"){
    actions = '<button class="btn primary" data-act="apply" data-id="'+esc(j.id)+'">Apply</button>';
    if (j.decision === "tailored" && j.resumePdf)
      actions += '<a class="btn view" href="file:///'+esc(j.resumePdf)+'" target="_blank">Résumé PDF</a>';
    else if (j.decision === "qualified")
      actions += '<button class="btn" data-act="tailor" data-id="'+esc(j.id)+'">Copy tailor cmd</button>';
    actions += '<button class="btn" data-act="dismiss" data-id="'+esc(j.id)+'">Dismiss</button>';
  } else if (variant === "applied"){
    actions = (j.url ? '<a class="btn view" href="'+esc(j.url)+'" target="_blank">View posting</a>' : "")
            + '<button class="btn link" data-act="unapply" data-id="'+esc(j.id)+'">Undo</button>';
  } else if (variant === "rejected"){
    actions = (j.url ? '<a class="btn view" href="'+esc(j.url)+'" target="_blank">View posting</a>' : "")
            + '<button class="btn" data-act="dismiss" data-id="'+esc(j.id)+'">Dismiss</button>';
  } else if (variant === "dismissed"){
    actions = (j.url ? '<a class="btn view" href="'+esc(j.url)+'" target="_blank">View posting</a>' : "")
            + '<button class="btn link" data-act="undismiss" data-id="'+esc(j.id)+'">Undo</button>';
  } else if (variant === "watched"){
    // Spotlight card: expose the JD link; full actions live in the job's real section.
    actions = (j.url ? '<a class="btn view" href="'+esc(j.url)+'" target="_blank">View posting</a>' : "");
  }
  const appliedAt = (variant === "applied" && j.appliedAt)
    ? '<div class="applied-at">Applied '+esc(fmtDate(j.appliedAt))+'</div>' : "";

  return '<div class="card'+(watched ? " watched" : "")+'">'
    + '<div class="card-top">'
    +   '<div><h3 class="card-title">'+esc(j.title || "(untitled role)")+'</h3>'
    +     '<div class="card-meta">'+metaLine(j)+'</div></div>'
    +   '<div class="badges">'+badges.join("")+pill+'</div>'
    + '</div>'
    + body
    + appliedAt
    + (actions ? '<div class="actions">'+actions+'</div>' : "")
    + '</div>';
}

// A collapsible section wrapper.
function sectionHtml(id, heading, desc, cards, collapsed){
  const count = cards.length;
  const inner = count ? cards.join("") : '<div class="empty">Nothing here.</div>';
  return '<div class="section'+(collapsed ? " collapsed" : "")+'" data-sec="'+id+'">'
    + '<div class="sec-head"><span class="caret">▾</span>'
    +   '<h2>'+esc(heading)+'</h2><span class="count">'+count+'</span></div>'
    + (desc ? '<div class="sec-desc">'+esc(desc)+'</div>' : "")
    + '<div class="sec-body">'+inner+'</div>'
    + '</div>';
}

// ── main render ──────────────────────────────────────────────────────────────
function render(){
  const today = new Date().toLocaleDateString(undefined,
    {weekday:"long",year:"numeric",month:"long",day:"numeric"});
  $("#today").textContent = today;

  const isApplied   = j => j.status === "applied";
  const isDismissed = j => j.status === "dismissed";
  const isActive    = j => !isApplied(j) && !isDismissed(j);

  // buckets
  const watched  = JOBS.filter(j => j && j.watched === true);
  const ready    = JOBS.filter(j => isReady(j) && isActive(j));
  const applied  = JOBS.filter(j => j && isApplied(j));
  const rejected = JOBS.filter(j => j && (j.decision === "rejected" || j.decision === "dealbreaker") && isActive(j));
  const dismissed= JOBS.filter(j => j && isDismissed(j));

  // summary chips
  const nRejected = JOBS.filter(j => j && (j.decision==="rejected"||j.decision==="dealbreaker")).length;
  const nTailored = JOBS.filter(j => j && j.decision==="tailored").length;
  const nNewToday = JOBS.filter(j => j && j.status==="new" && isReady(j)).length;
  $("#chips").innerHTML =
      chip(nNewToday, "New today", true)
    + chip(ready.length, "Ready to review")
    + chip(nTailored, "Résumé ready")
    + chip(applied.length, "Applied")
    + chip(nRejected, "Rejected");

  // Score-bar view filter: split the "résumé ready" jobs into above/below the
  // client-side cutoff. Purely a view over already-loaded data.
  const atOrAbove = ready.filter(j => (typeof j.score === "number" ? j.score : 0) >= bar);
  const below     = ready.filter(j => (typeof j.score === "number" ? j.score : 0) < bar);

  const html =
      sectionHtml("watched", "★ Watched companies",
        "Roles at companies you're tracking — spotlighted regardless of status.",
        watched.map(j => cardHtml(j, "watched")), watched.length === 0)
    + sectionHtml("ready", "Ready to review",
        "Scored at or above the bar of " + bar + ". Tailored ones have a résumé; the rest have a one-click tailor command.",
        atOrAbove.map(j => cardHtml(j, "review")), false)
    + (below.length
        ? sectionHtml("belowbar", "Below bar", "Above zero but under your current score bar.",
            below.map(j => cardHtml(j, "review")), true)
        : "")
    + sectionHtml("applied", "Applied", "",
        applied.map(j => cardHtml(j, "applied")), applied.length === 0)
    + sectionHtml("rejected", "Rejected / below bar",
        "Scored out or hit a dealbreaker — shown so you can see why.",
        rejected.map(j => cardHtml(j, "rejected")), false)
    + sectionHtml("dismissed", "Dismissed", "",
        dismissed.map(j => cardHtml(j, "dismissed")), true);

  $("#app").innerHTML = html;
}

function chip(n, label, accent){
  return '<div class="chip'+(accent ? " accent" : "")+'">'
    + '<span class="n">'+n+'</span><span class="l">'+esc(label)+'</span></div>';
}

// ── events (delegated) ───────────────────────────────────────────────────────
document.addEventListener("click", e => {
  const head = e.target.closest(".sec-head");
  if (head){ head.parentElement.classList.toggle("collapsed"); return; }

  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const act = btn.getAttribute("data-act");
  if (act === "apply") doApply(id);
  else if (act === "dismiss") doDismiss(id);
  else if (act === "unapply") doUnapply(id);
  else if (act === "undismiss") doUndismiss(id);
  else if (act === "tailor"){
    const j = JOBS.find(x => x && x.id === id);
    const cmd = TAILOR_CMD + " " + (j && j.url || "");
    const done = () => { const t = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => { btn.textContent = t; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(cmd).then(done).catch(() => window.prompt("Copy this command:", cmd));
    else window.prompt("Copy this command:", cmd);
  }
});

// bar control — keep range + number in sync, re-render on change (instant)
function onBar(v){
  bar = Math.max(0, Math.min(100, parseInt(v,10) || 0));
  $("#barrange").value = bar;
  $("#barnum").value = bar;
  $("#barval").textContent = bar;
  render();
}
$("#barrange").addEventListener("input", e => onBar(e.target.value));
$("#barnum").addEventListener("input", e => onBar(e.target.value));

load().catch(err => {
  $("#app").innerHTML = '<div class="loading">Failed to load digest: '+esc(err.message)+'</div>';
});
</script>
</body>
</html>`;
}
