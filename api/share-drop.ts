// Vercel serverless function — NOT part of the Expo app bundle or its tsconfig
// (see tsconfig.json `exclude`), same as supabase/functions.
//
// The Expo web build is a client-rendered SPA: every route resolves to the
// same static index.html with no per-page meta tags, so link-preview crawlers
// (WhatsApp, Facebook, Telegram, ...) never see a food drop's title/photo when
// a resident shares it. This endpoint gives crawlers a tiny server-rendered
// HTML document with real Open Graph tags for the requested drop, then sends
// everyone else straight into the app.
const { createClient } = require('@supabase/supabase-js');
const { APP_ORIGIN, DEFAULT_OG_IMAGE, isBotRequest, ogImageUrl, renderOgPage, sendOgPage, sendRedirect } = require('./_og');

module.exports = async function handler(req: any, res: any) {
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const appUrl = id
    ? `${APP_ORIGIN}/mcn/drops?id=${encodeURIComponent(id)}`
    : `${APP_ORIGIN}/mcn/drops`;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const userAgent = String(req.headers?.['user-agent'] || '');
  const isBot = isBotRequest(userAgent);

  // Real visitors (not a link-preview crawler) go straight into the app.
  if (!isBot || !id || !supabaseUrl || !supabaseAnonKey) {
    sendRedirect(res, appUrl);
    return;
  }

  let card: { title?: string; description?: string | null; image_url?: string | null } | null = null;
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // mcn_preorder_drops has a deliberate anon-readable SELECT policy
    // (supabase/migrations/20260802010000_allow_public_food_drop_read.sql,
    // "Allow anonymous users to browse food drops") so a direct read works
    // here without a SECURITY DEFINER RPC.
    const { data } = await supabase
      .from('mcn_preorder_drops')
      .select('title, description, image_url')
      .eq('id', id)
      .maybeSingle();
    card = data;
  } catch {
    card = null;
  }

  if (!card) {
    sendRedirect(res, appUrl);
    return;
  }

  const html = renderOgPage({
    title: card.title || 'Food Drop',
    description: card.description?.trim() || 'Pre-order fresh home-cooked food from your neighbors on Wooru.',
    imageUrl: card.image_url ? ogImageUrl(card.image_url) : DEFAULT_OG_IMAGE,
    targetUrl: appUrl,
  });

  sendOgPage(res, html);
};
