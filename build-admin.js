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

// Post-build script to inject the public landing page at the root route
// DISABLED: SPA mode doesn't use a separate landing page — Expo index.html handles all routing
