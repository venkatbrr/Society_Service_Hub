import { Building05 } from '@untitledui/icons/Building05';
import { Car01 } from '@untitledui/icons/Car01';
import { Coins01 } from '@untitledui/icons/Coins01';
import { ShoppingBag03 } from '@untitledui/icons/ShoppingBag03';
import { Star01 } from '@untitledui/icons/Star01';
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
        <title>Society Service Hub — Silicon Valley Resident Portal</title>
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

        {/* Custom CSS overrides for Motion Desktop Shell & Mobile Compatibility */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>
        {/* Background Ambient Glowing Orbs for Desktop */}
        <div className="desktop-orb desktop-orb-1"></div>
        <div className="desktop-orb desktop-orb-2"></div>

        {/* Left Side Motion Aesthetic Floating Cards */}
        <div className="desktop-side-panel panel-left">
          <div className="side-card float-anim-1">
            <div className="side-card-badge">
              <span className="pulse-dot"></span>
              <span>LIVE GRID</span>
            </div>
            <div className="side-card-title">
              <Building05 size={20} color="currentColor" aria-hidden="true" style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
              Society Hub
            </div>
            <p className="side-card-desc">Premium gated community ecosystem for modern housing societies.</p>
          </div>

          <div className="side-card float-anim-2">
            <div className="side-card-icon">
              <ShoppingBag03 size={20} color="currentColor" aria-hidden="true" />
            </div>
            <div>
              <div className="side-card-title">Food Drops</div>
              <p className="side-card-desc">Pre-order home-style meals & bakery items from verified resident hosts.</p>
            </div>
          </div>

          <div className="side-card float-anim-3">
            <div className="side-card-icon">
              <Tool02 size={20} color="currentColor" aria-hidden="true" />
            </div>
            <div>
              <div className="side-card-title">Verified Hiring</div>
              <p className="side-card-desc">Hire electricians, plumbers & maids rated by your same neighbors.</p>
            </div>
          </div>
        </div>

        {/* The Central Mobile-View App Container */}
        {children}

        {/* Right Side Motion Aesthetic Floating Cards */}
        <div className="desktop-side-panel panel-right">
          <div className="side-card float-anim-2">
            <div className="side-card-icon">
              <Star01 size={20} color="currentColor" aria-hidden="true" />
            </div>
            <div>
              <div className="side-card-title">4.9 Ratings</div>
              <p className="side-card-desc">100% verified neighbor reviews and trust metrics.</p>
            </div>
          </div>

          <div className="side-card float-anim-1">
            <div className="side-card-icon">
              <Car01 size={20} color="currentColor" aria-hidden="true" />
            </div>
            <div>
              <div className="side-card-title">Co-Planned Visits</div>
              <p className="side-card-desc">Share maintenance visits with neighbors & split travel fees.</p>
            </div>
          </div>

          <div className="side-card float-anim-3">
            <div className="side-card-icon">
              <Coins01 size={20} color="currentColor" aria-hidden="true" />
            </div>
            <div>
              <div className="side-card-title">Cultural Funds</div>
              <p className="side-card-desc">Transparent festival collection tracking & financial reporting.</p>
            </div>
          </div>
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
.desktop-orb, .desktop-side-panel {
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

/* Desktop Viewports (>= 768px): Centered Mobile View Container with Motion Side Animations */
@media (min-width: 768px) {
  body {
    background-color: #0A1D1A;
    background-image: 
      radial-gradient(circle at 15% 15%, rgba(16, 185, 129, 0.15) 0%, transparent 45%),
      radial-gradient(circle at 85% 85%, rgba(15, 55, 50, 0.4) 0%, transparent 55%),
      radial-gradient(circle at 50% 50%, #0A1D1A 0%, #040E0C 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }

  /* Central Mobile View Container */
  #root {
    max-width: 460px;
    width: 100%;
    height: 90vh !important;
    max-height: 880px;
    border-radius: 28px;
    background-color: #FAF8F4;
    box-shadow: 0 35px 90px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
    overflow: hidden;
    position: relative;
    z-index: 10;
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
    filter: blur(90px);
    opacity: 0.35;
    pointer-events: none;
    z-index: 1;
  }
  .desktop-orb-1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #10B981 0%, transparent 70%);
    top: -150px;
    left: -100px;
    animation: orbDrift1 22s infinite alternate ease-in-out;
  }
  .desktop-orb-2 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #0F3732 0%, transparent 70%);
    bottom: -200px;
    right: -100px;
    animation: orbDrift2 28s infinite alternate ease-in-out;
  }

  @keyframes orbDrift1 {
    0% { transform: translate(0, 0) scale(1); }
    100% { transform: translate(100px, 80px) scale(1.15); }
  }
  @keyframes orbDrift2 {
    0% { transform: translate(0, 0) scale(1.1); }
    100% { transform: translate(-80px, -60px) scale(0.95); }
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

/* Wide Screen Side Panels (>= 1100px) */
@media (min-width: 1100px) {
  .desktop-side-panel {
    display: flex !important;
    flex-direction: column;
    gap: 20px;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 290px;
    z-index: 5;
    pointer-events: none;
  }

  .panel-left {
    left: max(32px, calc(50% - 590px));
  }

  .panel-right {
    right: max(32px, calc(50% - 590px));
  }

  /* Motion Floating Side Cards */
  .side-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 20px;
    padding: 20px 22px;
    color: #FAF8F4;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .side-card-icon {
    font-size: 26px;
    padding: 8px;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: 12px;
    flex-shrink: 0;
  }

  .side-card-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #6EE7B7;
    margin-bottom: 8px;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    background: #10B981;
    border-radius: 50%;
    box-shadow: 0 0 8px #10B981;
    animation: pulseDot 2s infinite;
  }

  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.4); }
  }

  .side-card-title {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 4px;
  }

  .side-card-desc {
    font-size: 12px;
    color: rgba(250, 248, 244, 0.65);
    line-height: 1.45;
    margin: 0;
  }

  /* Motion Floating Animation Classes */
  .float-anim-1 {
    animation: motionFloat1 6s infinite ease-in-out;
  }

  .float-anim-2 {
    animation: motionFloat2 7s infinite ease-in-out;
  }

  .float-anim-3 {
    animation: motionFloat3 8s infinite ease-in-out;
  }

  @keyframes motionFloat1 {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }

  @keyframes motionFloat2 {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-14px); }
  }

  @keyframes motionFloat3 {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
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
