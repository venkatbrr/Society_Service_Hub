const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const excelPath = process.argv[2];
const outputPath = process.argv[3] || 'data/westHyderabadSchools_from_excel.md';

if (!excelPath) {
  console.error('Usage: node scratch/export_schools_excel_to_md.js <excelPath> [outputPath]');
  process.exit(1);
}

function clean(value) {
  const v = String(value ?? '').trim();
  return v === '-' ? '' : v;
}

function mdEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames.includes('Schools Directory')
  ? 'Schools Directory'
  : workbook.SheetNames[0];

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

const schools = rows
  .filter((row) => clean(row['School Name']))
  .map((row, idx) => ({
    id: idx + 1,
    area: clean(row['Area / Locality']),
    schoolName: clean(row['School Name']),
    boardNotes: clean(row['Type / Board Notes']),
    address: clean(row['Address (Google Maps)']),
    phone: clean(row['Phone']),
    googleRating: clean(row['Google Rating']),
    website: clean(row['Website']),
    googleMapsLink: clean(row['Google Maps Link']),
    verifiedVia: clean(row['Verified Via']),
  }));

const areaCount = new Map();
for (const school of schools) {
  const key = school.area || 'Unknown';
  areaCount.set(key, (areaCount.get(key) || 0) + 1);
}

const areaLines = Array.from(areaCount.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([area, count]) => `- ${area}: ${count}`)
  .join('\n');

let md = '';
md += '# West Hyderabad Schools Directory\n\n';
md += `Source file: ${path.basename(excelPath)}\n\n`;
md += `Sheet used: ${sheetName}\n\n`;
md += `Total schools: ${schools.length}\n\n`;
md += '## Area-wise Count\n\n';
md += areaLines + '\n\n';
md += '## School Details\n\n';
md += '| # | Area / Locality | School Name | Type / Board Notes | Address (Google Maps) | Phone | Google Rating | Website | Google Maps Link | Verified Via |\n';
md += '|---:|---|---|---|---|---|---|---|---|---|\n';

for (const school of schools) {
  md += `| ${school.id} | ${mdEscape(school.area)} | ${mdEscape(school.schoolName)} | ${mdEscape(school.boardNotes)} | ${mdEscape(school.address)} | ${mdEscape(school.phone)} | ${mdEscape(school.googleRating)} | ${mdEscape(school.website)} | ${mdEscape(school.googleMapsLink)} | ${mdEscape(school.verifiedVia)} |\n`;
}

const absoluteOutputPath = path.isAbsolute(outputPath)
  ? outputPath
  : path.resolve(process.cwd(), outputPath);

fs.writeFileSync(absoluteOutputPath, md, 'utf8');
console.log(`Generated: ${absoluteOutputPath}`);
console.log(`Rows exported: ${schools.length}`);
