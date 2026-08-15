import { Tool01 } from '@untitledui/icons/Tool01';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Wallet02 } from '@untitledui/icons/Wallet02';
import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { ScrollViewStyleReset } from 'expo-router/html';

// ⚠️ INERT IN THIS PROJECT — DO NOT ADD ANYTHING HERE EXPECTING IT TO SHIP.
//
// `+html.tsx` is only rendered under static rendering (`web.output: 'static'`).
// `app.config.js` sets `web.output: 'single'`, so Expo Router emits its own
// minimal boilerplate shell and never calls this component. Nothing below
// reaches a deployed page.
//
// It went unnoticed because Expo's default reset happens to carry the same
// `html/body { height: 100% }` and `#root { display: flex }` rules this file
// declares, so the layout looked right — while the manifest link, the service
// worker registration, the Google Fonts, and every icon/meta tag were silently
// missing from every app page in production.
//
// The real app-shell head is `APP_SHELL_HEAD` in `build-admin.js`, injected
// into `dist/app.html` after export. `public/landing.html` keeps its own copy
// because it is a static file Expo never processes. Change the head in those
// two places; this file is kept only so a future switch to `output: 'static'`
// has a starting point.
//
// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover" />

        {/* SEO Optimization */}
        <title>Wooru — Resident Portal</title>
        <meta name="description" content="Your premium community marketplace — find trusted service providers rated by neighbors, coordinate visits, manage cultural funds, and connect with residents." />

        {/* PWA manifest & theme */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F3732" />

        {/* Apple PWA support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Wooru" />
        <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-180.png" />

        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/images/favicon.png" />

        {/* Google Fonts - Instrument Serif & Plus Jakarta Sans */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

        <ScrollViewStyleReset />

        {/* Custom CSS overrides for Desktop Shell & Mobile Compatibility */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>
        {/* Background Ambient Orbs for Desktop */}
        <div className="desktop-orb desktop-orb-1"></div>
        <div className="desktop-orb desktop-orb-2"></div>

        {/* Left Side Branded Panel for Wide Desktop Screens */}
        <div className="desktop-brand-panel">
          <div className="brand-badge">
            <span className="pulse-dot"></span>
            <span>RESIDENT PORTAL</span>
          </div>
          
          <div className="brand-header">
            <div className="brand-logo-icon">
              <img src="/images/icon-512.png" alt="" aria-hidden="true" />
            </div>
            <h1 className="brand-title">Wooru</h1>
          </div>

          <p className="brand-tagline">
            The operating system for modern residential communities.
          </p>

          <div className="brand-features-list">
            <div className="brand-feature-item">
              <div className="feature-item-icon">
                <Tool01 size={16} color="#DDA94A" aria-hidden="true" />
              </div>
              <div>
                <div className="feature-item-title">Verified Services</div>
                <div className="feature-item-desc">Neighbor-rated plumbers & electricians</div>
              </div>
            </div>

            <div className="brand-feature-item">
              <div className="feature-item-icon">
                <ShoppingBag01 size={16} color="#DDA94A" aria-hidden="true" />
              </div>
              <div>
                <div className="feature-item-title">Food Drops</div>
                <div className="feature-item-desc">Pre-order home meals from hosts</div>
              </div>
            </div>

            <div className="brand-feature-item">
              <div className="feature-item-icon">
                <Wallet02 size={16} color="#DDA94A" aria-hidden="true" />
              </div>
              <div>
                <div className="feature-item-title">Cultural Funds</div>
                <div className="feature-item-desc">Transparent festival tracking</div>
              </div>
            </div>
          </div>

          <a href="/" className="landing-back-link">
            <ArrowLeft size={14} color="#DDA94A" style={{ marginRight: 6 }} aria-hidden="true" />
            Main Website
          </a>
        </div>

        {/* The Central Mobile-View App Container */}
        {children}

        {/* Register PWA service worker */}
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }} />
      </body>
    </html>
  );
}

