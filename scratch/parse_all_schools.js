const fs = require('fs');
const XLSX = require('xlsx');

const filePath = 'C:\\Users\\venka\\Downloads\\West_Hyderabad_Schools_Directory_Kokapet_to_Patancheru.xlsx';

const workbook = XLSX.readFile(filePath);
const allSchools = [];

// Sheet 1: Schools Directory
const sheet1 = XLSX.utils.sheet_to_json(workbook.Sheets['Schools Directory']);
sheet1.forEach(row => {
  if (row['School Name']) {
    allSchools.push({
      name: row['School Name'].trim(),
      area_locality: (row['Area / Locality'] || 'West Hyderabad').trim(),
      syllabus: (row['Type / Board Notes'] || 'CBSE').trim(),
      address: (row['Address (Google Maps)'] || '').trim(),
      contact_phone: (row['Phone'] || '').trim() === '-' ? '' : (row['Phone'] || '').trim(),
      google_rating: (row['Google Rating'] || '').trim() === '-' ? '' : (row['Google Rating'] || '').trim(),
      website: (row['Website'] || '').trim() === '-' ? '' : (row['Website'] || '').trim(),
      google_maps_link: (row['Google Maps Link'] || '').trim() === '-' ? '' : (row['Google Maps Link'] || '').trim(),
      source: 'Schools Directory'
    });
  }
});

// Sheet 2: Prior Confirmed Entries
const sheet2 = XLSX.utils.sheet_to_json(workbook.Sheets['Prior Confirmed Entries']);
sheet2.forEach(row => {
  if (row['School Name']) {
    allSchools.push({
      name: row['School Name'].trim(),
      area_locality: (row['Area / Locality'] || 'West Hyderabad').trim(),
      syllabus: (row['Board(s) / Curriculum'] || 'CBSE').trim(),
      address: (row['Address'] || '').trim(),
      contact_phone: (row['Phone'] || '').trim() === '-' ? '' : (row['Phone'] || '').trim(),
      google_rating: '',
      website: (row['Website'] || '').trim() === '-' ? '' : (row['Website'] || '').trim(),
      google_maps_link: '',
      source: 'Prior Confirmed Entries'
    });
  }
});

console.log(`Total extracted schools: ${allSchools.length}`);
console.log('\nSample extracted school:');
console.log(JSON.stringify(allSchools[0], null, 2));

// Save json output to scratch/all_schools.json
fs.writeFileSync('scratch/all_schools.json', JSON.stringify(allSchools, null, 2));
console.log('\nSaved all schools to scratch/all_schools.json');
