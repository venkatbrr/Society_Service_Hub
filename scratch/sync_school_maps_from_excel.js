const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const repoRoot = path.resolve(__dirname, '..');
const tsPath = path.join(repoRoot, 'data', 'westHyderabadSchools.ts');
const excelPath = 'C:/Users/venka/Downloads/West_Hyderabad_Schools_Directory_Full_Corridor.xlsx';

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExcelMap() {
  const wb = xlsx.readFile(excelPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

  const direct = new Map();
  const normalized = new Map();

  for (const row of rows) {
    const name = String(row['School Name'] || '').trim();
    const link = String(row['Google Maps Link'] || '').trim();
    if (!name) continue;
    direct.set(name, link);
    normalized.set(normalizeName(name), link);
  }

  return { direct, normalized, rowCount: rows.length, rows };
}

function syncFile() {
  const { direct, normalized, rowCount, rows } = getExcelMap();
  const original = fs.readFileSync(tsPath, 'utf8');

  const blockRegex = /\{[\s\S]*?\n\s*\},?/g;
  const blocks = original.match(blockRegex) || [];

  let matched = 0;
  let changed = 0;
  let missingInSheet = 0;
  const missingNames = [];

  const updated = original.replace(blockRegex, (block) => {
    const nameMatch = block.match(/"name"\s*:\s*"([^"]*)"/);
    const linkMatch = block.match(/"google_maps_link"\s*:\s*"([^"]*)"/);

    if (!nameMatch || !linkMatch) return block;

    const name = nameMatch[1];
    const oldLink = linkMatch[1];

    let newLink;
    if (direct.has(name)) {
      newLink = direct.get(name);
    } else {
      newLink = normalized.get(normalizeName(name));
    }

    if (newLink === undefined) {
      missingInSheet += 1;
      missingNames.push(name);
      return block;
    }

    matched += 1;
    if (oldLink !== newLink) {
      changed += 1;
      return block.replace(
        /("google_maps_link"\s*:\s*")([^"]*)(")/,
        `$1${newLink}$3`
      );
    }

    return block;
  });

  const result = {
    excelRows: rowCount,
    schoolBlocksInTs: blocks.length,
    matched,
    changed,
    missingInSheet,
    missingNames,
  };

  if (missingNames.length > 0) {
    const excelNames = rows.map((r) => String(r['School Name'] || '').trim()).filter(Boolean);
    const suggestions = {};
    for (const missing of missingNames) {
      const missNorm = normalizeName(missing);
      const missTokens = missNorm.split(' ').filter((t) => t.length > 2);
      const candidates = excelNames
        .map((name) => {
          const norm = normalizeName(name);
          let score = 0;
          for (const token of missTokens) {
            if (norm.includes(token)) score += 1;
          }
          return { name, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.name);
      suggestions[missing] = candidates;
    }
    result.suggestions = suggestions;
  }

  return { updated, original, result };
}

const { updated, original, result } = syncFile();
const writeFlag = process.argv.includes('--write');

console.log(JSON.stringify(result, null, 2));

if (writeFlag) {
  if (updated !== original) {
    fs.writeFileSync(tsPath, updated, 'utf8');
    console.log('Updated file:', tsPath);
  } else {
    console.log('No changes required.');
  }
}
