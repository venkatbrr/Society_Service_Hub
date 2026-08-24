const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env if present and environment variables not already set
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      // Remove surrounding quotes or inline comments
      val = val.replace(/^["']|["']$/g, '').split('#')[0].trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

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
  copyFolderSync('admin-dashboard', 'public/admin');
  console.log('Successfully copied admin-dashboard to public/admin');
} catch (err) {
  console.error('Failed to copy admin-dashboard:', err);
  process.exit(1);
}

// The admin console is plain files with no bundler, so it cannot read
// process.env at runtime. Substitute the environment's config into the copy
// under dist/ and public/ — never into the admin-dashboard/ source.
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
  {
    file: path.join('public', 'admin', 'js', 'supabase-config.js'),
    replacements: {
      __SUPABASE_URL__: 'EXPO_PUBLIC_SUPABASE_URL',
      __SUPABASE_ANON_KEY__: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    },
  },
  {
    file: path.join('public', 'admin', 'js', 'auth.js'),
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
    `Injected admin config into dist/admin & public/admin (${process.env.EXPO_PUBLIC_SUPABASE_URL})`
  );
} catch (err) {
  console.error('Failed to inject config into admin build:', err);
  process.exit(1);
}

// Put the marketing page at dist/index.html and move the Expo SPA shell to
// dist/app.html.
//
// A vercel.json rewrite of "/" cannot do this: Vercel resolves the filesystem
// before rewrites, so an existing dist/index.html always wins and the root URL
// served the empty SPA shell instead. Google's OAuth brand review reads
// https://wooru.in with no JavaScript, so the root must be real static HTML
// that names the app and explains what it does. vercel.json's catch-all
// therefore rewrites app routes to /app.html, not /index.html.
try {
  const distDir = path.join(__dirname, 'dist');
  const publicLandingPath = path.join(__dirname, 'public', 'landing.html');
  const shellPath = path.join(distDir, 'app.html');
  const rootPath = path.join(distDir, 'index.html');

  if (!fs.existsSync(publicLandingPath)) {
    console.error('public/landing.html not found — refusing to ship a root that Google cannot read');
    process.exit(1);
  }

  // Guard on app.html so a re-run does not overwrite the shell with the
  // landing page already sitting at index.html.
  if (!fs.existsSync(shellPath)) {
    if (!fs.existsSync(rootPath)) {
      console.error('dist/index.html missing — did `expo export --platform web` run?');
      process.exit(1);
    }
    fs.renameSync(rootPath, shellPath);
    console.log('Moved Expo SPA shell to dist/app.html');
  }

  fs.copyFileSync(publicLandingPath, rootPath);
  fs.copyFileSync(publicLandingPath, path.join(distDir, 'landing.html'));
  console.log('Installed landing page at dist/index.html');
} catch (err) {
  console.error('Failed to install landing page at root:', err);
  process.exit(1);
}

// Inject the web <head> into the SPA shell.
//
// `app.config.js` sets `web.output: 'single'`, and under that mode Expo Router
// emits its own minimal boilerplate index.html and **never renders
// `app/+html.tsx`** — that file only applies to static rendering. It looked
// like it was working because Expo's default reset happens to include the same
// `html/body { height: 100% }` and `#root { display: flex }` rules, so the
// layout was fine and nothing obviously broke. Everything else it declares was
// silently absent from every deployed app page:
//
//   - no manifest link and no service worker, so `beforeinstallprompt` could
//     never fire inside the app and `components/PwaInstallBanner.tsx` was dead
//     code — and the entire offline/caching layer never registered at all
//   - no Google Fonts, so Instrument Serif and Plus Jakarta Sans never loaded
//     and the whole Verandah type scale fell back to Georgia / system sans
//   - no theme-color, apple-touch-icon, apple-mobile-web-app meta, or the
//     16/32/48 favicons
//
// This is therefore the real source of truth for the app shell's head. Keep it
// in sync with `public/landing.html`, which carries its own copy because it is
// a static file Expo never touches. `app/+html.tsx` is inert under
// `output: 'single'` — do not add anything there expecting it to ship.
//
// Two things here are load-bearing for startup, not cosmetics:
//
//   - The Google Fonts stylesheet is loaded **non-render-blocking** (`media=print`
//     flipped to `all` on load, with a <noscript> fallback). A plain
//     `rel="stylesheet"` to a third-party host blocks first paint on that
//     request even though `display=swap` means the font itself does not.
//     `lib/webFonts.ts` treats an already-present fonts.googleapis.com link as
//     satisfied, so it does not add a second one here.
//   - Supabase gets a `preconnect`. The very first thing the app does after the
//     bundle evaluates is hit that origin for the session and profile, so
//     paying DNS + TCP + TLS there in parallel with the bundle download —
//     rather than serially after it — takes a full handshake off cold start.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return null;
  }
})();

