import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover" />

        {/* SEO Optimization */}
        <title>Society Service Hub</title>
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

        {/* Google Fonts - Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>
        {/* Decorative floating blur orbs for desktop background */}
        <div className="desktop-orb desktop-orb-1"></div>
        <div className="desktop-orb desktop-orb-2"></div>

        {/* Side-by-side branding/features panel for desktop viewports */}
        <div id="desktop-sidebar" className="desktop-only-sidebar">
          <div className="sidebar-header">
            <span className="sidebar-logo-emoji">🏢</span>
            <div className="sidebar-brand">
              <span className="sidebar-title">Society Hub</span>
              <span className="sidebar-subtitle">Premium Portal</span>
            </div>
          </div>
          
          <div className="sidebar-divider"></div>
          
          <p className="sidebar-tagline">
            Your premium gated community ecosystem. Find trusted service providers rated by neighbors, coordinate visits together, and audit cultural funds with complete ease.
          </p>
          
          <div className="sidebar-features-list">
            <div className="sidebar-feature-item">
              <span className="feature-icon">🔍</span>
              <div className="feature-text">
                <h3>Trusted Providers</h3>
                <p>Solve your biggest pain point: hire reliable plumbers, electricians, maids & more, rated and trusted by your same community.</p>
              </div>
            </div>
            <div className="sidebar-feature-item">
              <span className="feature-icon">🚗</span>
              <div className="feature-text">
                <h3>Plan a Visit</h3>
                <p>Share upcoming service visits, so neighbors can add to the same visit and split costs.</p>
              </div>
            </div>
            <div className="sidebar-feature-item">
              <span className="feature-icon">💳</span>
              <div className="feature-text">
                <h3>Cultural Funds</h3>
                <p>Contribute to collections and manage cultural events with transparent reporting.</p>
              </div>
            </div>
            <div className="sidebar-feature-item">
              <span className="feature-icon">🤝</span>
              <div className="feature-text">
                <h3>Neighbor Network</h3>
                <p>Support businesses by residents, borrow neighbor items, and stay connected.</p>
              </div>
            </div>
          </div>
          
          <div className="sidebar-footer">
            <div className="greeting-container">
              <span className="greeting-emoji">👋</span>
              <span id="desktop-dynamic-greeting">Welcome back!</span>
            </div>
          </div>
        </div>

        {/* The React Native app container */}
        {children}

        {/* Set time-of-day dynamic greeting synchronously */}
        <script dangerouslySetInnerHTML={{ __html: dynamicGreetingScript }} />

        {/* Register PWA service worker */}
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }} />
      </body>
    </html>
  );
}

