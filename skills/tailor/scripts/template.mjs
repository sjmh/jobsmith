// template.mjs — the SINGLE styling surface for the tailor-resume renderer.
//
// This is the ONE file to edit when a candidate wants their CV "styled after"
// a résumé they like. Adjust the design tokens (:root variables) for colour and
// font, and the per-element rules for spacing/size. The default below is a clean,
// neutral, ATS-safe single-column design that reads well on screen and in print.
//
// Fonts load from Google Fonts with system fallbacks, so PDFs still render fine
// offline (they just fall back to the system stack). Swap the FONTS link and the
// --serif/--body/--mono tokens together when changing typefaces.

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;

// Design tokens + base layout shared by every document. EDIT THESE to re-skin.
const BASE_CSS = `
  :root{
    --paper:#FFFFFF;--ink:#1A1A1A;--muted:#5A5A5A;--faint:#8A8A8A;
    --accent:#1F4E79;--rule:#E2E2E2;
    --serif:'Source Serif 4',Georgia,serif;
    --body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,monospace;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--paper);color:var(--ink);font-family:var(--body);line-height:1.5;-webkit-font-smoothing:antialiased;padding:48px 20px;display:flex;justify-content:center}
  .page{width:100%;max-width:760px}
  header{border-bottom:2px solid var(--ink);padding-bottom:16px;margin-bottom:24px}
  .name{font-family:var(--serif);font-weight:600;font-size:40px;line-height:1.05;letter-spacing:-.01em}
  .role{font-family:var(--mono);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-top:10px}
  .contact{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-top:12px;display:flex;flex-wrap:wrap;gap:5px 14px}
  .contact a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--rule)}
  .contact a:hover{color:var(--accent);border-color:var(--accent)}
`;

// CV-specific styles.
const CV_CSS = `
  section{margin-bottom:24px}
  .sec-label{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);display:flex;align-items:center;gap:12px;margin-bottom:14px}
  .sec-label::after{content:"";flex:1;height:1px;background:var(--rule)}
  .summary{font-size:15px;line-height:1.6;color:#2A2A2A}
  .job{margin-bottom:18px}
  .job:last-child{margin-bottom:0}
  .job-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
  .job-title{font-family:var(--serif);font-size:17px;font-weight:600}
  .job-org{color:var(--accent);font-weight:600}
  .job-dates{font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap}
  .job-blurb{font-size:13px;color:var(--muted);margin:6px 0 10px;line-height:1.5}
  ul{list-style:none}
  li{position:relative;padding-left:16px;font-size:13.5px;line-height:1.5;margin-bottom:5px;color:#2A2A2A}
  li::before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;background:var(--accent);border-radius:50%}
  .row{display:grid;grid-template-columns:150px 1fr;gap:6px 18px;margin-bottom:7px;align-items:baseline}
  .row-key{font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;color:var(--accent);text-transform:uppercase}
  .row-val{font-size:13.5px;color:#2A2A2A}
  @page{size:Letter;margin:0.5in}
  @media print{
    body{padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{max-width:none}
    .name{font-size:32px}
    section{margin-bottom:16px}
    .job{margin-bottom:12px}
    li{font-size:11.5px;margin-bottom:4px;break-inside:avoid}
    .summary{font-size:12.5px}
    .row-val,.job-blurb{font-size:11.5px}
    .sec-label{break-after:avoid}
    .job-head{break-inside:avoid;break-after:avoid}
  }
`;

// Cover-letter-specific styles (used only if you render a cover letter).
const COVER_LETTER_CSS = `
  header{margin-bottom:32px}
  .body{font-size:15px;line-height:1.7;color:#2A2A2A}
  .body p{margin-bottom:1.3em}
  .salutation{margin-bottom:1.3em;font-size:15px;color:#2A2A2A}
  .closing{margin-top:1.8em;font-size:15px;color:#2A2A2A;line-height:1.7}
  .sig{font-family:var(--serif);font-size:19px;font-weight:600;margin-top:1.4em;color:var(--ink)}
  @page{size:Letter;margin:0.5in}
  @media print{
    body{padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{max-width:none}
    .name{font-size:32px}
    .body,.salutation,.closing{font-size:12.5px}
  }
`;

export function doc(title, css, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${FONTS}
<style>${BASE_CSS}${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export { CV_CSS, COVER_LETTER_CSS };
