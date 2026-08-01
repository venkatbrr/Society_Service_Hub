import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.json']);
const excludeTop = new Set(['node_modules', '.git', '.expo', 'dist']);
const emojiRE = /[\p{Extended_Pictographic}\u{2600}-\u{27BF}]/u;

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const top = rel.split('/')[0];
      if (excludeTop.has(top)) {
        continue;
      }
      walk(full, out);
      continue;
    }

    if (!exts.has(path.extname(entry.name))) {
      continue;
    }

    out.push({ full, rel });
  }
}

const files = [];
walk(root, files);

for (const file of files) {
  const text = fs.readFileSync(file.full, 'utf8');
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    if (emojiRE.test(lines[i])) {
      console.log(`${file.rel}:${i + 1}:${lines[i]}`);
    }
  }
}
