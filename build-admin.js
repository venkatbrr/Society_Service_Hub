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
  console.log('Successfully copied admin-dashboard to dist/admin');
} catch (err) {
  console.error('Failed to copy admin-dashboard:', err);
  process.exit(1);
}

// Post-build script to inject the public landing page at the root route
try {
  const distIndexPath = path.join(__dirname, 'dist', 'index.html');
  const backupIndexPath = path.join(__dirname, 'dist', 'index.bak.html');
  const publicIndexPath = path.join(__dirname, 'public', 'index.html');

  if (fs.existsSync(distIndexPath)) {
    // Backup the original index.html
    fs.copyFileSync(distIndexPath, backupIndexPath);
    console.log('Successfully backed up original dist/index.html to dist/index.bak.html');

    // Overwrite dist/index.html with the custom landing page
    if (fs.existsSync(publicIndexPath)) {
      fs.copyFileSync(publicIndexPath, distIndexPath);
      console.log('Successfully replaced dist/index.html with the public landing page');
    } else {
      console.error('Public landing page not found at public/index.html');
      process.exit(1);
    }
  } else {
    console.warn('dist/index.html not found, skipping landing page injection');
  }
} catch (err) {
  console.error('Failed to inject landing page:', err);
  process.exit(1);
}
