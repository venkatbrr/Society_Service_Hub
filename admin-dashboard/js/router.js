// Simple Hash-Based SPA Router
const Router = {
  routes: {
    '#dashboard': 'dashboard-page',
    '#approvals': 'approvals-page',
    '#communities': 'communities-page',
    '#providers': 'providers-page',
    '#funds-requests': 'funds-requests-page'
  },
  
  hasInitialized: false,

  init() {
    if (this.hasInitialized) {
      this.handleRoute();
      return;
    }

    // Set up window hash change listener
    window.addEventListener('hashchange', () => this.handleRoute());
    
    // Highlight sidebar links based on active hash
    this.handleRoute();
    this.hasInitialized = true;
  },

  handleRoute() {
    const fullHash = window.location.hash || '#dashboard';
    const baseHash = fullHash.split('?')[0];
    
    // Check if valid route, otherwise redirect to dashboard
    if (!this.routes[baseHash]) {
      window.location.hash = '#dashboard';
      return;
    }

    // Hide all pages, show active one
    Object.values(this.routes).forEach(pageId => {
      const el = document.getElementById(pageId);
      if (el) el.classList.add('hidden');
    });

    const activePageId = this.routes[baseHash];
    const activePageEl = document.getElementById(activePageId);
    if (activePageEl) {
      activePageEl.classList.remove('hidden');
    }

    // Update active class on nav links
    document.querySelectorAll('nav a').forEach(link => {
      if (link.getAttribute('href') === baseHash) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Extract query parameters
    const params = {};
    const parts = fullHash.split('?');
    if (parts.length > 1) {
      const query = parts[1];
      const kvs = query.split('&');
      kvs.forEach(kv => {
        const [k, v] = kv.split('=');
        if (k && v) {
          params[k] = decodeURIComponent(v);
        }
      });
    }

    // Trigger page-specific loads
    this.triggerPageLoad(baseHash, params);
  },

  async triggerPageLoad(baseHash, params) {
    console.log('Routing to:', baseHash, 'with params:', params);
    try {
      switch (baseHash) {
        case '#dashboard':
          if (window.DashboardPage) {
            await window.DashboardPage.load();
          }
          break;
        case '#approvals':
          if (window.ApprovalsPage) {
            await window.ApprovalsPage.load();
          }
          break;
        case '#communities':
          if (window.CommunitiesPage) {
            // The hash is the single source of truth for which community and
            // which tab are open, so the detail view is linkable and the back
            // button leaves it.
            window.CommunitiesPage.selectedCommunityId = params.id || null;
            window.CommunitiesPage.activeTab = params.tab || 'overview';
            await window.CommunitiesPage.load();
          }
          break;
        case '#providers':
          if (window.ProvidersPage) {
            window.ProvidersPage.selectedProviderId = params.id || null;
            // Check if loading with community filter from dashboard click
            if (params.communityId) {
              window.ProvidersPage.selectedCommunityId = params.communityId;
              const filterSelect = document.getElementById('providers-community-filter');
              if (filterSelect) {
                filterSelect.value = params.communityId;
              }
            }
            await window.ProvidersPage.load();
          }
          break;
        case '#funds-requests':
          if (window.FundsRequestsPage) {
            await window.FundsRequestsPage.load();
          }
          break;
      }
    } catch (err) {
      console.error('Error loading page for hash:', baseHash, err);
    }
  }
};

window.Router = Router;
