import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const EMAIL = 'ira@gmail.com';
const PASSWORD = '123456';
const INPUT_FILE = 'data/service-providers/extracted_providers.md';

function parseEnvFile(filePath) {
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function parseSqlProviders(markdown) {
  const providers = [];
  const blocks = markdown.match(/```sql[\s\S]*?```/g) || [];

  for (const block of blocks) {
    const valuesMatch = block.match(/VALUES\s*\(\s*'YOUR_COMMUNITY_ID'\s*,\s*'YOUR_USER_ID'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*(NULL|'((?:''|[^'])*)')\s*,\s*'((?:''|[^'])*)'/i);
    if (!valuesMatch) continue;

    const name = valuesMatch[1].replace(/''/g, "'").trim();
    const phone = valuesMatch[2].replace(/''/g, "'").trim();
    const category = valuesMatch[3].replace(/''/g, "'").trim();
    const description = valuesMatch[4].toUpperCase() === 'NULL' ? null : valuesMatch[5].replace(/''/g, "'").trim();
    const fraudStatusRaw = valuesMatch[6].replace(/''/g, "'").trim();

    if (!name || !phone || !category) continue;

    providers.push({
      name,
      phone,
      category,
      description,
      fraud_status: fraudStatusRaw.toLowerCase(),
    });
  }

  const unique = new Map();
  for (const p of providers) {
    const key = `${p.phone}|${p.name.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, p);
  }

  return [...unique.values()];
}

function looksLikeDuplicate(error) {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('already exists') || msg.includes('duplicate') || error?.code === '23505';
}

async function main() {
  const env = parseEnvFile('.env');
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env variables');

  const markdown = fs.readFileSync(INPUT_FILE, 'utf8');
  const providers = parseSqlProviders(markdown);

  if (providers.length === 0) {
    console.log('No providers parsed from markdown SQL blocks.');
    process.exit(0);
  }

  const supabase = createClient(url, anonKey);

  const authRes = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authRes.error) throw authRes.error;

  const userId = authRes.data.user?.id;
  if (!userId) throw new Error('Signed in but no user id');

  const profileRes = await supabase
    .from('profiles')
    .select('community_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;

  const communityId = profileRes.data?.community_id;
  if (!communityId) throw new Error('User has no community_id');

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const provider of providers) {
    const payload = {
      community_id: communityId,
      created_by: userId,
      name: provider.name,
      phone: provider.phone,
      category: provider.category,
      description: provider.description,
      fraud_status: provider.fraud_status || 'pass',
    };

    const { error } = await supabase.from('service_providers').insert(payload);

    if (!error) {
      inserted += 1;
      continue;
    }

    if (looksLikeDuplicate(error)) {
      skipped += 1;
      continue;
    }

    failed += 1;
    console.log(`FAILED: ${provider.name} | ${provider.phone} | ${error.message}`);
  }

  const finalRes = await supabase
    .from('service_providers')
    .select('id, name, category, phone, created_at')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  console.log('USER:', authRes.data.user?.email);
  console.log('COMMUNITY_ID:', communityId);
  console.log('PARSED_FROM_FILE:', providers.length);
  console.log('INSERTED:', inserted);
  console.log('SKIPPED_DUPLICATES:', skipped);
  console.log('FAILED:', failed);
  console.log('TOTAL_PROVIDERS_IN_COMMUNITY:', finalRes.data?.length ?? 0);

  const preview = (finalRes.data || []).slice(0, 20);
  for (const p of preview) {
    console.log(`- ${p.name} | ${p.category ?? 'N/A'} | ${p.phone}`);
  }

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error('Import failed:', err?.message || err);
  process.exit(1);
});
