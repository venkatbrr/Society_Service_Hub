const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.lstatSync(fromPath);
    if (stat.isFile()) {
      fs.copyFileSync(fromPath, toPath);
    } else if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    }
  });
}

try {
  copyFolderSync('admin-dashboard', 'dist/admin');
  copyFolderSync('admin-dashboard', 'public/admin');
  console.log('Successfully copied admin-dashboard to dist/admin and public/admin');
} catch (err) {
  console.error('Failed to copy admin-dashboard:', err);
  process.exit(1);
}

// Copy landing.html to dist so Vercel can serve it at the root route
try {
  const distLandingPath = path.join(__dirname, 'dist', 'landing.html');
  const publicLandingPath = path.join(__dirname, 'public', 'landing.html');

  if (fs.existsSync(publicLandingPath)) {
    fs.copyFileSync(publicLandingPath, distLandingPath);
    console.log('Successfully copied public/landing.html to dist/landing.html');
  } else {
    console.warn('public/landing.html not found, skipping');
  }
} catch (err) {
  console.error('Failed to copy landing.html:', err);
  process.exit(1);
}
