import { Building05 } from '@untitledui/icons/Building05';
import { Coins01 } from '@untitledui/icons/Coins01';
import { ShoppingBag03 } from '@untitledui/icons/ShoppingBag03';
import { Tool02 } from '@untitledui/icons/Tool02';
import { ScrollViewStyleReset } from 'expo-router/html';

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
        <title>Society Service Hub — Resident Portal</title>
        <meta name="description" content="Your premium community marketplace — find trusted service providers rated by neighbors, coordinate visits, manage cultural funds, and connect with residents." />

        {/* PWA manifest & theme */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F3732" />

        {/* Apple PWA support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Society Hub" />
        <link rel="apple-touch-icon" href="/images/icon.png" />

        {/* Favicon */}
        <link rel="icon" type="image/png" href="/images/favicon.png" />

        {/* Google Fonts - Plus Jakarta Sans & Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

        <ScrollViewStyleReset />

        {/* Custom CSS overrides for Desktop Shell & Mobile Compatibility */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>
        {/* Background Ambient Orbs for Desktop */}
        <div className="desktop-orb desktop-orb-1"></div>
        <div className="desktop-orb desktop-orb-2"></div>

        {/* Desktop Wrapper Layout */}
        <div className="desktop-layout-container">
          {/* Left Brand Panel for Wide Desktop Viewports */}
          <div className="desktop-brand-panel">
            <div className="brand-badge">
              <span className="pulse-dot"></span>
              <span>RESIDENT PORTAL</span>
            </div>
            
            <div className="brand-header">
              <div className="brand-logo-icon">
                <Building05 size={24} color="#10B981" aria-hidden="true" />
              </div>
              <h1 className="brand-title">Society Hub</h1>
            </div>

            <p className="brand-tagline">
              The modern residential operating system for gated communities.
            </p>

            <div className="brand-features-list">
              <div className="brand-feature-item">
                <div className="feature-item-icon">
                  <Tool02 size={18} color="#10B981" aria-hidden="true" />
                </div>
                <div>
                  <div className="feature-item-title">Verified Services</div>
                  <div className="feature-item-desc">Neighbor-rated plumbers, electricians & maids</div>
                </div>
              </div>

              <div className="brand-feature-item">
                <div className="feature-item-icon">
                  <ShoppingBag03 size={18} color="#10B981" aria-hidden="true" />
                </div>
                <div>
                  <div className="feature-item-title">Food Drops</div>
                  <div className="feature-item-desc">Pre-order home meals from resident hosts</div>
                </div>
              </div>

              <div className="brand-feature-item">
                <div className="feature-item-icon">
                  <Coins01 size={18} color="#10B981" aria-hidden="true" />
                </div>
                <div>
                  <div className="feature-item-title">Cultural Funds</div>
                  <div className="feature-item-desc">Transparent festival collection tracking</div>
                </div>
              </div>
            </div>

            <a href="/" className="landing-back-link">
              ← Back to Main Website
            </a>
          </div>

          {/* Central Mobile View App Container */}
          {children}
        </div>

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

.desktop-layout-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
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

/* Desktop Viewports (>= 768px): Centered Portal Shell */
@media (min-width: 768px) {
  body {
    background-color: #0A1D1A;
    background-image: 
      radial-gradient(circle at 15% 15%, rgba(16, 185, 129, 0.12) 0%, transparent 45%),
      radial-gradient(circle at 85% 85%, rgba(15, 55, 50, 0.3) 0%, transparent 55%),
      radial-gradient(circle at 50% 50%, #0A1D1A 0%, #040E0C 100%);
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }

  .desktop-layout-container {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 32px 24px;
    box-sizing: border-box;
    gap: 48px;
    position: relative;
    z-index: 10;
  }

  /* Central Mobile View Container */
  #root {
    max-width: 440px;
    width: 100%;
    height: 88vh !important;
    max-height: 860px;
    border-radius: 28px;
    background-color: #FAF8F4;
    box-shadow: 0 35px 90px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
    overflow: hidden;
    position: relative;
    z-index: 10;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    #root {
      background-color: #071412;
      box-shadow: 0 35px 90px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(16, 185, 129, 0.2);
    }
  }

  /* Desktop Ambient Mesh Blur Orbs */
  .desktop-orb {
    display: block !important;
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.25;
    pointer-events: none;
    z-index: 1;
  }
  .desktop-orb-1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #10B981 0%, transparent 70%);
    top: -150px;
    left: -100px;
  }
  .desktop-orb-2 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #0F3732 0%, transparent 70%);
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
    background: rgba(16, 185, 129, 0.25);
    border-radius: 4px;
  }
  #root *::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.5);
  }
}

/* Wide Screen Desktop Branding Panel (>= 960px) */
@media (min-width: 960px) {
  .desktop-brand-panel {
    display: flex !important;
    flex-direction: column;
    width: 340px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    padding: 36px 30px;
    color: #FAF8F4;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }

  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #6EE7B7;
    margin-bottom: 24px;
    align-self: flex-start;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    background: #10B981;
    border-radius: 50%;
    box-shadow: 0 0 8px #10B981;
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .brand-logo-icon {
    width: 40px;
    height: 40px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand-title {
    font-size: 22px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.5px;
    margin: 0;
  }

  .brand-tagline {
    font-size: 14px;
    line-height: 1.5;
    color: rgba(250, 248, 244, 0.7);
    margin: 0 0 28px 0;
  }

  .brand-features-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-bottom: 32px;
  }

  .brand-feature-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .feature-item-icon {
    width: 32px;
    height: 32px;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .feature-item-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 2px;
  }

  .feature-item-desc {
    font-size: 12px;
    color: rgba(250, 248, 244, 0.55);
    line-height: 1.4;
  }

  .landing-back-link {
    font-size: 13px;
    font-weight: 600;
    color: #6EE7B7;
    text-decoration: none;
    transition: opacity 0.2s ease;
    display: inline-flex;
    align-items: center;
  }

  .landing-back-link:hover {
    opacity: 0.8;
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
