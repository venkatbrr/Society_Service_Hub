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

// The admin console is plain files with no bundler, so it cannot read
// process.env at runtime. Substitute the environment's Supabase config into
// the copy under dist/ — never into the admin-dashboard/ source.
try {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      'Missing EXPO_PUBLIC_SUPABASE_URL and/or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'The admin console cannot be built without them — refusing to ship a\n' +
      'dashboard with unsubstituted placeholders.'
    );
    process.exit(1);
  }

  const configPath = path.join('dist', 'admin', 'js', 'supabase-config.js');
  const original = fs.readFileSync(configPath, 'utf8');
  const substituted = original
    .replace('__SUPABASE_URL__', supabaseUrl)
    .replace('__SUPABASE_ANON_KEY__', supabaseAnonKey);

  if (substituted.includes('__SUPABASE_URL__') || substituted.includes('__SUPABASE_ANON_KEY__')) {
    console.error(`Placeholder substitution failed in ${configPath}`);
    process.exit(1);
  }

  fs.writeFileSync(configPath, substituted);
  console.log(`Injected Supabase config into dist/admin (${supabaseUrl})`);
} catch (err) {
  console.error('Failed to inject Supabase config into admin build:', err);
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
