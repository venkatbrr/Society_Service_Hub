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

// Mirrors lib/siteUrl.ts, which this file cannot import — that module pulls in
// react-native, and this runs in Vercel's plain Node runtime. Reads the same
// EXPO_PUBLIC_SITE_URL the rest of the deployment uses, so preview deployments
// emit preview URLs instead of production ones.
const APP_ORIGIN = (process.env.EXPO_PUBLIC_SITE_URL || 'https://wooru.in').replace(/\/+$/, '');
const DEFAULT_IMAGE = `${APP_ORIGIN}/images/icon.png`;

const BOT_USER_AGENT_PATTERN =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterest|redditbot|skypeuripreview|vkshare|w3c_validator|google-inspectiontool|embedly|quora|outbrain|nuzzel|bitlybot|preview/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async function handler(req: any, res: any) {
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const appUrl = id
    ? `${APP_ORIGIN}/mcn/drops?id=${encodeURIComponent(id)}`
    : `${APP_ORIGIN}/mcn/drops`;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const userAgent = String(req.headers?.['user-agent'] || '');
  const isBot = BOT_USER_AGENT_PATTERN.test(userAgent);

  // Real visitors (not a link-preview crawler) go straight into the app.
  if (!isBot || !id || !supabaseUrl || !supabaseAnonKey) {
    res.writeHead(302, { Location: appUrl });
    res.end();
    return;
  }

  let drop: { title?: string; description?: string | null; image_url?: string | null } | null = null;
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase
      .from('mcn_preorder_drops')
      .select('title, description, image_url')
      .eq('id', id)
      .maybeSingle();
    drop = data;
  } catch {
    drop = null;
  }

  if (!drop) {
    res.writeHead(302, { Location: appUrl });
    res.end();
    return;
  }

  const title = escapeHtml(drop.title || 'Food Drop');
  const description = escapeHtml(
    drop.description?.trim() || 'Pre-order fresh home-cooked food from your neighbors on Wooru.'
  );
  const image = escapeHtml(drop.image_url || DEFAULT_IMAGE);
  const safeAppUrl = escapeHtml(appUrl);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:type" content="website">
<meta property="og:url" content="${safeAppUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${safeAppUrl}">
</head>
<body>
Redirecting to <a href="${safeAppUrl}">${title}</a>&hellip;
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  res.end(html);
};
