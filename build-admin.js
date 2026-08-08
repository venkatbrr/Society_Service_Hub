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
// process.env at runtime. Substitute the environment's config into the copy
// under dist/ — never into the admin-dashboard/ source.
//
// Every entry here is a publishable value: the Supabase URL and anon key are
// protected by RLS, and an OAuth web client ID ships to every browser by
// design. They are placeholders so the console follows its *deployment's*
// environment, not so they stay secret. A service role key must never appear.
const ADMIN_SUBSTITUTIONS = [
  {
    file: path.join('dist', 'admin', 'js', 'supabase-config.js'),
    replacements: {
      __SUPABASE_URL__: 'EXPO_PUBLIC_SUPABASE_URL',
      __SUPABASE_ANON_KEY__: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    },
  },
  {
    file: path.join('dist', 'admin', 'js', 'auth.js'),
    replacements: {
      __GOOGLE_WEB_CLIENT_ID__: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    },
  },
];

try {
  const missing = ADMIN_SUBSTITUTIONS.flatMap(({ replacements }) =>
    Object.values(replacements).filter((envVar) => !process.env[envVar])
  );

  if (missing.length > 0) {
    console.error(
      `Missing ${missing.join(', ')}.\n` +
      'The admin console cannot be built without them — refusing to ship a\n' +
      'dashboard with unsubstituted placeholders.'
    );
    process.exit(1);
  }

  for (const { file, replacements } of ADMIN_SUBSTITUTIONS) {
    let contents = fs.readFileSync(file, 'utf8');

    for (const [placeholder, envVar] of Object.entries(replacements)) {
      contents = contents.split(placeholder).join(process.env[envVar]);
    }

    const unresolved = Object.keys(replacements).filter((p) => contents.includes(p));
    if (unresolved.length > 0) {
      console.error(`Placeholder substitution failed in ${file}: ${unresolved.join(', ')}`);
      process.exit(1);
    }

    fs.writeFileSync(file, contents);
  }

  console.log(
    `Injected admin config into dist/admin (${process.env.EXPO_PUBLIC_SUPABASE_URL})`
  );
} catch (err) {
  console.error('Failed to inject config into admin build:', err);
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