const responsiveBackground = `
/* Base: warm off-white matching Verandah.surface */
html, body {
  height: 100%;
  height: -webkit-fill-available;
}

body {
  background-color: #FAF8F4;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  overflow: hidden;
}

#root {
  height: 100%;
  height: -webkit-fill-available;
  display: flex;
  flex-direction: column;
}

/* Remove default browser focus outline on web inputs */
input:focus, textarea:focus, select:focus {
  outline: none;
}

/* Hide desktop elements on mobile */
.desktop-orb, .desktop-only-sidebar {
  display: none !important;
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #1a1a1a;
  }
}

/* Premium Desktop Web Layout Layout Shell */
@media (min-width: 768px) {
  body {
    background-color: #0F3732;
    /* Animated Gradient Mesh */
    background-image: 
      radial-gradient(circle at 10% 20%, rgba(22, 75, 68, 0.7) 0%, transparent 45%),
      radial-gradient(circle at 90% 80%, rgba(15, 110, 86, 0.5) 0%, transparent 55%),
      radial-gradient(circle at 50% 50%, #0F3732 0%, #081e1c 100%);
    background-size: 200% 200%;
    animation: desktopGradientShift 15s ease infinite;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0;
    padding: 24px;
    box-sizing: border-box;
    overflow: hidden;
  }

  @keyframes desktopGradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  /* Floating Orbs on Desktop */
  .desktop-orb {
    display: block !important;
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    z-index: 0;
    opacity: 0.4;
    pointer-events: none;
  }
  .desktop-orb-1 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #0F6E56 0%, transparent 70%);
    top: -100px;
    left: -100px;
    animation: desktopFloatOrb1 20s infinite alternate ease-in-out;
  }
  .desktop-orb-2 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #164b44 0%, transparent 70%);
    bottom: -150px;
    right: -150px;
    animation: desktopFloatOrb2 25s infinite alternate ease-in-out;
  }

  @keyframes desktopFloatOrb1 {
    0% { transform: translate(0, 0) scale(1); }
    100% { transform: translate(120px, 80px) scale(1.2); }
  }
  @keyframes desktopFloatOrb2 {
    0% { transform: translate(0, 0) scale(1.2); }
    100% { transform: translate(-100px, -60px) scale(0.95); }
  }

  #root {
    max-width: 440px;
    width: 100%;
    height: 90vh !important;
    max-height: 850px;
    border-radius: 28px;
    background-color: #FAF8F4;
    box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
    overflow: hidden;
    position: relative;
    z-index: 10;
  }

  @media (prefers-color-scheme: dark) {
    body {
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(14, 45, 41, 0.8) 0%, transparent 45%),
        radial-gradient(circle at 90% 80%, rgba(9, 30, 27, 0.6) 0%, transparent 55%),
        radial-gradient(circle at 50% 50%, #091E14 0%, #030b08 100%);
    }
    #root {
      background-color: #091E14;
      box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
    }
  }

  /* Custom premium scrollbar for internal containers inside #root */
  #root *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  #root *::-webkit-scrollbar-track {
    background: transparent;
  }
  #root *::-webkit-scrollbar-thumb {
    background: rgba(15, 55, 50, 0.15);
    border-radius: 3px;
  }
  #root *::-webkit-scrollbar-thumb:hover {
    background: rgba(15, 55, 50, 0.3);
  }

  @media (prefers-color-scheme: dark) {
    #root *::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
    }
    #root *::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

/* Wide screen side-by-side layouts */
@media (min-width: 1024px) {
  body {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 64px;
    padding: 40px;
  }

  #root {
    margin: 0;
  }

  .desktop-only-sidebar {
    display: flex !important;
    flex-direction: column;
    width: 360px;
    height: 90vh;
    max-height: 850px;
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 28px;
    padding: 40px 32px;
    box-sizing: border-box;
    z-index: 10;
    color: #FAF8F4;
    box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.3);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }

  .sidebar-logo-emoji {
    font-size: 32px;
  }

  .sidebar-brand {
    display: flex;
    flex-direction: column;
  }

  .sidebar-title {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #ffffff 30%, #a2ebd2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sidebar-subtitle {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(250, 248, 244, 0.5);
    font-weight: 700;
    margin-top: 2px;
  }

  .sidebar-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    width: 100%;
    margin-bottom: 24px;
  }

  .sidebar-tagline {
    font-size: 14px;
    line-height: 1.5;
    color: rgba(250, 248, 244, 0.7);
    margin-bottom: 32px;
    font-weight: 300;
  }

  .sidebar-features-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex-grow: 1;
  }

  .sidebar-feature-item {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 12px;
    border-radius: 16px;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar-feature-item:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateX(4px);
  }

  .feature-icon {
    font-size: 20px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .feature-text h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
    color: #ffffff;
    margin-top: 0;
  }

  .feature-text p {
    font-size: 12px;
    color: rgba(250, 248, 244, 0.6);
    line-height: 1.4;
    font-weight: 300;
    margin: 0;
  }

  .sidebar-footer {
    margin-top: auto;
  }

  .greeting-container {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 12px 20px;
    border-radius: 16px;
    width: fit-content;
  }

  .greeting-emoji {
    font-size: 18px;
    animation: waveHand 2.5s infinite;
    transform-origin: 70% 70%;
  }

  #desktop-dynamic-greeting {
    font-size: 13px;
    font-weight: 600;
    color: #7cebc8;
  }

  @keyframes waveHand {
    0% { transform: rotate( 0.0deg) }
    10% { transform: rotate(14.0deg) }
    20% { transform: rotate(-8.0deg) }
    30% { transform: rotate(14.0deg) }
    40% { transform: rotate(-4.0deg) }
    50% { transform: rotate(10.0deg) }
    60% { transform: rotate( 0.0deg) }
    100% { transform: rotate( 0.0deg) }
  }
}
`;

const dynamicGreetingScript = `
(function() {
  const greetingEl = document.getElementById('desktop-dynamic-greeting');
  if (greetingEl) {
    const hr = new Date().getHours();
    let greet = "Good evening!";
    if (hr < 12) greet = "Good morning!";
    else if (hr < 17) greet = "Good afternoon!";
    greetingEl.textContent = greet;
  }
})();
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
