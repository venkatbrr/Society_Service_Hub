// Dashboard Page Controller
const DashboardPage = {
  communities: [],
  selectedCommunityId: null,
  
  async load() {
    const pageEl = document.getElementById('dashboard-page');
    if (!pageEl) return;
    
    // Check if dropdown already has options loaded
    const selector = document.getElementById('dashboard-community-select');
    if (this.communities.length === 0) {
      await this.loadCommunitiesDropdown(selector);
    }
    
    if (this.selectedCommunityId) {
      selector.value = this.selectedCommunityId;
      await this.loadMetrics(this.selectedCommunityId);
    } else if (selector.value) {
      this.selectedCommunityId = selector.value;
      await this.loadMetrics(this.selectedCommunityId);
    } else {
      this.showEmptyState();
    }
  },

  async loadCommunitiesDropdown(selector) {
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
      
      selector.addEventListener('change', async (e) => {
        const val = e.target.value;
        this.selectedCommunityId = val === 'ALL' ? null : val;
        await this.loadMetrics(this.selectedCommunityId);
      });
    } catch (err) {
      console.error('Error loading communities for dashboard:', err);
      selector.innerHTML = '<option value="ALL">🌐 All Communities (Platform Overview)</option>';
    }
  },

  async loadMetrics(communityId) {
    const targetParam = communityId || null;
    const loader = document.getElementById('dashboard-loading');
    const content = document.getElementById('dashboard-content');
    
    loader.classList.remove('hidden');
    content.classList.add('hidden');
    
    try {
      // 1. Fetch dashboard metric summary row
      let summary = {};
      const { data: v2Data, error: v2Error } = await supabase
        .rpc('platform_get_community_dashboard_v2', { p_community_id: targetParam });
        
      if (!v2Error && v2Data && v2Data[0]) {
        summary = v2Data[0];
      } else {
        const { data: summaryData } = await supabase
          .rpc('platform_get_community_dashboard', { p_community_id: targetParam });
        summary = summaryData && summaryData[0] ? summaryData[0] : {};
      }

      // 2. Fetch providers by category
      const { data: categoryData } = await supabase
        .rpc('platform_get_providers_by_category', { p_community_id: targetParam });

      // Direct fallback queries for food drops, preorders, and business listings if v2 RPC isn't deployed remotely
      let foodDropsCount = summary.total_food_drops || 0;
      let preordersCount = summary.total_preorders || 0;
      let foodRevenue = parseFloat(summary.total_food_revenue || 0);
      let activeBizCount = summary.active_businesses || 0;
      let totalBizCount = summary.total_businesses || 0;
      let totalProductsCount = summary.total_business_products || 0;

      if (!summary.total_food_drops) {
        let dropsQuery = supabase.from('mcn_preorder_drops').select('id', { count: 'exact' });
        let ordersQuery = supabase.from('mcn_preorder_orders').select('id, total_amount, status');
        let bizQuery = supabase.from('mcn_listings').select('id, is_active');
        let prodQuery = supabase.from('mcn_products').select('id');

        if (targetParam) {
          dropsQuery = dropsQuery.eq('community_id', targetParam);
          ordersQuery = ordersQuery.eq('community_id', targetParam);
          bizQuery = bizQuery.eq('community_id', targetParam);
        }

        const [
          { count: dropsCnt },
          { data: ordersList },
          { data: bizList },
          { count: prodCnt }
        ] = await Promise.all([
          dropsQuery,
          ordersQuery,
          bizQuery,
          prodQuery
        ]);

        foodDropsCount = dropsCnt || 0;
        const validOrders = (ordersList || []).filter(o => o.status !== 'cancelled');
        preordersCount = validOrders.length;
        foodRevenue = validOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        totalBizCount = (bizList || []).length;
        activeBizCount = (bizList || []).filter(b => b.is_active).length;
        totalProductsCount = prodCnt || 0;
      }

      const dau = summary.dau_today || summary.total_residents || 0;
      const mau = summary.mau_30d || summary.total_residents || 0;

      document.getElementById('metric-dau').textContent = `${dau} DAU`;
      document.getElementById('metric-residents').textContent = summary.total_residents || '0';
      document.getElementById('metric-mau').textContent = String(mau);

      document.getElementById('metric-food-revenue').textContent = `₹${foodRevenue.toLocaleString('en-IN')}`;
      document.getElementById('metric-food-sub').textContent = `${foodDropsCount} drops · ${preordersCount} pre-orders`;

      document.getElementById('metric-active-businesses').textContent = `${activeBizCount} Active`;
      document.getElementById('metric-business-sub').textContent = `${totalBizCount} listings · ${totalProductsCount} products`;

      document.getElementById('metric-providers').textContent = summary.total_providers || '0';
      document.getElementById('metric-visits-planned').textContent = summary.visits_planned || '0';
      document.getElementById('metric-visits-done').textContent = summary.visits_completed || '0';
      document.getElementById('metric-past-visits').textContent = summary.visits_past_30d || '0';
      
      document.getElementById('metric-contacts').textContent = summary.total_hires || '0';
      document.getElementById('metric-contacts-sub').textContent = `${summary.hires_past_30d || 0} this month`;
      
      // Collected and spent funds
      const collected = parseFloat(summary.total_collected || 0);
      const spent = parseFloat(summary.total_spent || 0);
      document.getElementById('metric-funds').textContent = `₹${collected.toLocaleString('en-IN')}`;
      document.getElementById('metric-funds-sub').textContent = `₹${spent.toLocaleString('en-IN')} spent across ${summary.total_funds || 0} funds`;
      
      // Render the Category horizontal bar chart
      Charts.renderCategoryChart('category-chart-canvas', categoryData || []);
      
      // Render the category list cards
      this.renderCategoryCards(categoryData || []);
      
      loader.classList.add('hidden');
      content.classList.remove('hidden');
    } catch (err) {
      console.error('Error loading dashboard metrics:', err);
      loader.classList.add('hidden');
      alert('Failed to load dashboard metrics. See console for details.');
    }
  },

  renderCategoryCards(categories) {
    const listEl = document.getElementById('category-details-list');
    listEl.innerHTML = '';
    
    if (!categories || categories.length === 0) {
      listEl.innerHTML = '<p class="text-3">No service providers registered in this community.</p>';
      return;
    }
    
    categories.forEach((cat, idx) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      
      // Header (click to expand)
      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = `
        <span>${cat.category}</span>
        <span class="badge">${cat.provider_count} provider${cat.provider_count > 1 ? 's' : ''}</span>
      `;
      
      // Body (initially visible since it is premium, or toggleable)
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
              <span class="provider-name">${p.name}</span>
              <span class="provider-hires-count">${p.total_hires || 0} hire contacts</span>
            </div>
            <div class="provider-rating">
              ⭐ ${parseFloat(p.avg_rating || 0).toFixed(1)}
            </div>
          `;
          body.appendChild(row);
        });
      }
      
      item.appendChild(header);
      item.appendChild(body);
      listEl.appendChild(item);
      
      // Toggle collapse/expand
      header.addEventListener('click', () => {
        body.classList.toggle('hidden');
      });
    });
  },

  showEmptyState() {
    document.getElementById('dashboard-loading').classList.add('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
    alert('Please select a community to view metrics.');
  },

  onCardClick(cardType) {
    if (cardType === 'residents') {
      if (this.selectedCommunityId) {
        window.location.hash = `#communities?id=${this.selectedCommunityId}`;
      } else {
        window.location.hash = '#communities';
      }
    } else if (cardType === 'providers') {
      if (this.selectedCommunityId) {
        window.location.hash = `#providers?communityId=${this.selectedCommunityId}`;
      } else {
        window.location.hash = '#providers';
      }
    } else if (cardType === 'funds') {
      if (this.selectedCommunityId) {
        window.location.hash = `#communities?id=${this.selectedCommunityId}`;
      } else {
        window.location.hash = '#funds-requests';
      }
    }
  }
};

window.DashboardPage = DashboardPage;
