// Communities Page Controller
//
// Every community-scoped read goes through a platform_* SECURITY DEFINER RPC.
// A platform admin has `community_id IS NULL`, so any direct table read against
// a community-scoped table returns `[]` with no error and the page renders
// plausible zeroes. `communities` and `profiles` are the only tables with
// explicit platform-admin policies and may be read directly.

const CommunitiesPage = {
  // list view
  communities: [],
  overview: [],
  searchTerm: '',

  // detail view
  selectedCommunityId: null,
  activeTab: 'overview',
  community: null,
  residents: [],
  communityBlocks: [],
  communityFlats: [],
  communityFunds: [],
  communityPreorders: [],
  preorderHosts: [],
  communityBusinesses: [],
  businessOwners: [],
  businessCategories: [],
  communityEvents: [],
  eventOrganizers: [],
  residentSearch: '',
  commerceView: { food: 'drops', business: 'listings' },

  TABS: [
    { key: 'overview', label: 'Overview' },
    { key: 'people', label: 'People & Roles' },
    { key: 'commerce', label: 'Commerce' },
    { key: 'funds', label: 'Funds' },
    { key: 'events', label: 'Events' }
  ],

  async load() {
    const listContainer = document.getElementById('communities-list-view');
    const detailContainer = document.getElementById('communities-detail-view');
    const loadingEl = document.getElementById('communities-loading');

    loadingEl.classList.remove('hidden');
    this.bindSearch();

    if (this.selectedCommunityId) {
      listContainer.classList.add('hidden');
      detailContainer.classList.remove('hidden');
      await this.loadCommunityDetail(this.selectedCommunityId);
    } else {
      listContainer.classList.remove('hidden');
      detailContainer.classList.add('hidden');
      await this.loadCommunitiesList();
    }
  },

  bindSearch() {
    const input = document.getElementById('communities-search');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    // Filters the already-loaded rows; no refetch, so typing stays responsive.
    input.addEventListener('input', debounce(() => {
      this.searchTerm = input.value.toLowerCase().trim();
      this.renderCommunitiesGrid();
    }, 150));
  },

  // ---------------------------------------------------------------- list view

  async loadCommunitiesList() {
    const loadingEl = document.getElementById('communities-loading');
    const grid = document.getElementById('communities-grid');
    grid.innerHTML = '';

    try {
      // One RPC replaces what used to be a read of every profile row on the
      // platform pulled into the browser just to count members per card.
      this.overview = unwrap(
        await supabase.rpc('platform_get_communities_overview'),
        'communities'
      );
      this.renderCommunitiesGrid();
    } catch (err) {
      console.error('Error loading communities list:', err);
      grid.innerHTML = errorBanner(err.message, 'communities');
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  renderCommunitiesGrid() {
    const grid = document.getElementById('communities-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const q = this.searchTerm;
    const filtered = this.overview.filter(c => {
      if (!q) return true;
      return [c.name, c.city, c.pincode, c.area, c.code]
        .some(v => (v || '').toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1;">' +
        emptyState(this.overview.length === 0 ? 'No communities yet.' : 'No communities match that search.') +
        '</div>';
      return;
    }

    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = 'metric-card clickable';
      card.innerHTML = `
        <div class="metric-header">
          <span>${esc(c.community_type || 'Residential')}</span>
          <span style="font-size: 0.8rem; color: var(--accent); font-weight: 500;">CODE: ${esc(c.code)}</span>
        </div>
        <div class="metric-value" style="font-size: 1.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">
          ${esc(c.name)}
        </div>
        <div class="metric-subtitle">
          ${esc(c.area ? c.area + ', ' : '')}${esc(c.city || 'N/A')}
          <div class="community-card-stats">
            <span>👥 ${fmtNumber(c.members)}</span>
            <span>🔑 ${fmtNumber(c.leads)}</span>
            <span>🍲 ${fmtNumber(c.drops)}</span>
            <span>🏪 ${fmtNumber(c.listings)}</span>
            <span>🎪 ${fmtNumber(c.events)}</span>
            ${c.funds_enabled ? `<span>💰 ${fmtMoney(c.balance)}</span>` : ''}
          </div>
          <span class="text-3" style="font-size: 0.75rem;">Last active ${esc(fmtRelative(c.last_activity_at))}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        // Drive through the hash so the detail view is linkable and the browser
        // back button leaves it.
        window.location.hash = '#communities?id=' + c.id;
      });
      grid.appendChild(card);
    });
  },

  // -------------------------------------------------------------- detail view

  async loadCommunityDetail(communityId) {
    const loadingEl = document.getElementById('communities-loading');
    const container = document.getElementById('community-detail-info');

    try {
      const { data: community, error: communityError } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .maybeSingle();

      if (communityError) throw communityError;
      if (!community) {
        container.innerHTML = errorBanner('Community not found.', 'this community');
        return;
      }
      this.community = community;

      // Fetched in parallel — this used to be six sequential round trips.
      const [
        residentsRes, blocksRes, flatsRes, fundsRes,
        dropsRes, hostsRes, bizRes, ownersRes, catsRes,
        eventsRes, organizersRes
      ] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, email, flat_number, phone_number, app_role, removed_at, created_at, community_id, block_id')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false }),
        community.blocks_enabled
          ? supabase.rpc('list_community_blocks', { p_community_id: communityId })
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc('list_community_flats', { p_community_id: communityId }),
        community.funds_enabled
          ? supabase.rpc('platform_get_community_funds', { p_community_id: communityId })
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc('platform_get_community_preorders', { p_community_id: communityId }),
        supabase.rpc('platform_get_preorder_hosts', { p_community_id: communityId }),
        supabase.rpc('platform_get_community_businesses', { p_community_id: communityId }),
        supabase.rpc('platform_get_business_owners', { p_community_id: communityId }),
        supabase.rpc('platform_get_business_categories', { p_community_id: communityId }),
        supabase.rpc('platform_get_community_events', { p_community_id: communityId }),
        supabase.rpc('platform_get_event_organizers', { p_community_id: communityId })
      ]);

      this.residents = unwrap(residentsRes, 'residents');
      this.communityBlocks = unwrap(blocksRes, 'blocks');
      this.communityFlats = unwrap(flatsRes, 'flats');
      this.communityFunds = unwrap(fundsRes, 'funds');
      this.communityPreorders = unwrap(dropsRes, 'menus');
      this.preorderHosts = unwrap(hostsRes, 'menu hosts');
      this.communityBusinesses = unwrap(bizRes, 'businesses');
      this.businessOwners = unwrap(ownersRes, 'business owners');
      this.businessCategories = unwrap(catsRes, 'business categories');
      this.communityEvents = unwrap(eventsRes, 'community events');
      this.eventOrganizers = unwrap(organizersRes, 'events coordinators');

      this.render();
    } catch (err) {
      console.error('Error loading community details:', err);
      container.innerHTML = errorBanner(err.message, err.context || 'this community');
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  // Derived helpers -----------------------------------------------------------

  activeResidents() {
    return this.residents.filter(r => !r.removed_at);
  },

  activeLeads() {
    return this.activeResidents().filter(
      r => r.app_role === 'president' || r.app_role === 'vice_president'
    );
  },

  plainResidents() {
    return this.activeResidents().filter(r => r.app_role === 'resident');
  },

  residentOptions(excludeIds) {
    const skip = excludeIds || new Set();
    let html = '<option value="">Select resident...</option>';
    this.plainResidents()
      .filter(r => !skip.has(r.id))
      .forEach(r => {
        html += `<option value="${escAttr(r.id)}">${esc(r.full_name || 'Resident')} (${esc(r.flat_number || 'No flat')})</option>`;
      });
    return html;
  },

  foodTotals() {
    return this.communityPreorders.reduce((acc, d) => {
      acc.revenue += Number(d.total_revenue || 0);
      acc.orders += Number(d.orders_count || 0);
      if (d.status === 'open') acc.open += 1;
      return acc;
    }, { revenue: 0, orders: 0, open: 0 });
  },

  // Rendering -----------------------------------------------------------------

  render() {
    const container = document.getElementById('community-detail-info');
    const c = this.community;
    const food = this.foodTotals();
    const activeBiz = this.communityBusinesses.filter(b => b.is_active).length;
    const fundBalance = this.communityFunds.reduce((s, f) => s + Number(f.balance || 0), 0);
    const upcoming = this.communityEvents.filter(
      e => e.status === 'published' && e.event_date >= new Date().toISOString().slice(0, 10)
    ).length;

    const tabsHtml = this.TABS.map(t => `
      <button class="tab-btn ${this.activeTab === t.key ? 'active' : ''}" data-tab="${escAttr(t.key)}">
        ${esc(t.label)}
      </button>
    `).join('');

    container.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-top">
          <div>
            <h2>${esc(c.name)}</h2>
            <p class="text-2">
              ${esc(c.community_type || 'Residential')} community${c.city ? ' in ' + esc(c.city) : ''}
              ${c.area ? ' · ' + esc(c.area) : ''}${c.pincode ? ' · ' + esc(c.pincode) : ''}
            </p>
          </div>
          <div class="detail-header-actions">
            <span class="badge-pill badge-active">CODE: ${esc(c.code)}</span>
            <button class="btn btn-secondary btn-sm" id="export-community-btn">Export CSV</button>
          </div>
        </div>

        <div class="stat-strip">
          <div class="stat"><span class="stat-value">${fmtNumber(this.activeResidents().length)}</span><span class="stat-label">residents</span></div>
          <div class="stat"><span class="stat-value">${fmtNumber(this.activeLeads().length)}</span><span class="stat-label">leads</span></div>
          <div class="stat"><span class="stat-value">${fmtNumber(this.communityPreorders.length)}</span><span class="stat-label">menus</span></div>
          <div class="stat"><span class="stat-value">${fmtMoney(food.revenue)}</span><span class="stat-label">food sales</span></div>
          <div class="stat"><span class="stat-value">${fmtNumber(activeBiz)}</span><span class="stat-label">active businesses</span></div>
          <div class="stat"><span class="stat-value">${fmtNumber(this.communityFunds.length)}</span><span class="stat-label">funds</span></div>
          <div class="stat"><span class="stat-value">${fmtMoney(fundBalance)}</span><span class="stat-label">fund balance</span></div>
          <div class="stat"><span class="stat-value">${fmtNumber(upcoming)}</span><span class="stat-label">upcoming events</span></div>
        </div>

        <div class="tab-bar">${tabsHtml}</div>
      </div>

      <div id="community-tab-panel">${this.renderActiveTab()}</div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.getAttribute('data-tab')));
    });

    const exportBtn = document.getElementById('export-community-btn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportActiveTab());

    this.bindTabListeners();
  },

  switchTab(tab) {
    this.activeTab = tab;
    // Keep the tab in the URL so a specific panel can be linked and reloaded.
    const base = '#communities?id=' + this.selectedCommunityId;
    const next = tab === 'overview' ? base : base + '&tab=' + tab;
    if (window.location.hash !== next) {
      // Update without re-triggering a full page load.
      history.replaceState(null, '', next);
    }
    this.renderTabPanelOnly();
  },

  // Re-renders only the panel. Rebuilding the whole detail view on every
  // keystroke is what used to steal focus from the residents search box.
  renderTabPanelOnly() {
    const panel = document.getElementById('community-tab-panel');
    if (!panel) return;
    panel.innerHTML = this.renderActiveTab();

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === this.activeTab);
    });

    this.bindTabListeners();
  },

  renderActiveTab() {
    switch (this.activeTab) {
      case 'people': return this.renderPeopleTab();
      case 'commerce': return this.renderCommerceTab();
      case 'funds': return this.renderFundsTab();
      case 'events': return this.renderEventsTab();
      default: return this.renderOverviewTab();
    }
  },

  // Tab: Overview -------------------------------------------------------------

  renderOverviewTab() {
    const c = this.community;
    const food = this.foodTotals();
    const collected = this.communityFunds.reduce((s, f) => s + Number(f.income || 0), 0);
    const spent = this.communityFunds.reduce((s, f) => s + Number(f.expense || 0), 0);

    return `
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="section-card">
            <h2>Community Information</h2>
            <div class="kv-list">
              <div><span>Name</span><strong>${esc(c.name)}</strong></div>
              <div><span>Join code</span><strong>${esc(c.code)}</strong></div>
              <div><span>Type</span><strong>${esc(c.community_type || 'Residential')}</strong></div>
              <div><span>City</span><strong>${esc(c.city || 'N/A')}</strong></div>
              <div><span>Area</span><strong>${esc(c.area || 'N/A')}</strong></div>
              <div><span>Pincode</span><strong>${esc(c.pincode || 'N/A')}</strong></div>
              <div><span>Address</span><strong>${esc(c.address || 'N/A')}</strong></div>
              <div><span>Approx. units</span><strong>${esc(c.approximate_units || 'N/A')}</strong></div>
              <div><span>Created</span><strong>${esc(fmtDate(c.created_at))}</strong></div>
            </div>
          </div>

          <div class="section-card">
            <h2>Feature Status</h2>
            <div class="kv-list">
              <div><span>Funds</span>${c.funds_enabled ? badge('Active', 'approved') : badge('Inactive', 'rejected')}</div>
              <div><span>${esc(c.block_label)}s</span>${c.blocks_enabled ? badge('Enabled', 'approved') : badge('Disabled', 'muted')}</div>
              <div><span>Flats on record</span><strong>${fmtNumber(this.communityFlats.length)}</strong></div>
              <div><span>Events coordinators</span><strong>${fmtNumber(this.eventOrganizers.length)}</strong></div>
            </div>
            ${c.funds_enabled ? `
              <button class="btn btn-danger btn-block" style="margin-top: 16px; font-size: 0.85rem;" id="revoke-funds-btn">
                Revoke Funds Access
              </button>
            ` : ''}
          </div>
        </div>

        <div class="detail-main">
          <div class="section-card">
            <h2>At a Glance</h2>
            <div class="mini-metrics">
              ${this.miniMetric('Residents', fmtNumber(this.activeResidents().length), fmtNumber(this.residents.length - this.activeResidents().length) + ' removed')}
              ${this.miniMetric('Community leads', fmtNumber(this.activeLeads().length), this.activeLeads().map(l => esc(l.full_name || 'Resident')).join(', ') || 'None appointed')}
              ${this.miniMetric('Menus', fmtNumber(this.communityPreorders.length), fmtNumber(food.open) + ' open · ' + fmtNumber(this.preorderHosts.length) + ' hosts')}
              ${this.miniMetric('Food sales', fmtMoney(food.revenue), fmtNumber(food.orders) + ' pre-orders')}
              ${this.miniMetric('Businesses', fmtNumber(this.communityBusinesses.length), fmtNumber(this.businessOwners.length) + ' owners · ' + fmtNumber(this.businessCategories.length) + ' categories')}
              ${this.miniMetric('Funds collected', fmtMoney(collected), fmtMoney(spent) + ' spent')}
              ${this.miniMetric('Community events', fmtNumber(this.communityEvents.length), fmtNumber(this.eventOrganizers.length) + ' coordinators')}
              ${this.miniMetric('Flats', fmtNumber(this.communityFlats.length), fmtNumber(this.communityBlocks.length) + ' ' + esc(c.block_label.toLowerCase()) + 's')}
            </div>
          </div>

          <div class="section-card">
            <h2>Top Contributors</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-bottom: 12px;">Residents driving activity in this community.</p>
            ${this.renderTopContributors()}
          </div>
        </div>
      </div>
    `;
  },

  miniMetric(label, value, sub) {
    return `
      <div class="mini-metric">
        <div class="mini-metric-label">${esc(label)}</div>
        <div class="mini-metric-value">${value}</div>
        <div class="mini-metric-sub">${sub}</div>
      </div>
    `;
  },

  renderTopContributors() {
    const rows = [];

    this.preorderHosts.slice(0, 3).forEach(h => rows.push({
      who: h.host_name, flat: h.host_flat,
      what: 'Food host', detail: fmtNumber(h.drops_total) + ' drops · ' + fmtMoney(h.revenue_total)
    }));
    this.businessOwners.slice(0, 3).forEach(o => rows.push({
      who: o.owner_name, flat: o.owner_flat,
      what: 'Business owner', detail: fmtNumber(o.listings_total) + ' listings · ' + fmtNumber(o.products_total) + ' products'
    }));
    this.eventOrganizers.slice(0, 3).forEach(o => rows.push({
      who: o.full_name, flat: o.flat_number,
      what: 'Events coordinator', detail: fmtNumber(o.events_posted) + ' events posted'
    }));

    if (rows.length === 0) return emptyState('No resident activity recorded yet.');

    return '<div class="contributor-list">' + rows.map(r => `
      <div class="contributor-row">
        <div>
          <strong>${esc(r.who)}</strong>
          <span class="text-3" style="font-size: 0.8rem;">${r.flat ? ' · ' + esc(r.flat) : ''}</span>
          <div class="text-3" style="font-size: 0.78rem;">${esc(r.detail)}</div>
        </div>
        ${badge(r.what, 'muted')}
      </div>
    `).join('') + '</div>';
  },

  // Tab: People & Roles -------------------------------------------------------

  renderPeopleTab() {
    const c = this.community;

    return `
      <div class="detail-layout">
        <div class="detail-sidebar">
          ${this.renderLeadsPanel()}
          ${this.renderCoordinatorsPanel()}
        </div>
        <div class="detail-main">
          ${this.renderBlocksPanel()}
          ${this.renderFlatsPanel()}
          ${c.funds_enabled ? this.renderFundRolesPanel() : ''}
          ${this.renderResidentsPanel()}
        </div>
      </div>
    `;
  },

  renderLeadsPanel() {
    const leads = this.activeLeads();

    const leadsHtml = leads.length > 0
      ? leads.map(l => `
          <div class="row-between">
            <div>
              <strong>${esc(l.full_name || 'Resident')}</strong> <span class="text-3">(${esc(roleLabel(l.app_role))})</span>
              <div class="text-3" style="font-size: 0.85rem;">${esc(l.email || 'No email')}</div>
            </div>
            <button class="btn btn-secondary btn-sm danger-text" data-action="demote-lead" data-id="${escAttr(l.id)}">Demote</button>
          </div>
        `).join('')
      : emptyState('No leads assigned to this community.');

    // Deliberately NOT gated on funds_enabled: a community that has not
    // requested funds still needs a president, and platform_set_community_lead
    // has no funds precondition.
    return `
      <div class="section-card">
        <h2>Community Leads</h2>
        <div class="stack">${leadsHtml}</div>

        <div class="panel-divider"></div>
        <h3 class="panel-subhead">Appoint a lead</h3>
        <p class="text-3" style="font-size: 0.8rem; margin-bottom: 8px;">
          Appointing replaces the current holder of that role.
        </p>
        <select class="form-control" id="lead-appoint-resident">${this.residentOptions()}</select>
        <div class="btn-row" style="margin-top: 8px;">
          <button class="btn btn-primary btn-sm" data-action="appoint-lead" data-role="president">President</button>
          <button class="btn btn-secondary btn-sm" data-action="appoint-lead" data-role="vice_president">Vice President</button>
        </div>
      </div>
    `;
  },

  renderCoordinatorsPanel() {
    const holders = new Set(this.eventOrganizers.map(o => o.user_id));

    const listHtml = this.eventOrganizers.length > 0
      ? this.eventOrganizers.map(o => `
          <div class="row-between">
            <div>
              <strong>${esc(o.full_name)}</strong>
              <span class="text-3" style="font-size: 0.8rem;">${o.flat_number ? ' · ' + esc(o.flat_number) : ''}</span>
              <div class="text-3" style="font-size: 0.78rem;">
                ${esc(o.email || 'No email')} · ${fmtNumber(o.events_posted)} ${pluralize(o.events_posted, 'event')} posted
              </div>
            </div>
            <button class="btn btn-secondary btn-sm danger-text" data-action="revoke-coordinator" data-id="${escAttr(o.user_id)}">Revoke</button>
          </div>
        `).join('')
      : emptyState('No events coordinators appointed.');

    // Leads can always post events without holding this grant, so say so —
    // an empty list does not mean nobody can post.
    return `
      <div class="section-card">
        <h2>Events Coordinators</h2>
        <p class="text-3" style="font-size: 0.8rem; margin-bottom: 12px;">
          Residents allowed to post community events. Presidents and vice presidents
          can always post without holding this grant.
        </p>
        <div class="stack">${listHtml}</div>

        <div class="panel-divider"></div>
        <select class="form-control" id="coordinator-select">${this.residentOptions(holders)}</select>
        <button class="btn btn-primary btn-sm btn-block" style="margin-top: 8px;" data-action="grant-coordinator">
          Appoint Coordinator
        </button>
      </div>
    `;
  },

  renderBlocksPanel() {
    const c = this.community;

    const blocksHtml = this.communityBlocks.length > 0
      ? this.communityBlocks.map(b => `
          <div class="row-between compact">
            <span style="font-weight: 500;">${esc(b.name)}</span>
            <button class="btn btn-secondary btn-sm danger-text" data-action="archive-block" data-id="${escAttr(b.id)}">Archive</button>
          </div>
        `).join('')
      : emptyState('No ' + esc(c.block_label.toLowerCase()) + 's created yet.');

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <h2>${esc(c.block_label)}s</h2>
          <label class="toggle-label">
            <span class="text-2">Enabled</span>
            <input type="checkbox" id="blocks-enabled-toggle" ${c.blocks_enabled ? 'checked' : ''}>
          </label>
        </div>

        ${c.blocks_enabled ? `
          <div class="btn-row" style="margin-bottom: 16px;">
            <button class="btn ${c.block_label === 'Block' ? 'btn-primary' : 'btn-secondary'} btn-pill" data-action="set-block-label" data-label="Block">Block</button>
            <button class="btn ${c.block_label === 'Tower' ? 'btn-primary' : 'btn-secondary'} btn-pill" data-action="set-block-label" data-label="Tower">Tower</button>
          </div>

          <div class="scroll-box" style="max-height: 200px;">${blocksHtml}</div>

          <div class="btn-row" style="margin-top: 12px;">
            <input type="text" class="form-control" id="new-block-name" placeholder="Add new ${esc(c.block_label.toLowerCase())}...">
            <button class="btn btn-primary" data-action="add-block">Add</button>
          </div>
        ` : `<p class="text-3">Turn on ${esc(c.block_label.toLowerCase())}s to manage collection scopes.</p>`}
      </div>
    `;
  },

  renderFlatsPanel() {
    const c = this.community;
    let flatsHtml = '';

    if (this.communityFlats.length > 0) {
      const grouped = {};
      this.communityFlats.forEach(f => {
        const key = f.block_name || 'No block';
        (grouped[key] = grouped[key] || []).push(f);
      });

      flatsHtml = Object.entries(grouped).map(([blockName, flats]) => `
        <div style="margin-bottom: 12px;">
          <strong style="font-size: 0.85rem; color: var(--primary);">
            ${esc(c.block_label)} ${esc(blockName)} (${fmtNumber(flats.length)} flats)
          </strong>
          <div class="chip-wrap">
            ${flats.map(f => `
              <span class="chip">
                ${esc(f.flat_number)}${Number(f.resident_count) > 0 ? ` <small class="text-3">(${fmtNumber(f.resident_count)})</small>` : ''}
                <span class="chip-remove" title="Archive flat" data-action="archive-flat" data-id="${escAttr(f.id)}">&times;</span>
              </span>
            `).join('')}
          </div>
        </div>
      `).join('');
    } else {
      flatsHtml = emptyState('No flats added to this community yet.');
    }

    const blockOptions = '<option value="">Select ' + esc(c.block_label.toLowerCase()) + '...</option>' +
      this.communityBlocks.map(b => `<option value="${escAttr(b.id)}">${esc(b.name)}</option>`).join('');

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <h2>Flats Inventory</h2>
          <span class="badge-pill badge-muted">${fmtNumber(this.communityFlats.length)} total ${pluralize(this.communityFlats.length, 'flat')}</span>
        </div>

        <div class="scroll-box" style="max-height: 240px;">${flatsHtml}</div>

        ${this.communityBlocks.length > 0 ? `
          <div class="form-row" style="grid-template-columns: 160px 1fr auto; align-items: end; margin-top: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label>${esc(c.block_label)}</label>
              <select class="form-control" id="add-flats-block-select">${blockOptions}</select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Flat numbers (comma or space separated)</label>
              <input type="text" class="form-control" id="add-flats-input" placeholder="e.g. 101, 102, 103">
            </div>
            <button class="btn btn-primary" data-action="add-flats">Add Flats</button>
          </div>
        ` : `<p class="text-3" style="margin-top: 12px;">Add at least one ${esc(c.block_label.toLowerCase())} above before adding flats.</p>`}
      </div>
    `;
  },

  renderFundRolesPanel() {
    if (this.communityFunds.length === 0) {
      return `<div class="section-card"><h2>Fund Roles</h2>${emptyState('No funds created in this community yet.')}</div>`;
    }

    const blockOptions = this.communityBlocks
      .map(b => `<option value="${escAttr(b.id)}">${esc(b.name)}</option>`).join('');

    const cards = this.communityFunds.map(fund => {
      const treasurers = fund.treasurers || [];
      const collectors = fund.collectors || [];
      const taken = new Set([
        ...treasurers.map(t => t.user_id),
        ...collectors.map(c => c.user_id)
      ]);

      const treasurersHtml = treasurers.length > 0
        ? treasurers.map(t => `
            <div class="mini-row">
              <strong>${esc(t.full_name || 'Resident')}</strong>
              <span class="text-3" style="font-size: 0.8rem;"> · ${esc(t.email || 'No email')}</span>
            </div>
          `).join('')
        : '<div class="text-3 mini-row">No treasurer assigned.</div>';

      const collectorsHtml = collectors.length > 0
        ? collectors.map(col => {
            const resident = this.residents.find(r => r.id === col.user_id);
            const flat = resident && resident.flat_number ? ' (Flat ' + esc(resident.flat_number) + ')' : '';
            return `
              <div class="row-between compact">
                <div style="font-size: 0.85rem;">
                  <strong>${esc(col.full_name || 'Resident')}</strong>${flat}
                  <span class="text-3" style="font-size: 0.8rem;"> · ${esc(col.block_name || 'All blocks')}</span>
                </div>
                <button class="btn btn-secondary btn-sm danger-text"
                        data-action="remove-collector" data-fund="${escAttr(fund.id)}" data-id="${escAttr(col.user_id)}">Remove</button>
              </div>
            `;
          }).join('')
        : '<div class="text-3 mini-row">No collectors assigned.</div>';

      return `
        <div class="fund-role-card">
          <div class="row-between" style="margin-bottom: 6px;">
            <strong style="color: var(--primary); font-size: 0.95rem;">${esc(fund.title)}</strong>
            ${fund.is_closed ? badge('Closed', 'rejected') : badge('Active', 'approved')}
          </div>

          <div class="panel-subhead">Treasurer</div>
          ${treasurersHtml}
          <div class="btn-row" style="margin-top: 4px;">
            <select class="form-control form-control-sm" id="treasurer-select-${escAttr(fund.id)}">
              ${this.residentOptions(new Set(treasurers.map(t => t.user_id)))}
            </select>
            <button class="btn btn-secondary btn-sm" data-action="set-treasurer" data-fund="${escAttr(fund.id)}">
              ${treasurers.length > 0 ? 'Replace' : 'Assign'}
            </button>
          </div>

          <div class="panel-subhead" style="margin-top: 10px;">Block Collectors</div>
          ${collectorsHtml}
          <div class="btn-row" style="margin-top: 4px;">
            <select class="form-control form-control-sm" id="collector-select-${escAttr(fund.id)}">
              ${this.residentOptions(taken)}
            </select>
            ${this.community.blocks_enabled ? `
              <select class="form-control form-control-sm" id="collector-block-${escAttr(fund.id)}">
                <option value="">All blocks</option>
                ${blockOptions}
              </select>
            ` : ''}
            <button class="btn btn-secondary btn-sm" data-action="add-collector" data-fund="${escAttr(fund.id)}">Add</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-card">
        <h2>Fund Roles</h2>
        <p class="text-3" style="font-size: 0.8rem; margin-bottom: 12px;">
          Treasurer and block collectors are per fund, not per community — a community
          with three funds has three independent treasurers.
        </p>
        <div class="scroll-box" style="max-height: 420px;">${cards}</div>
      </div>
    `;
  },

  renderResidentsPanel() {
    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 16px;">
          <h2>Residents Directory</h2>
          <input type="text" class="form-control" id="residents-search" placeholder="Search residents..."
                 style="max-width: 260px;" value="${escAttr(this.residentSearch)}">
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Resident</th>
                <th>Flat</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="residents-tbody">${this.renderResidentRows()}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderResidentRows() {
    const q = this.residentSearch.toLowerCase().trim();
    const filtered = this.residents.filter(r => {
      if (!q) return true;
      return [r.full_name, r.email, r.phone_number, r.flat_number]
        .some(v => (v || '').toLowerCase().includes(q));
    });

    if (filtered.length === 0) return emptyRow(6, 'No residents found.');

    const coordinatorIds = new Set(this.eventOrganizers.map(o => o.user_id));

    return filtered.map(r => `
      <tr class="${r.removed_at ? 'row-removed' : ''} clickable-row" data-action="view-resident" data-id="${escAttr(r.id)}">
        <td style="font-weight: 500;">
          ${esc(r.full_name || 'Resident')}
          <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">${esc(r.email || 'No email')}</span>
        </td>
        <td>${esc(r.flat_number || 'N/A')}</td>
        <td>${esc(r.phone_number || 'N/A')}</td>
        <td>
          <span class="badge-pill ${r.app_role !== 'resident' ? 'badge-active' : 'badge-muted'}">${esc(roleLabel(r.app_role))}</span>
          ${coordinatorIds.has(r.id) ? badge('Events', 'approved') : ''}
          ${r.removed_at ? badge('Removed', 'rejected') : ''}
        </td>
        <td class="text-3">${esc(fmtDate(r.created_at))}</td>
        <td>
          <div class="btn-row">
            ${!r.removed_at ? `<button class="btn btn-secondary btn-sm danger-text" data-action="remove-resident" data-id="${escAttr(r.id)}">Remove</button>` : ''}
            <button class="btn btn-secondary btn-sm danger-text-strong" data-action="delete-resident" data-id="${escAttr(r.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  // Tab: Commerce -------------------------------------------------------------

  renderCommerceTab() {
    return `
      ${this.renderFoodPanel()}
      ${this.renderBusinessPanel()}
      ${this.renderProviderSummaryPanel()}
    `;
  },

  renderFoodPanel() {
    const totals = this.foodTotals();
    const view = this.commerceView.food;

    let body;
    if (view === 'hosts') {
      body = this.preorderHosts.length === 0
        ? emptyRow(6, 'No menus created in this community yet.')
        : this.preorderHosts.map(h => `
            <tr>
              <td style="font-weight: 500;">
                ${esc(h.host_name)}
                <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
                  ${esc(h.host_flat || 'No flat')}${h.host_email ? ' · ' + esc(h.host_email) : ''}
                </span>
              </td>
              <td>${fmtNumber(h.drops_total)}<span class="text-3" style="font-size: 0.78rem;"> (${fmtNumber(h.drops_open)} open)</span></td>
              <td>${fmtNumber(h.orders_total)}</td>
              <td>${fmtNumber(h.distinct_buyers)}</td>
              <td>${fmtMoney(h.avg_order_value)}</td>
              <td style="font-weight: 600; color: var(--primary);">${fmtMoney(h.revenue_total)}</td>
            </tr>
          `).join('');
    } else {
      body = this.communityPreorders.length === 0
        ? emptyRow(6, 'No menus created in this community yet.')
        : this.communityPreorders.map(d => `
            <tr>
              <td style="font-weight: 500;">
                ${esc(d.title || 'Menu')}
                <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
                  Host: ${esc(d.creator_name || 'Resident')} (${esc(d.creator_flat || 'N/A')})
                </span>
              </td>
              <td>${esc(fmtDate(d.fulfillment_date))}<br><span class="text-3" style="font-size: 0.8rem;">${esc(d.fulfillment_time || 'N/A')}</span></td>
              <td>${statusBadge(d.status)}</td>
              <td>${esc(fmtDate(d.cutoff_at))}</td>
              <td>${fmtNumber(d.orders_count)}</td>
              <td style="font-weight: 600; color: var(--primary);">${fmtMoney(d.total_revenue)}</td>
            </tr>
          `).join('');
    }

    const headers = view === 'hosts'
      ? ['Host', 'Menus', 'Orders', 'Buyers', 'Avg order', 'Revenue']
      : ['Drop & Host', 'Fulfillment', 'Status', 'Cutoff', 'Orders', 'Revenue'];

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h2>🍲 Pre-Order Menus</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
              ${fmtNumber(this.communityPreorders.length)} drops (${fmtNumber(totals.open)} open) ·
              ${fmtNumber(totals.orders)} pre-orders · ${fmtNumber(this.preorderHosts.length)} ${pluralize(this.preorderHosts.length, 'host')}
            </p>
          </div>
          <div class="row-right">
            <div class="segmented">
              <button class="seg-btn ${view === 'drops' ? 'active' : ''}" data-action="food-view" data-view="drops">By menu</button>
              <button class="seg-btn ${view === 'hosts' ? 'active' : ''}" data-action="food-view" data-view="hosts">By host</button>
            </div>
            <span class="badge-pill badge-approved" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 700;">
              ${fmtMoney(totals.revenue)} Sales
            </span>
          </div>
        </div>
        <div class="table-container" style="max-height: 320px; overflow-y: auto;">
          <table>
            <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderBusinessPanel() {
    const view = this.commerceView.business;
    const activeCount = this.communityBusinesses.filter(b => b.is_active).length;

    let headers, body;

    if (view === 'owners') {
      headers = ['Owner', 'Listings', 'Products', 'Categories', 'Rating', 'Flagged'];
      body = this.businessOwners.length === 0
        ? emptyRow(6, 'No resident businesses listed in this community yet.')
        : this.businessOwners.map(o => `
            <tr>
              <td style="font-weight: 500;">
                ${esc(o.owner_name)}
                <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
                  ${esc(o.owner_flat || 'No flat')}${o.owner_email ? ' · ' + esc(o.owner_email) : ''}
                </span>
              </td>
              <td>${fmtNumber(o.listings_total)}<span class="text-3" style="font-size: 0.78rem;"> (${fmtNumber(o.listings_active)} active)</span></td>
              <td>${fmtNumber(o.products_total)}</td>
              <td class="text-3" style="font-size: 0.82rem;">${esc(o.categories || '—')}</td>
              <td>${Number(o.rating_count) > 0 ? '⭐ ' + Number(o.avg_rating).toFixed(1) + ' (' + fmtNumber(o.rating_count) + ')' : '<span class="text-3">No ratings</span>'}</td>
              <td>${Number(o.flagged_count) > 0 ? badge(fmtNumber(o.flagged_count) + ' flagged', 'rejected') : '<span class="text-3">—</span>'}</td>
            </tr>
          `).join('');
    } else if (view === 'categories') {
      headers = ['Category', 'Listings', 'Active', 'Owners', 'Products', 'Rating'];
      body = this.businessCategories.length === 0
        ? emptyRow(6, 'No resident businesses listed in this community yet.')
        : this.businessCategories.map(c => `
            <tr>
              <td style="font-weight: 500;">${esc(c.category_emoji || '🏪')} ${esc(c.category_name)}</td>
              <td>${fmtNumber(c.listing_count)}</td>
              <td>${fmtNumber(c.active_count)}</td>
              <td>${fmtNumber(c.owner_count)}</td>
              <td>${fmtNumber(c.product_count)}</td>
              <td>${Number(c.rating_count) > 0 ? '⭐ ' + Number(c.avg_rating).toFixed(1) + ' (' + fmtNumber(c.rating_count) + ')' : '<span class="text-3">No ratings</span>'}</td>
            </tr>
          `).join('');
    } else {
      headers = ['Business & Owner', 'Category', 'Contact', 'Products', 'Rating', 'Status'];
      body = this.communityBusinesses.length === 0
        ? emptyRow(6, 'No resident businesses listed in this community yet.')
        : this.communityBusinesses.map(b => {
            // Stored numbers are 10 digits; the 91 prefix is added at link time.
            const wa = buildWhatsAppUrl(b.contact_phone);
            return `
              <tr>
                <td style="font-weight: 500;">
                  ${esc(b.category_emoji || '🏪')} ${esc(b.name || 'Business')}
                  <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
                    Owner: ${esc(b.owner_name || 'Resident')} (${esc(b.owner_flat || 'N/A')})
                  </span>
                </td>
                <td>${badge(b.category_name || 'General', 'muted')}</td>
                <td>
                  ${esc(b.contact_phone || 'N/A')}
                  ${wa ? `<a href="${escAttr(wa)}" target="_blank" rel="noopener" style="margin-left: 6px; text-decoration: none;" title="Chat on WhatsApp">💬</a>` : ''}
                </td>
                <td>${fmtNumber(b.product_count)}</td>
                <td>${Number(b.rating_count) > 0 ? '⭐ ' + Number(b.avg_rating).toFixed(1) + ' (' + fmtNumber(b.rating_count) + ')' : '<span class="text-3">No ratings</span>'}</td>
                <td>${b.is_active ? badge('Active', 'approved') : badge('Inactive', 'rejected')}</td>
              </tr>
            `;
          }).join('');
    }

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h2>🏪 Resident Businesses</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
              ${fmtNumber(this.communityBusinesses.length)} listings (${fmtNumber(activeCount)} active) ·
              ${fmtNumber(this.businessOwners.length)} ${pluralize(this.businessOwners.length, 'owner')} ·
              ${fmtNumber(this.businessCategories.length)} ${pluralize(this.businessCategories.length, 'category', 'categories')}
            </p>
          </div>
          <div class="segmented">
            <button class="seg-btn ${view === 'listings' ? 'active' : ''}" data-action="business-view" data-view="listings">By listing</button>
            <button class="seg-btn ${view === 'owners' ? 'active' : ''}" data-action="business-view" data-view="owners">By owner</button>
            <button class="seg-btn ${view === 'categories' ? 'active' : ''}" data-action="business-view" data-view="categories">By category</button>
          </div>
        </div>
        <div class="table-container" style="max-height: 320px; overflow-y: auto;">
          <table>
            <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderProviderSummaryPanel() {
    return `
      <div class="section-card">
        <div class="row-between">
          <div>
            <h2>🔧 Service Providers</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
              Provider moderation, reports and reviews live on the Providers page.
            </p>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="open-providers">Open Providers →</button>
        </div>
      </div>
    `;
  },

  // Tab: Funds ----------------------------------------------------------------

  renderFundsTab() {
    const c = this.community;

    if (!c.funds_enabled) {
      return `
        <div class="section-card">
          <h2>Funds</h2>
          ${emptyState('Funds are not enabled for this community. Approve a funds access request to activate them.')}
        </div>
      `;
    }

    if (this.communityFunds.length === 0) {
      return `<div class="section-card"><h2>Funds</h2>${emptyState('No funds created in this community yet.')}</div>`;
    }

    const collected = this.communityFunds.reduce((s, f) => s + Number(f.income || 0), 0);
    const spent = this.communityFunds.reduce((s, f) => s + Number(f.expense || 0), 0);

    const cards = this.communityFunds.map(f => {
      const income = Number(f.income || 0);
      const expense = Number(f.expense || 0);
      const contributors = (f.contributions || []).length;
      const pct = income > 0 ? Math.min(100, Math.round((expense / income) * 100)) : 0;

      return `
        <div class="fund-card clickable" data-action="view-fund" data-id="${escAttr(f.id)}">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="color: var(--primary);">${esc(f.title)}</strong>
            ${f.is_closed ? badge('Closed', 'rejected') : badge('Active', 'approved')}
          </div>
          <div class="fund-figures">
            <div><span class="fund-label">Collected</span><span class="fund-value accent">${fmtMoney(income)}</span></div>
            <div><span class="fund-label">Spent</span><span class="fund-value">${fmtMoney(expense)}</span></div>
            <div><span class="fund-label">Balance</span><span class="fund-value primary">${fmtMoney(f.balance)}</span></div>
          </div>
          <div class="progress-track" title="${pct}% of collected funds spent">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="text-3" style="font-size: 0.78rem; margin-top: 6px;">
            ${fmtNumber(contributors)} ${pluralize(contributors, 'contribution')} ·
            ${fmtNumber((f.treasurers || []).length)} treasurer ·
            ${fmtNumber((f.collectors || []).length)} ${pluralize((f.collectors || []).length, 'collector')}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h2>💰 Community Funds</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
              ${fmtNumber(this.communityFunds.length)} ${pluralize(this.communityFunds.length, 'fund')} ·
              ${fmtMoney(collected)} collected · ${fmtMoney(spent)} spent ·
              ${fmtMoney(collected - spent)} available
            </p>
          </div>
          <button class="btn btn-danger btn-sm" id="revoke-funds-btn">Revoke Funds Access</button>
        </div>
        <div class="fund-grid">${cards}</div>
        <p class="text-3" style="font-size: 0.8rem; margin-top: 12px;">
          Open a fund for its full ledger, contributor list and per-block collection coverage.
        </p>
      </div>
    `;
  },

  // Tab: Events ---------------------------------------------------------------

  renderEventsTab() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = this.communityEvents.filter(e => e.status === 'published' && e.event_date >= today);
    const past = this.communityEvents.filter(e => e.status === 'published' && e.event_date < today);
    const cancelled = this.communityEvents.filter(e => e.status === 'cancelled');

    const rows = this.communityEvents.length === 0
      ? emptyRow(6, 'No community events posted yet.')
      : this.communityEvents.map(e => `
          <tr>
            <td style="font-weight: 500;">
              ${esc(e.title)}
              <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
                ${esc(e.venue || 'No venue')}${e.entry_fee ? ' · ' + fmtMoney(e.entry_fee) : ' · Free'}
              </span>
            </td>
            <td>${badge(e.category, 'muted')}</td>
            <td>
              ${esc(fmtDate(e.event_date))}
              ${e.start_time ? `<br><span class="text-3" style="font-size: 0.8rem;">${esc(fmtTime(e.start_time))}${e.end_time ? ' – ' + esc(fmtTime(e.end_time)) : ''}</span>` : ''}
            </td>
            <td>
              ${esc(e.poster_name)}
              <br><span class="text-3" style="font-size: 0.8rem;">${esc(e.poster_flat || '')} · ${esc(e.poster_role)}</span>
            </td>
            <td>${fmtNumber(e.contact_count)}</td>
            <td>
              ${statusBadge(e.status)}
              ${e.status === 'cancelled' && e.cancellation_note ? `<br><span class="text-3" style="font-size: 0.75rem;">${esc(e.cancellation_note)}</span>` : ''}
            </td>
          </tr>
        `).join('');

    return `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h2>🎪 Community Events</h2>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
              ${fmtNumber(upcoming.length)} upcoming · ${fmtNumber(past.length)} past · ${fmtNumber(cancelled.length)} cancelled
            </p>
          </div>
          <span class="badge-pill badge-active">
            ${fmtNumber(this.eventOrganizers.length)} ${pluralize(this.eventOrganizers.length, 'coordinator')}
          </span>
        </div>

        <div class="table-container" style="max-height: 420px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Event</th><th>Category</th><th>When</th><th>Posted by</th><th>Contacts</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      ${this.renderCoordinatorsPanel()}
    `;
  },

  // Event wiring --------------------------------------------------------------

  // One delegated listener per panel render, keyed on data-action. Replaces the
  // inline onclick="…('${value}')" handlers, which broke on any name with an
  // apostrophe.
  bindTabListeners() {
    const panel = document.getElementById('community-tab-panel');
    if (!panel) return;

    panel.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = el.getAttribute('data-action');
        const id = el.getAttribute('data-id');
        const fund = el.getAttribute('data-fund');

        // Row-level actions must not also trigger the row's own click.
        if (el.tagName === 'BUTTON' || el.classList.contains('chip-remove')) {
          e.stopPropagation();
        }

        switch (action) {
          case 'demote-lead': return this.demoteLead(id);
          case 'appoint-lead': return this.appointLead(el.getAttribute('data-role'));
          case 'grant-coordinator': return this.grantCoordinator();
          case 'revoke-coordinator': return this.revokeCoordinator(id);
          case 'archive-block': return this.archiveBlock(id);
          case 'set-block-label': return this.setBlockLabel(el.getAttribute('data-label'));
          case 'add-block': return this.addBlock();
          case 'add-flats': return this.addFlats();
          case 'archive-flat': return this.archiveFlat(id);
          case 'set-treasurer': return this.setFundTreasurer(fund);
          case 'add-collector': return this.addCollector(fund);
          case 'remove-collector': return this.removeCollector(fund, id);
          case 'view-resident': return this.viewResidentDetails(id);
          case 'remove-resident': return this.confirmRemoveResident(id);
          case 'delete-resident': return this.confirmDeleteUserAccount(id);
          case 'view-fund': return this.viewFundDetails(id);
          case 'food-view':
            this.commerceView.food = el.getAttribute('data-view');
            return this.renderTabPanelOnly();
          case 'business-view':
            this.commerceView.business = el.getAttribute('data-view');
            return this.renderTabPanelOnly();
          case 'open-providers':
            window.location.hash = '#providers?communityId=' + this.selectedCommunityId;
            return;
        }
      });
    });

    const revokeBtn = document.getElementById('revoke-funds-btn');
    if (revokeBtn) revokeBtn.addEventListener('click', () => this.openRevocationModal());

    const blocksToggle = document.getElementById('blocks-enabled-toggle');
    if (blocksToggle) {
      blocksToggle.addEventListener('change', async (e) => {
        try {
          const { error } = await supabase.rpc('platform_set_blocks_enabled', {
            p_community_id: this.community.id,
            p_enabled: e.target.checked
          });
          if (error) throw error;
          await this.reload();
        } catch (err) {
          console.error(err);
          alert('Failed to update blocks: ' + err.message);
          e.target.checked = !e.target.checked;
        }
      });
    }

    // Re-renders only the table body, so the caret stays in the search box.
    const search = document.getElementById('residents-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        this.residentSearch = search.value;
        const tbody = document.getElementById('residents-tbody');
        if (tbody) {
          tbody.innerHTML = this.renderResidentRows();
          this.bindResidentRowListeners();
        }
      }, 150));
    }
  },

  bindResidentRowListeners() {
    const tbody = document.getElementById('residents-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = el.getAttribute('data-action');
        const id = el.getAttribute('data-id');
        if (el.tagName === 'BUTTON') e.stopPropagation();
        if (action === 'view-resident') return this.viewResidentDetails(id);
        if (action === 'remove-resident') return this.confirmRemoveResident(id);
        if (action === 'delete-resident') return this.confirmDeleteUserAccount(id);
      });
    });
  },

  async reload() {
    await this.loadCommunityDetail(this.selectedCommunityId);
  },

  // Actions -------------------------------------------------------------------

  async runAction(fn, failureMessage) {
    try {
      const { error } = await fn();
      if (error) throw error;
      await this.reload();
      return true;
    } catch (err) {
      console.error(failureMessage, err);
      alert(failureMessage + ': ' + err.message);
      return false;
    }
  },

  async setBlockLabel(label) {
    await this.runAction(
      () => supabase.rpc('platform_set_block_label', {
        p_community_id: this.selectedCommunityId,
        p_label: label
      }),
      'Failed to update label'
    );
  },

  async addBlock() {
    const input = document.getElementById('new-block-name');
    const name = input.value.trim();
    if (!name) return;

    const ok = await this.runAction(
      () => supabase.rpc('platform_add_community_block', {
        p_community_id: this.selectedCommunityId,
        p_name: name
      }),
      'Failed to add ' + this.community.block_label.toLowerCase()
    );
    if (ok) input.value = '';
  },

  async archiveBlock(blockId) {
    if (!confirm('Archive this ' + this.community.block_label.toLowerCase() + '?')) return;
    await this.runAction(
      () => supabase.rpc('platform_archive_community_block', { p_block_id: blockId }),
      'Failed to archive'
    );
  },

  async addFlats() {
    const blockId = document.getElementById('add-flats-block-select').value;
    const input = document.getElementById('add-flats-input');
    const raw = input.value.trim();

    if (!blockId) return alert('Please select a ' + this.community.block_label.toLowerCase() + '.');
    if (!raw) return alert('Please enter at least one flat number.');

    const flatNumbers = raw.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (flatNumbers.length === 0) return;

    try {
      // p_community_id has no default on the RPC — omitting it made PostgREST
      // fail to resolve the function, so adding flats never worked at all.
      const { data, error } = await supabase.rpc('platform_add_community_flats', {
        p_community_id: this.selectedCommunityId,
        p_block_id: blockId,
        p_flat_numbers: flatNumbers
      });
      if (error) throw error;

      alert('Added ' + (data != null ? data : flatNumbers.length) + ' flat(s).');
      input.value = '';
      await this.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to add flats: ' + err.message);
    }
  },

  async archiveFlat(flatId) {
    if (!confirm('Archive this flat?\nResidents assigned to it will be disconnected.')) return;
    await this.runAction(
      () => supabase.rpc('platform_archive_community_flat', { p_flat_id: flatId }),
      'Failed to archive flat'
    );
  },

  async appointLead(role) {
    const residentId = document.getElementById('lead-appoint-resident').value;
    if (!residentId) return alert('Please select a resident to appoint.');

    await this.runAction(
      () => supabase.rpc('platform_set_community_lead', {
        p_community_id: this.selectedCommunityId,
        p_target_user_id: residentId,
        p_role: role
      }),
      'Failed to appoint lead'
    );
  },

  async demoteLead(residentId) {
    if (this.activeLeads().length <= 1) {
      return alert('Cannot remove the only community lead. Appoint a replacement first.');
    }
    if (!confirm('Remove lead role from this user?')) return;

    await this.runAction(
      () => supabase.rpc('platform_remove_community_lead', { p_target_user_id: residentId }),
      'Failed to remove lead'
    );
  },

  async grantCoordinator() {
    const residentId = document.getElementById('coordinator-select').value;
    if (!residentId) return alert('Please select a resident to appoint as events coordinator.');

    await this.runAction(
      () => supabase.rpc('platform_set_event_organizer', {
        p_community_id: this.selectedCommunityId,
        p_target_user_id: residentId
      }),
      'Failed to appoint events coordinator'
    );
  },

  async revokeCoordinator(userId) {
    if (!confirm('Revoke the events coordinator grant from this resident?\nEvents they already posted stay published.')) return;

    await this.runAction(
      () => supabase.rpc('platform_remove_event_organizer', {
        p_community_id: this.selectedCommunityId,
        p_target_user_id: userId
      }),
      'Failed to revoke events coordinator'
    );
  },

  async setFundTreasurer(eventId) {
    const residentId = document.getElementById('treasurer-select-' + eventId).value;
    if (!residentId) return alert('Please select a resident to assign as treasurer.');

    await this.runAction(
      () => supabase.rpc('platform_set_fund_treasurer', {
        p_event_id: eventId,
        p_target_user_id: residentId
      }),
      'Failed to set treasurer'
    );
  },

  async addCollector(eventId) {
    const residentId = document.getElementById('collector-select-' + eventId).value;
    if (!residentId) return alert('Please select a resident to add as collector.');

    const blockSelect = document.getElementById('collector-block-' + eventId);
    const blockId = blockSelect ? (blockSelect.value || null) : null;

    await this.runAction(
      () => supabase.rpc('platform_assign_block_in_charge', {
        p_event_id: eventId,
        p_user_id: residentId,
        p_block_id: blockId
      }),
      'Failed to add collector'
    );
  },

  async removeCollector(eventId, userId) {
    if (!confirm('Remove this collector?')) return;
    await this.runAction(
      () => supabase.rpc('platform_remove_block_in_charge', {
        p_event_id: eventId,
        p_user_id: userId
      }),
      'Failed to remove collector'
    );
  },

  async confirmRemoveResident(residentId) {
    const resident = this.residents.find(r => r.id === residentId);
    if (!resident) return;

    const isLead = resident.app_role === 'president' || resident.app_role === 'vice_president';
    if (isLead && this.activeLeads().length <= 1) {
      return alert('Cannot remove the last community lead. Appoint a replacement first.');
    }

    if (!confirm(`Remove ${resident.full_name || 'this resident'} from the community?\n\nThey will be dissociated from the community, flat and block so they can join fresh.`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc('set_audit_actor', { p_actor_id: user.id });

      const { error } = await supabase.rpc('platform_remove_resident_from_community', {
        p_target_profile_id: residentId,
        p_reason: 'Platform admin removed resident from community'
      });
      if (error) throw error;

      alert('Resident removed from community.');
      await this.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to remove resident: ' + err.message);
    }
  },

  async confirmDeleteUserAccount(residentId) {
    const resident = this.residents.find(r => r.id === residentId);
    if (!resident) return;

    const isLead = resident.app_role === 'president' || resident.app_role === 'vice_president';
    if (isLead && this.activeLeads().length <= 1) {
      return alert('Cannot delete the only community lead. Reassign the role first.');
    }

    if (!confirm(`PERMANENT ACTION\n\nPermanently delete the account for ${resident.full_name || 'this resident'} (${resident.email || resident.phone_number || 'no contact'})?\n\nThis deletes their login credentials, profile and all account data.`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc('set_audit_actor', { p_actor_id: user.id });

      const { error } = await supabase.rpc('platform_delete_user', {
        p_target_user_id: residentId,
        p_reason: 'Platform admin hard deleted user account'
      });
      if (error) throw error;

      alert('User account deleted permanently.');
      await this.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to delete user account: ' + err.message);
    }
  },

  // Revocation modal ----------------------------------------------------------

  openRevocationModal() {
    document.getElementById('revoke-reason-input').value = '';
    document.getElementById('revoke-modal').classList.remove('hidden');
  },

  closeRevocationModal() {
    document.getElementById('revoke-modal').classList.add('hidden');
  },

  async submitRevocation() {
    const reason = document.getElementById('revoke-reason-input').value.trim();
    if (!reason) return alert('Reason is required.');

    try {
      const { error } = await supabase.rpc('platform_revoke_funds_access', {
        p_community_id: this.selectedCommunityId,
        p_revoke_reason: reason
      });
      if (error) throw error;

      alert('Funds access revoked.');
      this.closeRevocationModal();
      await this.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to revoke funds access: ' + err.message);
    }
  },

  goBack() {
    this.selectedCommunityId = null;
    this.activeTab = 'overview';
    window.location.hash = '#communities';
  },

  // Resident modal ------------------------------------------------------------

  async viewResidentDetails(profileId) {
    const modal = document.getElementById('resident-modal');
    const title = document.getElementById('resident-modal-title');
    const body = document.getElementById('resident-modal-body');
    const footer = document.getElementById('resident-modal-footer');

    body.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading resident profile...</p></div>';
    modal.classList.remove('hidden');

    try {
      const { data, error } = await supabase.rpc('platform_get_resident_details', {
        p_profile_id: profileId
      });
      if (error) throw error;
      if (!data) {
        body.innerHTML = errorBanner('Resident profile not found.', 'this resident');
        return;
      }

      const isCoordinator = this.eventOrganizers.some(o => o.user_id === data.id);
      const hosted = this.preorderHosts.find(h => h.host_id === data.id);
      const owned = this.businessOwners.find(o => o.owner_id === data.id);
      const eventsPosted = this.communityEvents.filter(e => e.poster_id === data.id).length;

      title.textContent = data.full_name || 'Resident Profile';

      body.innerHTML = `
        <div class="stack-lg">
          <div class="row-between" style="border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <div>
              <h4 style="margin: 0; font-size: 1.1rem; color: var(--primary);">${esc(data.full_name || 'Resident')}</h4>
              <span class="text-3" style="font-size: 0.85rem;">${esc(roleLabel(data.app_role))}${isCoordinator ? ' · Events coordinator' : ''}</span>
            </div>
            ${data.removed_at ? badge('Removed from community', 'rejected') : badge('Active member', 'approved')}
          </div>

          <div class="kv-grid">
            <div><strong>Email</strong><br><span class="text-2">${esc(data.email || 'N/A')}</span></div>
            <div><strong>Phone</strong><br><span class="text-2">${esc(data.phone_number || 'N/A')}</span></div>
            <div><strong>Flat</strong><br><span class="text-2">${esc(data.flat_number || 'N/A')}</span></div>
            <div><strong>Community</strong><br><span class="text-2">${esc(data.community_name || 'N/A')}</span></div>
            <div style="grid-column: span 2;"><strong>Joined</strong> ${esc(fmtDate(data.created_at))}</div>
          </div>

          <div>
            <h5 class="panel-subhead">Community Activity</h5>
            <div class="mini-metrics compact">
              ${this.miniMetric('Menus published', fmtNumber(hosted ? hosted.drops_total : 0), hosted ? fmtMoney(hosted.revenue_total) + ' earned' : 'No menus')}
              ${this.miniMetric('Businesses listed', fmtNumber(owned ? owned.listings_total : 0), owned ? fmtNumber(owned.products_total) + ' products' : 'No listings')}
              ${this.miniMetric('Events posted', fmtNumber(eventsPosted), isCoordinator ? 'Holds the grant' : 'No grant')}
              ${this.miniMetric('Visits created', fmtNumber(data.visits_count), 'Service visits')}
            </div>
          </div>
        </div>
      `;

      footer.innerHTML = '';

      if (!data.removed_at) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-secondary danger-text';
        removeBtn.style.marginRight = '8px';
        removeBtn.textContent = 'Remove from Community';
        removeBtn.addEventListener('click', () => {
          this.closeResidentModal();
          this.confirmRemoveResident(data.id);
        });
        footer.appendChild(removeBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.style.marginRight = 'auto';
      deleteBtn.textContent = 'Delete User Account';
      deleteBtn.addEventListener('click', () => {
        this.closeResidentModal();
        this.confirmDeleteUserAccount(data.id);
      });
      footer.appendChild(deleteBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => this.closeResidentModal());
      footer.appendChild(closeBtn);
    } catch (err) {
      console.error('Error loading resident profile details:', err);
      body.innerHTML = errorBanner(err.message, 'this resident');
    }
  },

  closeResidentModal() {
    const modal = document.getElementById('resident-modal');
    if (modal) modal.classList.add('hidden');
  },

  // Fund modal ----------------------------------------------------------------

  async viewFundDetails(fundId) {
    const modal = document.getElementById('fund-modal');
    const title = document.getElementById('fund-modal-title');
    const body = document.getElementById('fund-modal-body');
    const footer = document.getElementById('fund-modal-footer');

    body.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading fund ledger...</p></div>';
    modal.classList.remove('hidden');

    const fund = this.communityFunds.find(f => f.id === fundId);
    if (!fund) {
      body.innerHTML = errorBanner('Fund not found.', 'this fund');
      return;
    }
    title.textContent = fund.title;

    try {
      const [ledgerRes, coverageRes] = await Promise.all([
        supabase.rpc('platform_get_fund_ledger', { p_event_id: fundId }),
        supabase.rpc('platform_get_fund_collection_coverage', { p_event_id: fundId })
      ]);

      const ledger = unwrap(ledgerRes, 'fund ledger');
      const coverage = unwrap(coverageRes, 'collection coverage');

      const treasurers = (fund.treasurers || []).length > 0
        ? (fund.treasurers || []).map(t => `
            <div class="row-between compact">
              <strong style="font-size: 0.9rem;">${esc(t.full_name || 'Resident')}</strong>
              <span class="text-3" style="font-size: 0.8rem;">${esc(t.email || '')}</span>
            </div>
          `).join('')
        : '<div class="text-3 mini-row">No treasurer assigned.</div>';

      const collectors = (fund.collectors || []).length > 0
        ? (fund.collectors || []).map(c => `
            <div class="row-between compact">
              <div>
                <strong style="font-size: 0.9rem;">${esc(c.full_name || 'Resident')}</strong>
                <div class="text-3" style="font-size: 0.75rem;">${esc(c.email || '')}</div>
              </div>
              ${badge(c.block_name ? 'Block ' + c.block_name : 'All blocks', 'muted')}
            </div>
          `).join('')
        : '<div class="text-3 mini-row">No block collectors assigned.</div>';

      const totalResidents = coverage.reduce((s, r) => s + Number(r.residents || 0), 0);
      const totalContributors = coverage.reduce((s, r) => s + Number(r.contributors || 0), 0);
      const coveragePct = totalResidents > 0 ? Math.round((totalContributors / totalResidents) * 100) : 0;

      const coverageHtml = coverage.length === 0
        ? emptyState('No residents on record.')
        : coverage.map(r => {
            const pct = Number(r.residents) > 0
              ? Math.round((Number(r.contributors) / Number(r.residents)) * 100) : 0;
            return `
              <div class="coverage-row">
                <div class="row-between compact">
                  <strong style="font-size: 0.85rem;">${esc(r.block_name)}</strong>
                  <span class="text-3" style="font-size: 0.8rem;">
                    ${fmtNumber(r.contributors)}/${fmtNumber(r.residents)} paid · ${fmtMoney(r.collected)}
                  </span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width: ${pct}%"></div></div>
              </div>
            `;
          }).join('');

      const kindLabel = {
        resident_contribution: 'Resident',
        sponsor_contribution: 'Sponsor',
        other_income: 'Income',
        expense: 'Expense'
      };

      const ledgerHtml = ledger.length === 0
        ? emptyRow(5, 'No transactions recorded yet.')
        : ledger.map(t => {
            const who = t.entry_kind === 'resident_contribution'
              ? esc(t.contributor_name || 'Resident') + (t.contributor_flat ? ' (' + esc(t.contributor_flat) + ')' : '')
              : t.entry_kind === 'sponsor_contribution'
                ? esc(t.sponsor_name || 'Sponsor')
                : esc(t.title || t.category || '—');
            return `
              <tr>
                <td class="text-3" style="font-size: 0.8rem;">${esc(fmtDate(t.created_at))}</td>
                <td>${badge(kindLabel[t.entry_kind] || t.entry_kind, t.type === 'expense' ? 'rejected' : 'approved')}</td>
                <td style="font-size: 0.85rem;">${who}</td>
                <td style="font-weight: 600; color: ${t.type === 'expense' ? 'var(--danger)' : 'var(--accent)'};">
                  ${t.type === 'expense' ? '−' : '+'} ${fmtMoney(t.amount)}
                </td>
                <td style="font-size: 0.85rem;">${fmtMoney(t.running_balance)}</td>
              </tr>
            `;
          }).join('');

      body.innerHTML = `
        <div class="stack-lg">
          <div class="row-between" style="border-bottom: 1px solid var(--border); padding-bottom: 14px;">
            <div style="flex: 1; padding-right: 12px;">
              <h4 style="margin: 0; font-size: 1.15rem; color: var(--primary);">${esc(fund.title)}</h4>
              <p class="text-2" style="margin: 6px 0 0 0; font-size: 0.85rem;">${esc(fund.description || 'Transparent community fund.')}</p>
            </div>
            ${fund.is_closed ? badge('Closed', 'rejected') : badge('Open / Active', 'approved')}
          </div>

          <div class="mini-metrics compact">
            ${this.miniMetric('Collected', fmtMoney(fund.income), '')}
            ${this.miniMetric('Spent', fmtMoney(fund.expense), '')}
            ${this.miniMetric('Balance', fmtMoney(fund.balance), '')}
            ${this.miniMetric('Coverage', coveragePct + '%', fmtNumber(totalContributors) + ' of ' + fmtNumber(totalResidents) + ' residents')}
          </div>

          <div>
            <h5 class="panel-subhead">Collection Coverage</h5>
            <div class="scroll-box" style="max-height: 160px;">${coverageHtml}</div>
          </div>

          <div class="two-col">
            <div>
              <h5 class="panel-subhead">Treasurer</h5>
              <div class="scroll-box" style="max-height: 120px;">${treasurers}</div>
            </div>
            <div>
              <h5 class="panel-subhead">Block Collectors</h5>
              <div class="scroll-box" style="max-height: 120px;">${collectors}</div>
            </div>
          </div>

          <div>
            <div class="row-between" style="margin-bottom: 8px;">
              <h5 class="panel-subhead" style="margin: 0;">Full Ledger</h5>
              <button class="btn btn-secondary btn-sm" id="export-ledger-btn">Export CSV</button>
            </div>
            <div class="table-container" style="max-height: 240px; overflow-y: auto;">
              <table>
                <thead><tr><th>Date</th><th>Kind</th><th>Who / What</th><th>Amount</th><th>Balance</th></tr></thead>
                <tbody>${ledgerHtml}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const exportLedger = document.getElementById('export-ledger-btn');
      if (exportLedger) {
        exportLedger.addEventListener('click', () => {
          exportCsv('fund-' + fund.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-ledger.csv', [
            { label: 'Date', value: r => r.created_at },
            { label: 'Kind', key: 'entry_kind' },
            { label: 'Type', key: 'type' },
            { label: 'Category', key: 'category' },
            { label: 'Title', key: 'title' },
            { label: 'Contributor', key: 'contributor_name' },
            { label: 'Flat', key: 'contributor_flat' },
            { label: 'Block', key: 'contributor_block' },
            { label: 'Sponsor', key: 'sponsor_name' },
            { label: 'Amount', key: 'amount' },
            { label: 'Running balance', key: 'running_balance' },
            { label: 'Recorded by', key: 'recorded_by_name' }
          ], ledger);
        });
      }

      footer.innerHTML = '';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => this.closeFundModal());
      footer.appendChild(closeBtn);
    } catch (err) {
      console.error('Error loading fund details:', err);
      body.innerHTML = errorBanner(err.message, 'this fund');
    }
  },

  closeFundModal() {
    const modal = document.getElementById('fund-modal');
    if (modal) modal.classList.add('hidden');
  },

  // Export --------------------------------------------------------------------

  exportActiveTab() {
    const slug = (this.community.name || 'community').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    if (this.activeTab === 'commerce') {
      if (this.commerceView.food === 'hosts') {
        return exportCsv(slug + '-food-hosts.csv', [
          { label: 'Host', key: 'host_name' },
          { label: 'Flat', key: 'host_flat' },
          { label: 'Email', key: 'host_email' },
          { label: 'Menus', key: 'drops_total' },
          { label: 'Open drops', key: 'drops_open' },
          { label: 'Orders', key: 'orders_total' },
          { label: 'Distinct buyers', key: 'distinct_buyers' },
          { label: 'Avg order value', key: 'avg_order_value' },
          { label: 'Revenue', key: 'revenue_total' }
        ], this.preorderHosts);
      }
      if (this.commerceView.business === 'owners') {
        return exportCsv(slug + '-business-owners.csv', [
          { label: 'Owner', key: 'owner_name' },
          { label: 'Flat', key: 'owner_flat' },
          { label: 'Email', key: 'owner_email' },
          { label: 'Listings', key: 'listings_total' },
          { label: 'Active listings', key: 'listings_active' },
          { label: 'Products', key: 'products_total' },
          { label: 'Categories', key: 'categories' },
          { label: 'Avg rating', key: 'avg_rating' },
          { label: 'Ratings', key: 'rating_count' },
          { label: 'Flagged', key: 'flagged_count' }
        ], this.businessOwners);
      }
      return exportCsv(slug + '-food-drops.csv', [
        { label: 'Drop', key: 'title' },
        { label: 'Host', key: 'creator_name' },
        { label: 'Host flat', key: 'creator_flat' },
        { label: 'Fulfillment date', key: 'fulfillment_date' },
        { label: 'Status', key: 'status' },
        { label: 'Orders', key: 'orders_count' },
        { label: 'Revenue', key: 'total_revenue' }
      ], this.communityPreorders);
    }

    if (this.activeTab === 'events') {
      return exportCsv(slug + '-events.csv', [
        { label: 'Title', key: 'title' },
        { label: 'Category', key: 'category' },
        { label: 'Date', key: 'event_date' },
        { label: 'Venue', key: 'venue' },
        { label: 'Entry fee', key: 'entry_fee' },
        { label: 'Status', key: 'status' },
        { label: 'Posted by', key: 'poster_name' },
        { label: 'Poster role', key: 'poster_role' },
        { label: 'Contacts', key: 'contact_count' }
      ], this.communityEvents);
    }

    if (this.activeTab === 'funds') {
      return exportCsv(slug + '-funds.csv', [
        { label: 'Fund', key: 'title' },
        { label: 'Collected', key: 'income' },
        { label: 'Spent', key: 'expense' },
        { label: 'Balance', key: 'balance' },
        { label: 'Closed', value: f => (f.is_closed ? 'yes' : 'no') },
        { label: 'Treasurers', value: f => (f.treasurers || []).map(t => t.full_name).join('; ') },
        { label: 'Collectors', value: f => (f.collectors || []).map(c => c.full_name).join('; ') }
      ], this.communityFunds);
    }

    return exportCsv(slug + '-residents.csv', [
      { label: 'Name', key: 'full_name' },
      { label: 'Email', key: 'email' },
      { label: 'Phone', key: 'phone_number' },
      { label: 'Flat', key: 'flat_number' },
      { label: 'Role', value: r => roleLabel(r.app_role) },
      { label: 'Joined', key: 'created_at' },
      { label: 'Removed at', key: 'removed_at' }
    ], this.residents);
  }
};

window.CommunitiesPage = CommunitiesPage;
