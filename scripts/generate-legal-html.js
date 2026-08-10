const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled);
  fn(
    m,
    m.exports,
    (dep) => {
      if (dep.startsWith('./') || dep.startsWith('../')) {
        const fullDep = path.resolve(path.dirname(filePath), dep.endsWith('.ts') ? dep : dep + '.ts');
        return loadTsModule(fullDep);
      }
      return require(dep);
    },
    path.dirname(filePath),
    filePath
  );
  return m.exports;
}

const rootDir = path.resolve(__dirname, '..');
const { TERMS, PRIVACY } = loadTsModule(path.join(rootDir, 'data', 'legal.ts'));
const { renderMarkupToHtml, escapeHtml } = loadTsModule(path.join(rootDir, 'lib', 'legalMarkup.ts'));

function renderBlock(block) {
  switch (block.kind) {
    case 'callout':
      return `  <div class="callout">\n    <p>${renderMarkupToHtml(block.text)}</p>\n  </div>`;
    case 'para':
      return `  <p>${renderMarkupToHtml(block.text)}</p>`;
    case 'subheading':
      return `  <h3>${escapeHtml(block.text)}</h3>`;
    case 'bullets':
      return `  <ul>\n${block.items.map((item) => `    <li>${renderMarkupToHtml(item)}</li>`).join('\n')}\n  </ul>`;
    case 'table': {
      const headHtml = `    <tr>${block.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
      const rowsHtml = block.rows
        .map((row) => `    <tr>${row.map((cell) => `<td>${renderMarkupToHtml(cell)}</td>`).join('')}</tr>`)
        .join('\n');
      return `  <table>\n${headHtml}\n${rowsHtml}\n  </table>`;
    }
    default:
      return '';
  }
}

function generateHtml(doc) {
  const isTerms = doc.id === 'terms';
  const navLinks = isTerms
    ? '<a href="/privacy">Privacy</a><a href="/">Home</a>'
    : '<a href="/terms">Terms</a><a href="/">Home</a>';
  const footerAlt = isTerms
    ? '<p>© 2026 Wooru. See also our <a href="/privacy">Privacy Policy</a>.</p>'
    : '<p>© 2026 Wooru. See also our <a href="/terms">Terms of Service</a>.</p>';
  const description = isTerms
    ? 'The terms governing use of Wooru by residents of gated communities.'
    : 'How Wooru collects, uses, stores and protects personal data of residents of gated communities.';

  const introHtml = doc.intro.map(renderBlock).join('\n\n');

  const sectionsHtml = doc.sections
    .map((sec) => {
      const heading = `  <h2>${sec.number}. ${escapeHtml(sec.heading)}</h2>`;
      const blocks = sec.blocks.map(renderBlock).join('\n\n');
      return `${heading}\n${blocks}`;
    })
    .join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(doc.title)} — Wooru</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/images/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#FAFAFA; --surface:#FFFFFF; --primary:#0F3732; --accent:#10B981;
    --text-primary:#111827; --text-secondary:#4B5563; --text-muted:#9CA3AF;
    --border:#E5E7EB; --warn-bg:#FFFBEB; --warn-border:#FDE68A;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
    background:var(--bg); color:var(--text-primary); line-height:1.7;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:760px;margin:0 auto;padding:0 24px 96px}
  header{border-bottom:1px solid var(--border);background:var(--surface);margin-bottom:48px}
  .head-inner{max-width:760px;margin:0 auto;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .logo{font-weight:700;font-size:1.25rem;color:var(--primary);text-decoration:none;letter-spacing:-0.02em}
  .nav a{color:var(--text-secondary);text-decoration:none;font-size:.9rem;margin-left:20px}
  .nav a:hover{color:var(--primary)}
  h1{font-size:2.1rem;line-height:1.25;letter-spacing:-0.03em;color:var(--primary);margin-bottom:12px}
  h2{font-size:1.25rem;letter-spacing:-0.02em;color:var(--primary);margin:40px 0 12px;padding-top:8px}
  h3{font-size:1rem;color:var(--text-primary);margin:24px 0 8px}
  p,li{color:var(--text-secondary);font-size:.97rem}
  p{margin-bottom:14px}
  ul,ol{margin:0 0 16px 22px}
  li{margin-bottom:7px}
  strong{color:var(--text-primary);font-weight:600}
  a{color:var(--accent)}
  .meta{color:var(--text-muted);font-size:.87rem;margin-bottom:32px}
  .callout{background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:10px;padding:16px 18px;margin:24px 0}
  .callout p{margin:0;color:#78350F;font-size:.92rem}
  table{width:100%;border-collapse:collapse;margin:16px 0 24px;font-size:.92rem}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--text-primary);font-weight:600;background:#F9FAFB}
  td{color:var(--text-secondary)}
  .tag{display:inline-block;background:#F3F4F6;border-radius:5px;padding:1px 7px;font-size:.83rem;color:var(--text-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  footer{border-top:1px solid var(--border);margin-top:64px;padding-top:24px;color:var(--text-muted);font-size:.87rem}
  @media (max-width:600px){h1{font-size:1.7rem}.wrap{padding:0 18px 64px}table{font-size:.86rem}th,td{padding:8px}}
</style>
</head>
<body>
<header>
  <div class="head-inner">
    <a class="logo" href="/">Wooru</a>
    <nav class="nav">${navLinks}</nav>
  </div>
</header>

<div class="wrap">
  <h1>${escapeHtml(doc.title)}</h1>
  <p class="meta">Last updated: ${escapeHtml(doc.lastUpdated)}</p>

${introHtml}

${sectionsHtml}

  <footer>
    ${footerAlt}
  </footer>
</div>
</body>
</html>
`;
}

const termsHtml = generateHtml(TERMS);
const privacyHtml = generateHtml(PRIVACY);

fs.writeFileSync(path.join(rootDir, 'public', 'terms.html'), termsHtml, 'utf8');
fs.writeFileSync(path.join(rootDir, 'public', 'privacy.html'), privacyHtml, 'utf8');

console.log('Successfully regenerated public/terms.html and public/privacy.html from data/legal.ts');
