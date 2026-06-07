const fs = require('fs');
const path = require('path');

const VCF_DIR = "C:\\Users\\venka\\OneDrive\\Desktop\\service providers\\whatsapp chat\\WhatsApp Chat with Aspiration Living residents Group";
const files = fs.readdirSync(VCF_DIR);
const vcfFiles = files.filter(f => f.toLowerCase().endsWith('.vcf'));

const CATEGORIES = [
  'Maid', 'Cook', 'Electrician', 'Plumber', 'AC Technician', 'Carpenter', 'Painter',
  'Driver', 'Gardener', 'Tailor', 'Ironing / Press', 'Salon / Beautician', 'Door Rangoli',
  'Gas Repair', 'Gas Agency', 'Cycle Repair', 'Car Repair', 'Bike Repair', 'Washroom Cleaner',
  'Water Supply', 'Pest Control', 'Car Wash', 'Milkman', 'RO / Water Purifier',
  'Grills & Mesh Work', 'Tent House', 'Water Cans', 'Catering', 'Photography', 'Decoration',
  'Boutique', 'Movers & Packers', 'Teaching', 'RTO Agent', 'Aadhar Centre', 'Other'
];

// Let's run the same mapping logic but extract those classified as "Other"
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

function inferCategory(name, filename) {
  const combined = `${name} ${filename}`.toLowerCase();
  for (const [term, category] of Object.entries(CATEGORY_MAPPING)) {
    if (combined.includes(term)) {
      return category;
    }
  }
  return "Other";
}

const others = [];

for (const filename of vcfFiles) {
  const filepath = path.join(VCF_DIR, filename);
  const content = fs.readFileSync(filepath, { encoding: 'utf8', flag: 'r' });
  
  const fnMatch = content.match(/^FN:(.*)$/m);
  let name = fnMatch ? fnMatch[1].trim() : path.basename(filename, '.vcf');
  
  const category = inferCategory(name, filename);
  if (category === "Other") {
    others.push({
      name,
      filename,
      content: content.replace(/\r?\n/g, ' ')
    });
  }
}

console.log(`Found ${others.length} providers in "Other" category:`);
others.forEach(o => {
  console.log(`- File: ${o.filename} | Name: ${o.name}`);
});
