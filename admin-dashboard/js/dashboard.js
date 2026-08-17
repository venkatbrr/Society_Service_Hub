// Dashboard Page Controller
//
// Reads only through platform_* SECURITY DEFINER RPCs. A platform admin has
// `community_id IS NULL` and therefore matches no community-scoped RLS policy,
// so a direct `supabase.from('<community table>')` read here returns `[]` with
// no error — which is how this page used to render a wall of plausible zeroes.
// See docs/platform-admin.md §1a.

const DashboardPage = {
  communities: [],
  selectedCommunityId: null,   // null === every community
  overviewRows: [],
  overviewSort: { key: 'name', direction: 'asc' },
  dropdownBound: false,

  async load() {
    const pageEl = document.getElementById('dashboard-page');
    if (!pageEl) return;

    const selector = document.getElementById('dashboard-community-select');
    if (this.communities.length === 0) {
      await this.loadCommunitiesDropdown(selector);
    }

    // The dropdown's first option is the "ALL" sentinel. It must be translated
    // to NULL before it reaches an RPC — passing the literal string 'ALL' as a
    // uuid made every query fail, and the swallowed errors read as zeroes.
    if (selector) {
      selector.value = this.selectedCommunityId || 'ALL';
    }

    this.bindStaticListeners();
    await this.loadMetrics(this.selectedCommunityId);
  },

  bindStaticListeners() {
    if (this.staticBound) return;
    this.staticBound = true;

    document.querySelectorAll('#dashboard-content .metric-card[data-card]').forEach(card => {
      card.addEventListener('click', () => this.onCardClick(card.getAttribute('data-card')));
    });

    const exportBtn = document.getElementById('export-communities-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCommunities());
    }

    document.querySelectorAll('#communities-overview-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        const dir = this.overviewSort.key === key && this.overviewSort.direction === 'asc' ? 'desc' : 'asc';
        this.overviewSort = { key: key, direction: dir };
        this.renderCommunitiesOverview();
      });
    });
  },

  async loadCommunitiesDropdown(selector) {
    if (!selector) return;
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name')
        .order('name');

      if (error) throw error;

      this.communities = data || [];
      selector.innerHTML = '';

      const allOption = document.createElement('option');
      allOption.value = 'ALL';
      allOption.textContent = '🌐 All Communities (Platform Overview)';
      selector.appendChild(allOption);

      this.communities.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        selector.appendChild(option);
      });

      if (!this.dropdownBound) {
        this.dropdownBound = true;
        selector.addEventListener('change', async (e) => {
          this.selectedCommunityId = normalizeCommunityId(e.target.value);
          await this.loadMetrics(this.selectedCommunityId);
        });
      }
    } catch (err) {
      console.error('Error loading communities for dashboard:', err);
      selector.innerHTML = '<option value="ALL">🌐 All Communities (Platform Overview)</option>';
    }
  },

  async loadMetrics(communityId) {
    const target = normalizeCommunityId(communityId);
    const loader = document.getElementById('dashboard-loading');
    const content = document.getElementById('dashboard-content');
    const errorEl = document.getElementById('dashboard-error');

    loader.classList.remove('hidden');
    content.classList.add('hidden');
    errorEl.innerHTML = '';

    try {
      // Every one of these is checked for `error`. Destructuring only `data`
      // turns an authorisation failure into a silently empty dashboard.
      const [summaryRes, categoryRes, trendRes, overviewRes] = await Promise.all([
        supabase.rpc('platform_get_community_dashboard_v3', { p_community_id: target }),
        supabase.rpc('platform_get_providers_by_category', { p_community_id: target }),
        supabase.rpc('platform_get_activity_trend', { p_community_id: target, p_days: 90 }),
        supabase.rpc('platform_get_communities_overview')
      ]);

      const summaryRows = unwrap(summaryRes, 'dashboard metrics');
      const categoryData = unwrap(categoryRes, 'providers by category');
      const trendData = unwrap(trendRes, 'activity trend');
      const overviewData = unwrap(overviewRes, 'communities overview');

      const s = summaryRows[0] || {};

      this.renderMetrics(s);
      Charts.renderCategoryChart('category-chart-canvas', categoryData);
      Charts.renderTrendChart('trend-chart-canvas', trendData);
      this.renderCategoryCards(categoryData);

      this.overviewRows = target
        ? overviewData.filter(r => r.id === target)
        : overviewData;
      this.renderCommunitiesOverview();

      loader.classList.add('hidden');
      content.classList.remove('hidden');
    } catch (err) {
      console.error('Error loading dashboard metrics:', err);
      loader.classList.add('hidden');
      content.classList.add('hidden');
      errorEl.innerHTML = errorBanner(err.message, err.context || 'dashboard metrics');
    }
  },

  renderMetrics(s) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    // No `|| total_residents` fallback here. If the activity signal is empty the
    // honest answer is 0, not the headcount dressed up as engagement.
    set('metric-dau', fmtNumber(s.dau_today) + ' DAU');
    set('metric-residents-sub',
      fmtNumber(s.total_residents) + ' ' + pluralize(s.total_residents, 'resident') +
      ' · ' + fmtNumber(s.wau_7d) + ' WAU · ' + fmtNumber(s.mau_30d) + ' MAU');

    set('metric-growth', '+' + fmtNumber(s.new_residents_30d));
    set('metric-growth-sub',
      'new residents in 30 days · ' + fmtNumber(s.total_communities) +
      ' ' + pluralize(s.total_communities, 'community', 'communities'));

    set('metric-food-revenue', fmtMoney(s.total_food_revenue));
    set('metric-food-sub',
      fmtNumber(s.total_food_drops) + ' drops (' + fmtNumber(s.active_food_drops) + ' open) · ' +
      fmtNumber(s.total_preorders) + ' pre-orders · ' +
      fmtNumber(s.distinct_food_hosts) + ' ' + pluralize(s.distinct_food_hosts, 'host'));

    set('metric-active-businesses', fmtNumber(s.active_businesses) + ' Active');
    set('metric-business-sub',
      fmtNumber(s.total_businesses) + ' listings · ' +
      fmtNumber(s.total_business_products) + ' products · ' +
      fmtNumber(s.distinct_business_owners) + ' ' + pluralize(s.distinct_business_owners, 'owner'));

    set('metric-providers', fmtNumber(s.total_providers));
    set('metric-providers-sub',
      Number(s.total_ratings) > 0
        ? '⭐ ' + Number(s.avg_provider_rating || 0).toFixed(1) + ' avg · ' +
          fmtNumber(s.total_ratings) + ' ' + pluralize(s.total_ratings, 'rating')
        : 'No ratings recorded yet');

    set('metric-events', fmtNumber(s.upcoming_events) + ' upcoming');
    set('metric-events-sub',
      fmtNumber(s.total_events) + ' total · ' +
      fmtNumber(s.total_event_organizers) + ' ' + pluralize(s.total_event_organizers, 'coordinator') +
      (Number(s.cancelled_events) > 0 ? ' · ' + fmtNumber(s.cancelled_events) + ' cancelled' : ''));

    set('metric-visits-planned', fmtNumber(s.visits_planned));
    set('metric-visits-done', fmtNumber(s.visits_completed));
    set('metric-past-visits', fmtNumber(s.visits_past_30d));

    set('metric-contacts', fmtNumber(s.total_hires));
    set('metric-contacts-sub', fmtNumber(s.hires_past_30d) + ' this month');

    set('metric-funds', fmtMoney(s.total_collected));
    set('metric-funds-sub',
      fmtMoney(s.total_spent) + ' spent across ' + fmtNumber(s.total_funds) +
      ' ' + pluralize(s.total_funds, 'fund') + ' · ' +
      fmtNumber(s.contributing_residents) + ' contributors');
  },

  renderCommunitiesOverview() {
    const tbody = document.getElementById('communities-overview-tbody');
    if (!tbody) return;

    if (!this.overviewRows || this.overviewRows.length === 0) {
      tbody.innerHTML = emptyRow(10, 'No communities yet.');
      return;
    }

    const rows = sortRows(this.overviewRows, this.overviewSort.key, this.overviewSort.direction);

    tbody.innerHTML = rows.map(r => `
      <tr class="clickable-row" data-id="${escAttr(r.id)}">
        <td style="font-weight: 500;">
          ${esc(r.name)}
          <br><span class="text-3" style="font-size: 0.8rem; font-weight: normal;">
            ${esc(r.code)} · ${esc(r.city || 'N/A')}
            ${r.funds_enabled ? ' · funds on' : ''}
          </span>
        </td>
        <td>${fmtNumber(r.members)}<span class="text-3" style="font-size: 0.78rem;"> (${fmtNumber(r.leads)} lead${Number(r.leads) === 1 ? '' : 's'})</span></td>
        <td>${fmtNumber(r.mau_30d)}</td>
        <td>${fmtNumber(r.providers)}</td>
        <td>${fmtNumber(r.drops)}<span class="text-3" style="font-size: 0.78rem;"> / ${fmtNumber(r.orders)}</span></td>
        <td>${fmtMoney(r.food_revenue)}</td>
        <td>${fmtNumber(r.listings)}</td>
        <td>${fmtMoney(r.balance)}<span class="text-3" style="font-size: 0.78rem;"> (${fmtNumber(r.funds)})</span></td>
        <td>${fmtNumber(r.events)}<span class="text-3" style="font-size: 0.78rem;"> · ${fmtNumber(r.organizers)} coord</span></td>
        <td class="text-3">${esc(fmtRelative(r.last_activity_at))}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr.clickable-row').forEach(tr => {
      tr.addEventListener('click', () => {
        window.location.hash = '#communities?id=' + tr.getAttribute('data-id');
      });
    });

    document.querySelectorAll('#communities-overview-table thead th[data-sort]').forEach(th => {
      const key = th.getAttribute('data-sort');
      th.classList.toggle('sorted-asc', this.overviewSort.key === key && this.overviewSort.direction === 'asc');
      th.classList.toggle('sorted-desc', this.overviewSort.key === key && this.overviewSort.direction === 'desc');
    });
  },

  exportCommunities() {
    exportCsv('wooru-communities-' + new Date().toISOString().slice(0, 10) + '.csv', [
      { label: 'Community', key: 'name' },
      { label: 'Code', key: 'code' },
      { label: 'City', key: 'city' },
      { label: 'Area', key: 'area' },
      { label: 'Pincode', key: 'pincode' },
      { label: 'Members', key: 'members' },
      { label: 'Leads', key: 'leads' },
      { label: 'New members (30d)', key: 'new_members_30d' },
      { label: 'MAU (30d)', key: 'mau_30d' },
      { label: 'Providers', key: 'providers' },
      { label: 'Menus', key: 'drops' },
      { label: 'Pre-orders', key: 'orders' },
      { label: 'Food revenue', key: 'food_revenue' },
      { label: 'Business listings', key: 'listings' },
      { label: 'Funds', key: 'funds' },
      { label: 'Collected', key: 'collected' },
      { label: 'Spent', key: 'spent' },
      { label: 'Balance', key: 'balance' },
      { label: 'Community events', key: 'events' },
      { label: 'Events coordinators', key: 'organizers' },
      { label: 'Funds enabled', value: r => (r.funds_enabled ? 'yes' : 'no') },
      { label: 'Last activity', value: r => (r.last_activity_at || '') }
    ], this.overviewRows);
  },

  renderCategoryCards(categories) {
    const listEl = document.getElementById('category-details-list');
    listEl.innerHTML = '';

    if (!categories || categories.length === 0) {
      listEl.innerHTML = emptyState('No service providers registered in this scope.');
      return;
    }

    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'category-item';

      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = `
        <span>${esc(cat.category)}</span>
        <span class="badge">${fmtNumber(cat.provider_count)} ${pluralize(cat.provider_count, 'provider')}</span>
      `;

      const body = document.createElement('div');
      body.className = 'category-body';

      const topProviders = cat.top_providers || [];
      if (topProviders.length === 0) {
        body.innerHTML = '<p class="text-3" style="font-size: 0.85rem;">No ratings recorded.</p>';
      } else {
        topProviders.forEach(p => {
          const row = document.createElement('div');
          row.className = 'top-provider-row';
          row.innerHTML = `
            <div class="provider-info">
              <span class="provider-name">${esc(p.name)}</span>
              <span class="provider-hires-count">${fmtNumber(p.total_hires)} hire contacts</span>
            </div>
            <div class="provider-rating">⭐ ${Number(p.avg_rating || 0).toFixed(1)}</div>
          `;
          body.appendChild(row);
        });
      }

      item.appendChild(header);
      item.appendChild(body);
      listEl.appendChild(item);

      header.addEventListener('click', () => body.classList.toggle('hidden'));
    });
  },

  onCardClick(cardType) {
    const id = this.selectedCommunityId;

    if (cardType === 'providers') {
      window.location.hash = id ? `#providers?communityId=${id}` : '#providers';
      return;
    }

    // Every other card drills into a community tab. Without a community
    // selected there is nothing specific to drill into, so land on the list.
    if (!id) {
      window.location.hash = '#communities';
      return;
    }

    const tabByCard = {
      residents: 'people',
      food: 'commerce',
      business: 'commerce',
      events: 'events',
      funds: 'funds'
    };
    const tab = tabByCard[cardType] || 'overview';
    window.location.hash = `#communities?id=${id}&tab=${tab}`;
  }
};

window.DashboardPage = DashboardPage;
