const fs = require('fs');
const path = require('path');

const VCF_DIR = "C:\\Users\\venka\\OneDrive\\Desktop\\service providers\\whatsapp chat\\WhatsApp Chat with Aspiration Living residents Group";
const CHAT_FILE = path.join(VCF_DIR, "WhatsApp Chat with Aspiration Living residents Group.txt");

const CATEGORIES = [
  'Maid', 'Cook', 'Electrician', 'Plumber', 'AC Technician', 'Carpenter', 'Painter',
  'Driver', 'Gardener', 'Tailor', 'Ironing / Press', 'Salon / Beautician', 'Door Rangoli',
  'Gas Repair', 'Gas Agency', 'Cycle Repair', 'Car Repair', 'Bike Repair', 'Washroom Cleaner',
  'Water Supply', 'Pest Control', 'Car Wash', 'Milkman', 'RO / Water Purifier',
  'Grills & Mesh Work', 'Tent House', 'Water Cans', 'Catering', 'Photography', 'Decoration',
  'Boutique', 'Movers & Packers', 'Teaching', 'RTO Agent', 'Aadhar Centre', 'Other'
];

const CATEGORY_MAPPING = {
  'ac': 'AC Technician',
  'cooler': 'AC Technician',
  'refrigerator': 'AC Technician',
  'fridge': 'AC Technician',
  'tv': 'Other',
  'carpenter': 'Carpenter',
  'wood': 'Carpenter',
  'furniture': 'Carpenter',
  'painter': 'Painter',
  'paint': 'Painter',
  'plumber': 'Plumber',
  'leak': 'Plumber',
  'tap': 'Plumber',
  'pipe': 'Plumber',
  'electrician': 'Electrician',
  'wire': 'Electrician',
  'switch': 'Electrician',
  'power': 'Electrician',
  'light': 'Electrician',
  'driver': 'Driver',
  'cab': 'Driver',
  'car': 'Driver', 
  'gardener': 'Gardener',
  'nursery': 'Gardener',
  'tailor': 'Tailor',
  'iron': 'Ironing / Press',
  'laundry': 'Ironing / Press',
  'press': 'Ironing / Press',
  'loundry': 'Ironing / Press',
  'salon': 'Salon / Beautician',
  'beautician': 'Salon / Beautician',
  'beauty': 'Salon / Beautician',
  'rangoli': 'Door Rangoli',
  'muggu': 'Door Rangoli',
  'gas': 'Gas Agency',
  'cylinder': 'Gas Agency',
  'indane': 'Gas Agency',
  'hp gas': 'Gas Agency',
  'bharath': 'Gas Agency',
  'gas repair': 'Gas Repair',
  'cycle': 'Cycle Repair',
  'bike': 'Bike Repair',
  'enfield': 'Bike Repair',
  'car repair': 'Car Repair',
  'mechanic': 'Car Repair',
  'washroom': 'Washroom Cleaner',
  'bathroom': 'Washroom Cleaner',
  'deep cleaning': 'Washroom Cleaner',
  'cleaning': 'Washroom Cleaner',
  'cleaner': 'Washroom Cleaner',
  'pest': 'Pest Control',
  'termite': 'Pest Control',
  'car wash': 'Car Wash',
  'car cleaning': 'Car Wash',
  'zoho car': 'Car Wash',
  'milk': 'Milkman',
  'milkman': 'Milkman',
  'arudra milk': 'Milkman',
  'water purifier': 'RO / Water Purifier',
  'aquaguard': 'RO / Water Purifier',
  'kent': 'RO / Water Purifier',
  'ro ': 'RO / Water Purifier',
  'water filter': 'RO / Water Purifier',
  'grill': 'Grills & Mesh Work',
  'mesh': 'Grills & Mesh Work',
  'window': 'Grills & Mesh Work',
  'tent': 'Tent House',
  'chairs': 'Tent House',
  'table': 'Tent House',
  'water supply': 'Water Supply',
  'water cans': 'Water Cans',
  'bisleri': 'Water Cans',
  'catering': 'Catering',
  'caterer': 'Catering',
  'food': 'Catering',
  'photo': 'Photography',
  'decor': 'Decoration',
  'balloon': 'Decoration',
  'boutique': 'Boutique',
  'packer': 'Movers & Packers',
  'mover': 'Movers & Packers',
  'teach': 'Teaching',
  'tutor': 'Teaching',
  'school': 'Teaching',
  'rto': 'RTO Agent',
  'aadhar': 'Aadhar Centre',
  'pujari': 'Other',
  'pandit': 'Other',
  'priest': 'Other',
  'panthulu': 'Other',
  'medical': 'Other',
  'pharmacy': 'Other',
  'nurse': 'Other',
  'physio': 'Other',
  'doctor': 'Other',
  'dr.': 'Other',
  'swim': 'Other',
  'coach': 'Other',
  'trainer': 'Other',
  'internet': 'Other',
  'airtel': 'Other',
  'fiber': 'Other',
  'pioneer': 'Other',
  'glass': 'Other',
  'upvc': 'Other'
};