const APP_SHELL_HEAD = `
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#0F3732" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Wooru" />
    <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-180.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="48x48" href="/images/favicon.png" />
${supabaseOrigin ? `    <link rel="preconnect" href="${supabaseOrigin}" crossorigin />\n` : ''}    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
      media="print"
      onload="this.media='all'"
    />
    <noscript>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    </noscript>
    <style>
      /* Focus rings on web inputs read as a browser artifact against Verandah's
         soft surfaces; the fields carry their own focus treatment. */
      input:focus, textarea:focus, select:focus { outline: none; }
    </style>
    <script>
      (function () {
        if (!('serviceWorker' in navigator)) return;
        var sw = navigator.serviceWorker;
        var registration = null;
        var lastCheck = 0;
        var updatePending = false;
        var reloading = false;

        // True when this page was ALREADY controlled at load time. A
        // controllerchange with no prior controller is just the first-ever
        // registration taking hold — reloading there bounces every new visitor.
        var hadController = !!sw.controller;

        function isTyping() {
          var el = document.activeElement;
          if (!el) return false;
          var tag = el.tagName;
          return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
        }

        // A new worker has taken over, which means the shell and bundle on disk
        // are newer than the ones this tab is running. Reload so the user is on
        // the deployed build — but never yank the page out from under someone
        // mid-input; retry when focus leaves the field or the tab comes back.
        function applyUpdate() {
          if (!updatePending || reloading || isTyping()) return;
          reloading = true;
          window.location.reload();
        }

        sw.addEventListener('controllerchange', function () {
          if (!hadController) { hadController = true; return; }
          updatePending = true;
          applyUpdate();
        });

        function checkForUpdate() {
          if (!registration) return;
          var now = Date.now();
          if (now - lastCheck < 60000) return;
          lastCheck = now;
          registration.update().catch(function () {});
        }

        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState !== 'visible') return;
          applyUpdate();
          checkForUpdate();
        });
        document.addEventListener('focusout', function () { setTimeout(applyUpdate, 0); });

        // An installed PWA can stay open for days. Browsers only re-fetch the
        // worker on navigation, so without this a long-lived session never
        // learns a deploy happened.
        setInterval(checkForUpdate, 30 * 60 * 1000);

        var register = function () {
          sw.register('/service-worker.js').then(function (reg) {
            registration = reg;
            lastCheck = Date.now();
          }).catch(function (error) {
            console.warn('[PWA] Service Worker registration failed:', error);
          });
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          register();
        } else {
          window.addEventListener('load', register);
        }
      })();
    </script>
`;

try {
  const shellPath = path.join(__dirname, 'dist', 'app.html');
  let shell = fs.readFileSync(shellPath, 'utf8');

  if (shell.includes('rel="manifest"')) {
    console.log('App shell head already injected — skipping');
  } else {
    if (!shell.includes('</head>')) {
      console.error('dist/app.html has no </head> — cannot inject the web head');
      process.exit(1);
    }
    shell = shell.replace('</head>', `${APP_SHELL_HEAD}  </head>`);
    fs.writeFileSync(shellPath, shell);
    console.log('Injected PWA + font head into dist/app.html');
  }
} catch (err) {
  console.error('Failed to inject head into dist/app.html:', err);
  process.exit(1);
}

// Stamp the service worker's cache version from the content of what it caches.
//
// `CACHE_NAME` used to be a hand-maintained `wooru-pwa-vN`, and every deploy
// that forgot to bump it left installed clients on the previous build: the
// worker only re-runs `install` when its own bytes change, and `activate` only
// evicts caches whose name differs. So the shell — which carries the <script
// src> for the content-hashed bundle — was replayed from cache indefinitely,
// and with it the entire old app. That is the "new features are not loading"
// class of bug, and it cannot be fixed by discipline: it needs the version to
// be derived, not remembered.
//
// The id hashes `dist/app.html` (which changes whenever the bundle hash
// changes, i.e. on any app code change), the landing page, the manifest, every
// precached image, and the worker's own source. A build that changes none of
// them produces the same id and deliberately keeps the existing cache warm.
try {
  const distDir = path.join(__dirname, 'dist');
  const swPath = path.join(distDir, 'service-worker.js');

  if (!fs.existsSync(swPath)) {
    console.error('dist/service-worker.js missing — did `expo export --platform web` copy public/?');
    process.exit(1);
  }

  const swSource = fs.readFileSync(swPath, 'utf8');
  const PLACEHOLDER = '__WOORU_BUILD_ID__';

  if (!swSource.includes(PLACEHOLDER)) {
    console.log('Service worker build id already stamped — skipping');
  } else {
    const hash = crypto.createHash('sha256');
    // The worker's own source first, so a strategy change alone busts the cache.
    hash.update(swSource);

    const hashFile = (filePath) => {
      if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
        hash.update(fs.readFileSync(filePath));
      }
    };

    hashFile(path.join(distDir, 'app.html'));
    hashFile(path.join(distDir, 'landing.html'));
    hashFile(path.join(distDir, 'manifest.json'));

    // Sorted so the id does not depend on directory-read order.
    const imagesDir = path.join(distDir, 'images');
    if (fs.existsSync(imagesDir)) {
      fs.readdirSync(imagesDir).sort().forEach((name) => {
        hash.update(name);
        hashFile(path.join(imagesDir, name));
      });
    }

    const buildId = hash.digest('hex').slice(0, 12);
    fs.writeFileSync(swPath, swSource.split(PLACEHOLDER).join(buildId));
    console.log(`Stamped service worker cache as wooru-pwa-${buildId}`);
  }
} catch (err) {
  console.error('Failed to stamp the service worker build id:', err);
  process.exit(1);
}
