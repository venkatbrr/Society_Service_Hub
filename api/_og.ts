// Shared helpers for the OG-preview endpoints (share-drop.ts, share-listing.ts,
// share-community.ts). Vercel serverless functions run in a plain Node runtime
// excluded from tsconfig.json (see docs/CLAUDE.md §3 "Vercel serverless
// functions") — this file cannot import lib/cloudinary.ts or lib/siteUrl.ts,
// which pull in react-native, so their logic is mirrored here.

export const APP_ORIGIN = (process.env.EXPO_PUBLIC_SITE_URL || 'https://wooru.in').replace(/\/+$/, '');
export const DEFAULT_OG_IMAGE = `${APP_ORIGIN}/images/icon.png`;

export const BOT_USER_AGENT_PATTERN =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterest|redditbot|skypeuripreview|vkshare|w3c_validator|google-inspectiontool|embedly|quora|outbrain|nuzzel|bitlybot|preview/i;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inject WhatsApp/Facebook-friendly delivery params into a Cloudinary URL:
 * a fixed 1200x630 crop (their preferred OG aspect) plus format/quality
 * auto-negotiation. Anything that isn't a Cloudinary delivery URL (a bundled
 * asset like DEFAULT_OG_IMAGE) is returned untouched.
 */
export function ogImageUrl(url: string): string {
  const marker = '/image/upload/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const insertAt = markerIndex + marker.length;
  const rest = url.slice(insertAt);
  const segment = 'w_1200,h_630,c_fill,g_auto,f_jpg,q_auto:good';

  if (rest.startsWith(`${segment}/`)) return url;

  return `${url.slice(0, insertAt)}${segment}/${rest}`;
}

export function isBotRequest(userAgent: string): boolean {
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

interface OgCard {
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
}

export function renderOgPage({ title, description, imageUrl, targetUrl }: OgCard): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safeUrl = escapeHtml(targetUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wooru">
<meta property="og:url" content="${safeUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${safeUrl}">
</head>
<body>
Redirecting to <a href="${safeUrl}">${safeTitle}</a>&hellip;
</body>
</html>`;
}

export function sendRedirect(res: any, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

export function sendOgPage(res: any, html: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  res.end(html);
}
