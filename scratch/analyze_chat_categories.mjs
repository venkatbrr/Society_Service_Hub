import fs from 'fs';

const path = 'C:/Users/venka/OneDrive/Desktop/service providers/whatsapp chat/WhatsApp Chat with Aspiration Living residents Group/WhatsApp Chat with Aspiration Living residents Group.txt';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);

const vcfNames = [];
const askLines = [];

for (const line of lines) {
  const vcfMatch = line.match(/-\s+(.+?\.vcf)\s+\(file attached\)/i);
  if (vcfMatch) {
    vcfNames.push(vcfMatch[1].trim());
  }

  const lower = line.toLowerCase();
  const hasAskSignal = /any|contact|number|reference|recommend|share/.test(lower);
  const hasServiceSignal = /(plumber|electric|ac|cook|maid|driver|carpenter|painter|gas|water|milk|bisleri|tent|cater|rangoli|tailor|beautician|salon|mesh|grill|ro|aquaguard|aadhar|rto|movers|packers|bike|car|cycle|washing machine|fridge|appliance|internet|wifi|doctor|physician|clinic|diagnostic|medical|pharmacy|school|tuition|pandit|pujari|photograph|decoration|car wash|cleaning)/.test(lower);
  if (hasAskSignal) {
    if (hasServiceSignal) {
      askLines.push(line);
    }
  }
}

const bucketRegex = {
  ac: /\bac\b|air ?condition|cool/,
  plumber: /plumb/,
  electrician: /electric/,
  maid: /maid/,
  cook: /cook|catering/,
  waterPurifier: /aquag|ro|water filter|purifier|kent/,
  gas: /gas|indane|bharat|hp/,
  grillsMesh: /mesh|grill/,
  cleaners: /clean/,
  packers: /packer|mover|shift/,
  carBikeRepair: /car|bike|mechanic|puncture|wash/,
  milk: /milk/,
  decoration: /decor|balloon|tent/,
  teacher: /school|teacher|tuition|coaching/,
  doctorMedical: /doctor|clinic|diagnostic|medical|pharmacy|apollo/,
  internetWifi: /airtel|jio|wifi|internet|broadband/,
  applianceRepair: /washing machine|fridge|refrigerator|appliance/,
  priestPuja: /pandit|pujari|panthulu|swamy|temple/,
};

const bucketCounts = {};
for (const [bucket, regex] of Object.entries(bucketRegex)) {
  bucketCounts[bucket] = vcfNames.filter((name) => regex.test(name.toLowerCase())).length;
}

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/\.vcf$/i, '')
    .replace(/[^a-z0-9\s/&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stop = new Set([
  'ira',
  'aspiration',
  'kollur',
  'contact',
  'contacts',
  'guy',
  'service',
  'services',
  'for',
  'in',
  'at',
  'the',
  'and',
  'of',
  'a',
  'an',
  'near',
  'person',
  'number',
]);

const wordFreq = new Map();
for (const name of vcfNames) {
  const tokens = normalize(name).split(' ');
  for (const token of tokens) {
    if (!token) continue;
    if (stop.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (token.length < 3) continue;
    wordFreq.set(token, (wordFreq.get(token) || 0) + 1);
  }
}

const topWords = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);

console.log(JSON.stringify(
  {
    totalLines: lines.length,
    vcfShares: vcfNames.length,
    askSignals: askLines.length,
    bucketCounts,
    topWords,
    sampleVcf: vcfNames.slice(0, 40),
    sampleAsk: askLines.slice(0, 60),
  },
  null,
  2
));
