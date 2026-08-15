#!/usr/bin/env node
/**
 * Wooru — purge uploaded images from Cloudinary.
 *
 * Companion to `reset-community-data.sql`. Images do NOT live in Supabase
 * storage: `lib/cloudinary.ts` uploads them to Cloudinary under `wooru/`
 * via an unsigned preset, and the database only ever stores the resulting
 * `secure_url`. The `community-uploads` Supabase bucket exists but is
 * unused (0 objects). So wiping the database orphans every avatar,
 * listing photo and drop image in Cloudinary — this clears them.
 *
 * Deleting here is irreversible and hits a third-party account, so the
 * default is a dry run.
 *
 * Usage:
 *   # CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud-name> lives in .env
 *   set -a; . ./.env; set +a
 *   node scripts/db/reset-cloudinary-uploads.mjs             # dry run
 *   node scripts/db/reset-cloudinary-uploads.mjs --yes       # delete
 *
 *   --yes             actually delete (otherwise: report only)
 *   --prefix <path>   defaults to `wooru` — the app's upload root.
 *                     Use e.g. `wooru/listings` to scope it tighter.
 *
 * The API secret grants full control of the Cloudinary account. Pass it
 * through the environment; never hardcode or commit it.
 */

const argv = process.argv.slice(2);
const apply = argv.includes('--yes');
const prefixIdx = argv.indexOf('--prefix');
const prefix = prefixIdx !== -1 && argv[prefixIdx + 1] ? argv[prefixIdx + 1] : 'wooru';

const raw = process.env.CLOUDINARY_URL;
if (!raw) {
  console.error('Missing CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud-name>).');
  process.exit(1);
}

const parsed = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(raw.trim());
if (!parsed) {
  console.error('CLOUDINARY_URL is malformed. Expected cloudinary://<key>:<secret>@<cloud-name>.');
  process.exit(1);
}
const [, apiKey, apiSecret, cloudName] = parsed;

const base = `https://api.cloudinary.com/v1_1/${cloudName}`;
const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

async function api(path, method = 'GET') {
  const res = await fetch(`${base}${path}`, { method, headers: { Authorization: auth } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${body?.error?.message ?? ''}`);
  }
  return body;
}

/** Page through every uploaded image under the prefix. */
async function list() {
  const out = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ type: 'upload', prefix, max_results: '500' });
    if (cursor) qs.set('next_cursor', cursor);
    const page = await api(`/resources/image?${qs}`);
    out.push(...(page.resources ?? []).map((r) => ({ id: r.public_id, bytes: r.bytes })));
    cursor = page.next_cursor;
  } while (cursor);
  return out;
}

const found = await list();

if (found.length === 0) {
  console.log(`Nothing to delete under "${prefix}/" in cloud "${cloudName}".`);
  process.exit(0);
}

const mb = (found.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1024 / 1024).toFixed(1);

if (!apply) {
  console.log(`DRY RUN — ${found.length} image(s), ${mb} MB under "${prefix}/" in cloud "${cloudName}":`);
  for (const r of found.slice(0, 25)) console.log(`  ${r.id}`);
  if (found.length > 25) console.log(`  ... and ${found.length - 25} more`);
  console.log('\nRe-run with --yes to delete.');
  process.exit(0);
}

// Delete-by-prefix handles up to 1000 per call and reports `partial` when
// more remain, so loop until Cloudinary stops reporting leftovers.
let rounds = 0;
for (;;) {
  const res = await api(`/resources/image/upload?prefix=${encodeURIComponent(prefix)}`, 'DELETE');
  rounds += 1;
  const removed = Object.keys(res.deleted ?? {}).length;
  console.log(`Batch ${rounds}: deleted ${removed}`);
  if (!res.partial || removed === 0) break;
}

const left = await list();
console.log(`Done — ${found.length - left.length} image(s) removed, ${left.length} remaining.`);
