// Vercel serverless function — see api/share-drop.ts for the full rationale
// (link-preview crawlers need server-rendered Open Graph tags; the Expo web
// build is a client-rendered SPA with no per-page meta tags).
//
// communities has no image column, so there is no per-community photo to
// preview — every card uses the bundled app icon.
const { createClient } = require('@supabase/supabase-js');
const { APP_ORIGIN, DEFAULT_OG_IMAGE, isBotRequest, renderOgPage, sendOgPage, sendRedirect } = require('./_og');

module.exports = async function handler(req: any, res: any) {
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const appUrl = `${APP_ORIGIN}/community-select`;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const userAgent = String(req.headers?.['user-agent'] || '');
  const isBot = isBotRequest(userAgent);

  if (!isBot || !id || !supabaseUrl || !supabaseAnonKey) {
    sendRedirect(res, appUrl);
    return;
  }

  let card: { name?: string; address?: string | null } | null = null;
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // communities has no anon-readable SELECT policy, so this goes through
    // get_community_og_card() (supabase/migrations/20260906000000_og_card_rpcs.sql)
    // rather than a direct table read. The join code itself is never exposed
    // here — it already travels as plain text in the share message.
    const { data } = await supabase.rpc('get_community_og_card', { p_id: id }).maybeSingle();
    card = data;
  } catch {
    card = null;
  }

  if (!card) {
    sendRedirect(res, appUrl);
    return;
  }

  const html = renderOgPage({
    title: card.name ? `Join ${card.name} on Wooru` : 'Join my community on Wooru',
    description: card.address?.trim() || 'A community app for gated residential societies.',
    imageUrl: DEFAULT_OG_IMAGE,
    targetUrl: appUrl,
  });

  sendOgPage(res, html);
};