const responsiveBackground = `
/* Global Base Styles */
html, body {
  height: 100%;
  height: -webkit-fill-available;
  margin: 0;
  padding: 0;
  background-color: #FAF8F4;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  height: 100%;
  height: -webkit-fill-available;
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Remove default focus outlines */
input:focus, textarea:focus, select:focus {
  outline: none;
}

/* Hide desktop elements on mobile viewports */
.desktop-orb, .desktop-brand-panel {
  display: none !important;
}

/* Mobile Viewports (< 768px): Full-Screen Native App Feel */
@media (max-width: 767px) {
  body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: auto;
  }

  #root {
    min-height: 100%;
    height: auto;
  }
}

/* Desktop Viewports (>= 768px): Centered Mobile View Container with Dark Backdrop */
@media (min-width: 768px) {
  body {
    background-color: #0F3732 !important;
    background-image: 
      radial-gradient(circle at 15% 15%, rgba(221, 169, 74, 0.12) 0%, transparent 45%),
      radial-gradient(circle at 85% 85%, rgba(15, 110, 86, 0.25) 0%, transparent 55%),
      radial-gradient(circle at 50% 50%, #0F3732 0%, #08211E 100%) !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    min-height: 100vh !important;
    padding: 24px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
    position: relative !important;
  }

  /* Central Mobile View Container */
  #root {
    max-width: 460px !important;
    width: 100% !important;
    height: 90vh !important;
    max-height: 880px !important;
    border-radius: 28px !important;
    background-color: #FAF8F4 !important;
    box-shadow: 0 40px 80px rgba(15, 55, 50, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
    overflow: hidden !important;
    position: relative !important;
    z-index: 10 !important;
    flex-shrink: 0 !important;
  }

  /* Desktop Ambient Mesh Blur Orbs */
  .desktop-orb {
    display: block !important;
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.3;
    pointer-events: none;
    z-index: 1;
  }
  .desktop-orb-1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #DDA94A 0%, transparent 70%);
    top: -150px;
    left: -100px;
  }
  .desktop-orb-2 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #0F6E56 0%, transparent 70%);
    bottom: -200px;
    right: -100px;
  }

  /* Custom Scrollbar for central container */
  #root *::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  #root *::-webkit-scrollbar-track {
    background: transparent;
  }
  #root *::-webkit-scrollbar-thumb {
    background: rgba(15, 55, 50, 0.2);
    border-radius: 4px;
  }
  #root *::-webkit-scrollbar-thumb:hover {
    background: rgba(15, 55, 50, 0.4);
  }
}

/* Wide Screen Anchored Brand Panel (>= 1120px) */
@media (min-width: 1120px) {
  .desktop-brand-panel {
    display: flex !important;
    flex-direction: column;
    position: absolute;
    top: 50%;
    left: max(32px, calc(50% - 580px));
    transform: translateY(-50%);
    width: 290px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 24px;
    padding: 28px 24px;
    color: #FAF8F4;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    z-index: 5;
  }

  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(221, 169, 74, 0.15);
    border: 1px solid rgba(221, 169, 74, 0.3);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #DDA94A;
    margin-bottom: 16px;
    align-self: flex-start;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    background: #DDA94A;
    border-radius: 50%;
    box-shadow: 0 0 8px #DDA94A;
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .brand-logo-icon {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(221, 169, 74, 0.3);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .brand-logo-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .brand-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 28px;
    font-weight: 400;
    color: #F0EDE3;
    letter-spacing: -0.4px;
    margin: 0;
  }

  .brand-tagline {
    font-size: 13px;
    line-height: 1.45;
    color: rgba(240, 237, 227, 0.7);
    margin: 0 0 20px 0;
  }

  .brand-features-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 24px;
  }

  .brand-feature-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .feature-item-icon {
    width: 28px;
    height: 28px;
    background: rgba(221, 169, 74, 0.12);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .feature-item-title {
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 2px;
  }

  .feature-item-desc {
    font-size: 11px;
    color: rgba(250, 248, 244, 0.5);
    line-height: 1.35;
  }

  .landing-back-link {
    font-size: 12px;
    font-weight: 600;
    color: #DDA94A;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }

  .landing-back-link:hover {
    text-decoration: underline;
  }
}
`;

const serviceWorkerRegistration = `
if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(registration) {
        console.log('[PWA] Service Worker registered with scope:', registration.scope);
      })
      .catch(function(error) {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}
`;