function cleanPhone(phoneStr) {
  if (!phoneStr) return "";
  const isPlus = phoneStr.trim().startsWith('+');
  const digits = phoneStr.replace(/\D/g, '');
  if (!digits) return "";
  
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return isPlus ? `+${digits}` : `+${digits}`;
}

function inferCategory(name, filename) {
  const combined = `${name} ${filename}`.toLowerCase();
  for (const [term, category] of Object.entries(CATEGORY_MAPPING)) {
    if (combined.includes(term)) {
      return category;
    }
  }
  
  if (combined.includes("maid")) return "Maid";
  if (combined.includes("cook")) return "Cook";
  if (combined.includes("electric")) return "Electrician";
  if (combined.includes("plumb")) return "Plumber";
  if (combined.includes("carpenter")) return "Carpenter";
  if (combined.includes("paint")) return "Painter";
  
  return "Other";
}

console.log("Reading VCF files...");
const files = fs.readdirSync(VCF_DIR);
const vcfFiles = files.filter(f => f.toLowerCase().endsWith('.vcf'));
console.log(`Found ${vcfFiles.length} VCF files.`);

const providers = [];

for (const filename of vcfFiles) {
  const filepath = path.join(VCF_DIR, filename);
  const content = fs.readFileSync(filepath, { encoding: 'utf8', flag: 'r' });
  
  const fnMatch = content.match(/^FN:(.*)$/m);
  const telMatches = content.match(/^TEL(?:;.*)?:(.*)$/gm) || [];
  const descMatch = content.match(/^X-WA-BIZ-DESCRIPTION:(.*)$/m);
  const bizNameMatch = content.match(/^X-WA-BIZ-NAME:(.*)$/m);
  
  let name = fnMatch ? fnMatch[1].trim() : path.basename(filename, '.vcf');
  
  let telNumbers = telMatches.map(t => {
    const parts = t.split(':');
    return parts.length > 1 ? parts[1].trim() : "";
  }).filter(Boolean);
  
  let phone = telNumbers.length > 0 ? cleanPhone(telNumbers[0]) : "";
  const description = descMatch ? descMatch[1].trim() : "";
  const bizName = bizNameMatch ? bizNameMatch[1].trim() : "";
  
  if (!phone) {
    const phoneInFile = content.match(/\+?\d[\d\s-]{8,14}\d/g);
    if (phoneInFile) {
      phone = cleanPhone(phoneInFile[0]);
    }
  }
  
  const category = inferCategory(name, filename);
  name = name.replace(/[\r\n]/g, '').replace(/\\/g, '').trim();
  
  providers.push({
    name,
    phone,
    category,
    description: description || bizName || null,
    filename,
    vcard_phones: telNumbers.map(cleanPhone).filter(Boolean),
    feedback: []
  });
}

// Deduplicate by phone
const dedupedProviders = {};
for (const p of providers) {
  if (!p.phone) continue;
  const ph = p.phone;
  if (!dedupedProviders[ph]) {
    dedupedProviders[ph] = p;
  } else {
    const existing = dedupedProviders[ph];
    if (!existing.description && p.description) {
      existing.description = p.description;
    }
    if (p.name.length < existing.name.length) {
      existing.name = p.name;
    }
    existing.vcard_phones = Array.from(new Set([...existing.vcard_phones, ...p.vcard_phones]));
  }
}

const uniqueProviders = Object.values(dedupedProviders);
console.log(`Deduplicated to ${uniqueProviders.length} unique providers.`);

let chatLines = [];
if (fs.existsSync(CHAT_FILE)) {
  console.log("Reading chat file...");
  const chatContent = fs.readFileSync(CHAT_FILE, { encoding: 'utf8' });
  chatLines = chatContent.split('\n');
  console.log(`Read ${chatLines.length} lines of chat.`);
} else {
  console.log(`Chat file not found at ${CHAT_FILE}`);
}

