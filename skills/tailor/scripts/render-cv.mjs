#!/usr/bin/env node
// render-cv.mjs — self-contained CV (and optional cover letter) renderer.
//
//   node render-cv.mjs <cv.md> <output-basename> [--role "Title"] [--cover <letter.md>] [--template <file.mjs>]
//
// Writes <output-basename>.html and <output-basename>.pdf. All styling lives in
// template.mjs (or the --template override). The only dependency is puppeteer;
// if it isn't installed, this prints the HTML path and skips the PDF step so you
// still get a usable artifact.
//
// Markdown structure expected (see the skill's SKILL.md / config-reference.md):
//   line 1: `# Name`
//   line 2: contact line, `|`-separated (links auto-detected by linkedin/github/http)
//   then `## PROFILE`, `## SKILLS`, `## EXPERIENCE`, `## PERSONAL PROJECTS`.
//   EXPERIENCE jobs: `### Company | Location | Dates` then `**Title**`, an
//   optional blurb line, then `- ` bullets. SKILLS / PERSONAL PROJECTS rows are
//   `**Key:** value` / `- **Key:** value`. Anything after `## ATS ...` is ignored.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = [];
const opts = { role: 'Software Engineer', cover: null, template: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--role') opts.role = argv[++i];
  else if (argv[i] === '--cover') opts.cover = argv[++i];
  else if (argv[i] === '--template') opts.template = argv[++i];
  else positional.push(argv[i]);
}
const [cvPath, outBase] = positional;
if (!cvPath || !outBase) {
  console.error('usage: node render-cv.mjs <cv.md> <output-basename> [--role "Title"] [--cover <letter.md>] [--template <file.mjs>]');
  process.exit(2);
}

const tplUrl = pathToFileURL(opts.template ? path.resolve(opts.template) : path.join(__dirname, 'template.mjs')).href;
const { doc, CV_CSS, COVER_LETTER_CSS } = await import(tplUrl);

// ── inline markdown helpers ─────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parseInline = line => esc(line)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/\[(.+?)\]\((.+?)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
const contactToHtml = parts => parts.map(p => {
  if (p.includes('linkedin') || p.includes('github') || p.startsWith('http')) {
    const href = p.startsWith('http') ? p : 'https://' + p;
    return `<a href="${href}">${esc(p)}</a>`;
  }
  return `<span>${esc(p)}</span>`;
}).join('\n        ');

