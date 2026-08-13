// Vercel serverless function — see api/share-drop.ts for the full rationale
// (link-preview crawlers need server-rendered Open Graph tags; the Expo web
// build is a client-rendered SPA with no per-page meta tags).
const { createClient } = require('@supabase/supabase-js');
const { APP_ORIGIN, DEFAULT_OG_IMAGE, isBotRequest, ogImageUrl, renderOgPage, sendOgPage, sendRedirect } = require('./_og');

module.exports = async function handler(req: any, res: any) {
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const appUrl = id
    ? `${APP_ORIGIN}/mcn/listing/${encodeURIComponent(id)}`
    : `${APP_ORIGIN}/mcn/business`;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const userAgent = String(req.headers?.['user-agent'] || '');
  const isBot = isBotRequest(userAgent);

  if (!isBot || !id || !supabaseUrl || !supabaseAnonKey) {
    sendRedirect(res, appUrl);
    return;
  }

  let card: { name?: string; description?: string | null; image_url?: string | null } | null = null;
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // mcn_listings has no anon-readable SELECT policy, so this goes through
    // get_listing_og_card() (supabase/migrations/20260906000000_og_card_rpcs.sql)
    // rather than a direct table read.
    const { data } = await supabase.rpc('get_listing_og_card', { p_id: id }).maybeSingle();
    card = data;
  } catch {
    card = null;
  }

  if (!card) {
    sendRedirect(res, appUrl);
    return;
  }

  const html = renderOgPage({
    title: card.name || 'Community Business',
    description: card.description?.trim() || 'Browse offerings from a neighbor on Wooru.',
    imageUrl: card.image_url ? ogImageUrl(card.image_url) : DEFAULT_OG_IMAGE,
    targetUrl: appUrl,
  });

  sendOgPage(res, html);
};