function searchMentions(p, lines) {
  const nameClean = p.name.toLowerCase();
  const coreName = nameClean.replace(/(ira|kollur|aspiration|aspire|resident|apartment|society|group|owner|living)/g, '').trim();
  const nameTokens = coreName.split(/\s+/).filter(t => t.length > 2);
  
  const filenameClean = p.filename.toLowerCase();
  const filenameNoExt = path.basename(filenameClean, '.vcf');
  
  const phonePatterns = [];
  for (const ph of p.vcard_phones) {
    const digits = ph.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      phonePatterns.push(last10);
      phonePatterns.push(`${last10.slice(0, 5)} ${last10.slice(5)}`);
    }
  }
  
  const matches = [];
  const seenIndices = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    let matched = false;
    
    if (lineLower.includes(filenameNoExt) || lineLower.includes(filenameClean)) {
      matched = true;
    }
    
    if (!matched) {
      for (const pat of phonePatterns) {
        if (lineLower.includes(pat)) {
          matched = true;
          break;
        }
      }
    }
    
    if (!matched && nameTokens.length > 0) {
      let matchesCount = 0;
      for (const tok of nameTokens) {
        if (lineLower.includes(tok)) {
          matchesCount++;
        }
      }
      if (matchesCount === nameTokens.length) {
        matched = true;
      }
    }
    
    if (matched) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      const contextBlock = [];
      for (let idx = start; idx <= end; idx++) {
        const cleaned = lines[idx].trim();
        if (cleaned) {
          contextBlock.push(cleaned);
        }
      }
      
      const contextStr = contextBlock.join('\n');
      if (!seenIndices.has(i)) {
        matches.push(contextStr);
        for (let s = start; s <= end; s++) {
          seenIndices.add(s);
        }
      }
    }
  }
  return matches.slice(0, 8);
}

console.log("Analyzing feedback...");
for (const p of uniqueProviders) {
  p.feedback = searchMentions(p, chatLines);
}

const outputPath = path.join("C:\\Users\\venka\\OneDrive\\Desktop\\service providers\\whatsapp chat", "extracted_providers.md");
console.log(`Writing output to ${outputPath}...`);

let outStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
outStream.write("# Extracted Service Providers from WhatsApp Chat\n\n");
outStream.write(`This document contains **${uniqueProviders.length}** service providers extracted from the WhatsApp chat logs and VCF files of the Aspiration Living Residents Group. These can be inserted directly into the Society Service Hub app.\n\n`);

const byCategory = {};
for (const p of uniqueProviders) {
  const cat = p.category;
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(p);
}

outStream.write("## Summary of Providers by Category\n\n");
outStream.write("| Category | Count | Providers |\n");
outStream.write("| --- | --- | --- |\n");
for (const cat of Object.keys(byCategory).sort()) {
  const count = byCategory[cat].length;
  let names = byCategory[cat].slice(0, 5).map(p => p.name).join(', ');
  if (count > 5) {
    names += ` (+${count - 5} more)`;
  }
  outStream.write(`| **${cat}** | ${count} | ${names} |\n`);
}
outStream.write("\n---\n\n");

outStream.write("## Detailed Providers List & Feedback\n\n");
for (const cat of Object.keys(byCategory).sort()) {
  outStream.write(`### Category: ${cat}\n\n`);
  const sortedProvs = byCategory[cat].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of sortedProvs) {
    outStream.write(`#### ${p.name}\n`);
    outStream.write(`- **Phone**: \`${p.phone}\`\n`);
    outStream.write(`- **Source File**: \`${p.filename}\`\n`);
    if (p.description) {
      outStream.write(`- **Bio/Description**: *${p.description}*\n`);
    }
    
    if (p.feedback && p.feedback.length > 0) {
      outStream.write("- **WhatsApp Mentions & Context**:\n");
      for (const fb of p.feedback) {
        const formatted = fb.split('\n').map(l => `  > ${l}`).join('\n');
        outStream.write(`${formatted}\n\n`);
      }
    } else {
      outStream.write("- **WhatsApp Mentions**: *No specific text discussions found (shared via contact card).* \n\n");
    }
    
    const escName = p.name.replace(/'/g, "''");
    const escDesc = p.description ? p.description.replace(/'/g, "''") : null;
    const descSql = escDesc ? `'${escDesc}'` : "NULL";
    
    let sql = `INSERT INTO public.service_providers (community_id, created_by, name, phone, category, description, fraud_status, visibility)\n`;
    sql += `VALUES ('YOUR_COMMUNITY_ID', 'YOUR_USER_ID', '${escName}', '${p.phone}', '${p.category}', ${descSql}, 'PASS', 'COMMUNITY');`;
    
    outStream.write("```sql\n");
    outStream.write(sql + "\n");
    outStream.write("```\n\n");
    outStream.write("---\n\n");
  }
}

outStream.end();
console.log("Done!");
