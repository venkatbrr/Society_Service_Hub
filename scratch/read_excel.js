const fs = require('fs');
const XLSX = require('xlsx');

const filePath = 'C:\\Users\\venka\\Downloads\\West_Hyderabad_Schools_Directory_Kokapet_to_Patancheru.xlsx';

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Sheet Names:', workbook.SheetNames);

  for (const name of workbook.SheetNames) {
    console.log(`\n================ SHEET: ${name} ================`);
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`Total rows in ${name}:`, data.length);
    if (data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
      console.log('First 5 rows:');
      console.log(JSON.stringify(data.slice(0, 5), null, 2));
    }
  }
} catch (err) {
  console.error('Error reading excel file:', err);
}