// ── CV: markdown → HTML ─────────────────────────────────────────────────────
function renderCvHtml(markdown, { role }) {
  const content = markdown.split(/^## ATS/m)[0].trim();
  const lines = content.split('\n');
  let i = 0;
  const name = lines[i++].replace(/^# /, '').trim();
  const contactHtml = contactToHtml(lines[i++].split('|').map(s => s.trim()));

  let profileHtml = '', skillsHtml = '', experienceHtml = '', projectsHtml = '';
  const skip = () => { while (i < lines.length && (lines[i].trim() === '' || lines[i].trim() === '---')) i++; };
  skip();

  while (i < lines.length) {
    if (!lines[i].startsWith('## ')) { i++; continue; }
    const section = lines[i].replace(/^## /, '').trim().toUpperCase();
    i++; skip();

    if (section === 'PROFILE') {
      const paras = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        if (lines[i].trim() && lines[i].trim() !== '---') paras.push(parseInline(lines[i].trim()));
        i++;
      }
      profileHtml = paras.join(' '); skip();

    } else if (section === 'SKILLS') {
      const rows = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        const m = lines[i].trim().match(/^\*\*(.+?):\*\*\s*(.*)$/);
        if (m) rows.push(`<div class="row"><div class="row-key">${esc(m[1])}</div><div class="row-val">${esc(m[2])}</div></div>`);
        i++;
      }
      skillsHtml = rows.join('\n      '); skip();

    } else if (section === 'EXPERIENCE') {
      const jobs = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        if (!lines[i].startsWith('### ')) { i++; continue; }
        const parts = lines[i].replace(/^### /, '').split('|').map(s => s.trim());
        const company = parts[0] || '', dates = parts[2] || '';
        i++;
        while (i < lines.length && lines[i].trim() === '') i++;
        let jobTitle = '';
        if (lines[i] && lines[i].startsWith('**')) { jobTitle = lines[i].replace(/\*\*/g, '').trim(); i++; }
        let blurb = ''; const bullets = [];
        while (i < lines.length && !lines[i].startsWith('### ') && !lines[i].startsWith('## ')) {
          const l = lines[i].trim();
          if (l.startsWith('- ')) bullets.push(`<li>${parseInline(l.slice(2))}</li>`);
          else if (l && l !== '---') blurb = parseInline(l);
          i++;
        }
        const blurbHtml = blurb ? `<p class="job-blurb">${blurb}</p>` : '';
        const bulletHtml = bullets.length ? `<ul>\n          ${bullets.join('\n          ')}\n        </ul>` : '';
        jobs.push(`
      <div class="job">
        <div class="job-head">
          <div class="job-title">${esc(jobTitle)} &middot; <span class="job-org">${esc(company)}</span></div>
          <div class="job-dates">${esc(dates)}</div>
        </div>
        ${blurbHtml}
        ${bulletHtml}
      </div>`);
      }
      experienceHtml = jobs.join('\n'); skip();

    } else if (section === 'PERSONAL PROJECTS' || section === 'PROJECTS') {
      const rows = [];
      while (i < lines.length && !lines[i].startsWith('## ')) {
        // Accept both `- **Key:** value` (colon inside bold) and the master-bank
        // style `- **name** — value` / `- **name** value` (separator outside bold).
        const m = lines[i].trim().match(/^- \*\*(.+?):?\*\*\s*[—–:-]?\s*(.*)$/);
        if (m) rows.push(`<div class="row"><div class="row-key">${esc(m[1])}</div><div class="row-val">${esc(m[2])}</div></div>`);
        i++;
      }
      projectsHtml = rows.join('\n      '); skip();
    } else { i++; }
  }

  const projectsSection = projectsHtml
    ? `\n  <section class="proj">\n    <div class="sec-label">Personal Projects</div>\n    ${projectsHtml}\n  </section>` : '';

  const body = `<div class="page">
  <header>
    <div class="name">${esc(name)}</div>
    <div class="role">${esc(role)}</div>
    <div class="contact">
        ${contactHtml}
    </div>
  </header>
  <section>
    <div class="sec-label">Profile</div>
    <p class="summary">${profileHtml}</p>
  </section>
  <section>
    <div class="sec-label">Skills</div>
    ${skillsHtml}
  </section>
  <section>
    <div class="sec-label">Experience</div>
    ${experienceHtml}
  </section>${projectsSection}
</div>`;
  return doc(esc(name), CV_CSS, body);
}

// ── Cover letter: markdown → HTML ────────────────────────────────────────────
function renderCoverLetterHtml(markdown) {
  const blocks = markdown.trim().split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const sender = blocks.shift().split('\n').map(s => s.trim());
  const name = sender.shift();
  const contactHtml = contactToHtml(sender);
  let salutation = 'Dear Hiring Manager,';
  if (blocks.length && /^dear\b/i.test(blocks[0])) salutation = blocks.shift();
  const CLOSING = /^(sincerely|regards|best|warm regards|kind regards|thank you|yours|respectfully)\b/i;
  const sigBlock = blocks.pop().split('\n').map(s => s.trim());
  const sig = sigBlock.pop();
  let closingWord = sigBlock.join(' ');
  if (!closingWord && blocks.length && CLOSING.test(blocks[blocks.length - 1])) closingWord = blocks.pop();
  if (!closingWord) closingWord = 'Sincerely,';
  const bodyParas = blocks.map(b => `<p>${parseInline(b.replace(/\n/g, ' '))}</p>`).join('\n\n      ');
  const body = `  <div class="page">
    <header>
      <div class="name">${esc(name)}</div>
      <div class="contact">
        ${contactHtml}
      </div>
    </header>
    <div class="salutation">${parseInline(salutation)}</div>
    <div class="body">
      ${bodyParas}
    </div>
    <div class="closing">
      ${parseInline(closingWord)}
      <div class="sig">${esc(sig)}</div>
    </div>
  </div>`;
  return doc(`${esc(name)} — Cover Letter`, COVER_LETTER_CSS, body);
}

// ── write HTML, then PDF (if puppeteer is available) ─────────────────────────
const jobs = [];
const cvHtml = renderCvHtml(fs.readFileSync(cvPath, 'utf8'), { role: opts.role });
const cvHtmlPath = path.resolve(outBase + '.html');
fs.writeFileSync(cvHtmlPath, cvHtml);
console.log('HTML:', cvHtmlPath);
jobs.push({ htmlPath: cvHtmlPath, pdfPath: path.resolve(outBase + '.pdf') });

if (opts.cover) {
  const clHtml = renderCoverLetterHtml(fs.readFileSync(opts.cover, 'utf8'));
  const clHtmlPath = path.resolve(outBase + '_CoverLetter.html');
  fs.writeFileSync(clHtmlPath, clHtml);
  console.log('HTML:', clHtmlPath);
  jobs.push({ htmlPath: clHtmlPath, pdfPath: path.resolve(outBase + '_CoverLetter.pdf') });
}

// Resolve puppeteer from the skill dir first, then from the workspace (CWD) where
// the user likely ran `npm install puppeteer`. Node's bare-import resolution only
// walks up from this script's location, so the CWD fallback is what lets a
// workspace-installed puppeteer be found by a skill installed elsewhere.
import { createRequire } from 'module';
async function loadPuppeteer() {
  try { return (await import('puppeteer')).default; } catch {}
  try {
    const req = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')).href);
    return (await import(pathToFileURL(req.resolve('puppeteer')).href)).default;
  } catch {}
  return null;
}
const puppeteer = await loadPuppeteer();
if (!puppeteer) {
  console.warn('\npuppeteer not installed — wrote HTML only. To get PDFs: npm install puppeteer');
  process.exit(0);
}

const PDF_OPTS = { format: 'Letter', printBackground: true, displayHeaderFooter: false,
  margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } };
const browser = await puppeteer.launch({ headless: true });
try {
  for (const { htmlPath, pdfPath } of jobs) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, ...PDF_OPTS });
    console.log('PDF: ', pdfPath);
  }
} finally { await browser.close(); }
