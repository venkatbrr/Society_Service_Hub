// Communities Page Controller
const CommunitiesPage = {
  communities: [],
  selectedCommunityId: null,
  residents: [],
  communityBlocks: [],
  communityFunds: [],
  searchTerm: '',

  // Active resident and lead count helpers
  getCommunityCounts(communityId) {
    const active = this.residents.filter(r => r.community_id === communityId && !r.removed_at).length;
    const leads = this.residents.filter(r => r.community_id === communityId && !r.removed_at && (r.app_role === 'president' || r.app_role === 'vice_president')).length;
    return { active, leads };
  },

  async load() {
    const listContainer = document.getElementById('communities-list-view');
    const detailContainer = document.getElementById('communities-detail-view');
    const loadingEl = document.getElementById('communities-loading');

    loadingEl.classList.remove('hidden');

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

  async loadCommunitiesList() {
    const loadingEl = document.getElementById('communities-loading');
    const grid = document.getElementById('communities-grid');
    grid.innerHTML = '';

    try {
      // Fetch all communities
      const { data: communityRows, error } = await supabase
        .from('communities')
        .select('*')
        .order('name');

      if (error) throw error;
      this.communities = communityRows || [];

      // Fetch active profiles globally to compute counts
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('community_id, app_role, removed_at')
        .is('removed_at', null);

      if (profileError) throw profileError;

      // Group profiles by community
      const countsMap = {};
      this.communities.forEach(c => { countsMap[c.id] = { active: 0, leads: 0 }; });

      (profileRows || []).forEach(p => {
        if (p.community_id && countsMap[p.community_id]) {
          countsMap[p.community_id].active++;
          if (p.app_role === 'president' || p.app_role === 'vice_president') {
            countsMap[p.community_id].leads++;
          }
        }
      });

      this.renderCommunitiesGrid(countsMap);
    } catch (err) {
      console.error('Error loading communities list:', err);
      grid.innerHTML = '<div class="alert alert-danger">Failed to load communities.</div>';
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  renderCommunitiesGrid(countsMap) {
    const grid = document.getElementById('communities-grid');
    grid.innerHTML = '';

    const searchInput = document.getElementById('communities-search').value.toLowerCase().trim();
    const filtered = this.communities.filter(c => {
      const name = (c.name || '').toLowerCase();
      const city = (c.city || '').toLowerCase();
      const pincode = (c.pincode || '').toLowerCase();
      const area = (c.area || '').toLowerCase();
      return name.includes(searchInput) || city.includes(searchInput) || pincode.includes(searchInput) || area.includes(searchInput);
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="text-3" style="grid-column: 1/-1; padding: 24px; text-align: center;">No communities found.</div>';
      return;
    }

    filtered.forEach(c => {
      const counts = countsMap[c.id] || { active: 0, leads: 0 };
      const card = document.createElement('div');
      card.className = 'metric-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="metric-header">
          <span>${c.community_type || 'Residential'}</span>
          <span style="font-size: 0.8rem; color: var(--accent); font-weight: 500;">CODE: ${c.code}</span>
        </div>
        <div class="metric-value" style="font-size: 1.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">
          ${c.name}
        </div>
        <div class="metric-subtitle">
          ${c.area ? c.area + ', ' : ''}${c.city || 'N/A'}<br>
          <span style="display: inline-block; margin-top: 8px; font-weight: 500; color: var(--text-2);">
            👥 ${counts.active} members &nbsp;&nbsp; 🔑 ${counts.leads} lead${counts.leads !== 1 ? 's' : ''}
          </span>
        </div>
      `;
      card.addEventListener('click', () => {
        this.selectedCommunityId = c.id;
        this.load();
      });
      grid.appendChild(card);
    });
  },

  async loadCommunityDetail(communityId) {
    const loadingEl = document.getElementById('communities-loading');
    const infoContainer = document.getElementById('community-detail-info');

    try {
      // 1. Fetch community details & residents
      const { data: community, error: communityError } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .maybeSingle();

      if (communityError) throw communityError;
      if (!community) {
        alert('Community not found');
        this.selectedCommunityId = null;
        this.load();
        return;
      }

      const { data: residentsData, error: residentsError } = await supabase
        .from('profiles')
        .select('id, full_name, email, flat_number, phone_number, app_role, removed_at, created_at, community_id')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });

      if (residentsError) throw residentsError;
      this.residents = residentsData || [];

      // 2. Fetch community blocks if enabled
      if (community.blocks_enabled) {
        const { data: blocksData, error: blocksError } = await supabase.rpc('list_community_blocks', { p_community_id: communityId });
        if (blocksError) throw blocksError;
        this.communityBlocks = blocksData || [];
      } else {
        this.communityBlocks = [];
      }

      // 3. Fetch community funds via platform admin RPC. Each fund row
      // already carries its own treasurers[] and collectors[] (fund-scoped),
      // so no separate fund_roles query is needed.
      // (This is a cross-community read that RLS blocks for direct table
      // queries, since fund_roles/events are scoped to community members
      // only. The RPC is SECURITY DEFINER and gated on is_platform_admin.)
      if (community.funds_enabled) {
        const { data: fundsData, error: fundsError } = await supabase.rpc('platform_get_community_funds', { p_community_id: communityId });
        if (fundsError) throw fundsError;
        this.communityFunds = fundsData || [];
      } else {
        this.communityFunds = [];
      }

      // 4. Fetch Pre-Order Food Drops & Statistics via platform admin RPC.
      // (Direct mcn_preorder_orders reads are RLS-scoped to the buyer or
      // drop host, so a platform admin querying the table directly always
      // sees zero orders/revenue.)
      const { data: dropsData, error: dropsError } = await supabase.rpc('platform_get_community_preorders', { p_community_id: communityId });
      if (dropsError) throw dropsError;

      this.communityPreorders = (dropsData || []).map(d => ({
        drop_id: d.drop_id,
        title: d.title,
        description: d.description,
        fulfillment_date: d.fulfillment_date,
        fulfillment_time: d.fulfillment_time,
        cutoff_at: d.cutoff_at,
        status: d.status,
        creator_name: d.creator_name || 'Resident Host',
        creator_flat: d.creator_flat || '',
        orders_count: Number(d.orders_count || 0),
        total_revenue: Number(d.total_revenue || 0),
        image_url: d.image_url,
        created_at: d.created_at
      }));

      // 5. Fetch Business Listings & Statistics via platform admin RPC.
      // (mcn_listings is RLS-scoped to community members, so a direct
      // table query returns nothing for a platform admin.)
      const { data: bizData, error: bizError } = await supabase.rpc('platform_get_community_businesses', { p_community_id: communityId });
      if (bizError) throw bizError;

      this.communityBusinesses = (bizData || []).map(b => ({
        listing_id: b.listing_id,
        name: b.name,
        description: b.description,
        category_name: b.category_name || 'General',
        category_emoji: b.category_emoji || '🏪',
        owner_name: b.owner_name || 'Resident Owner',
        owner_flat: b.owner_flat || '',
        contact_phone: b.contact_phone,
        is_active: b.is_active,
        product_count: Number(b.product_count || 0),
        avg_rating: Number(b.avg_rating || 0),
        rating_count: Number(b.rating_count || 0),
        image_url: b.image_url,
        created_at: b.created_at
      }));

      this.renderCommunityDetailView(community);
    } catch (err) {
      console.error('Error loading community details:', err);
      alert('Error loading community: ' + err.message);
      this.selectedCommunityId = null;
      this.load();
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  renderCommunityDetailView(community) {
    const container = document.getElementById('community-detail-info');
    
    // Filter active residents and active leads
    const activeResidents = this.residents.filter(r => !r.removed_at);
    const activeLeads = activeResidents.filter(r => r.app_role === 'president' || r.app_role === 'vice_president');
    const nonLeadResidents = activeResidents.filter(r => r.app_role === 'resident');

    // Build Leads list display
    let leadsHtml = '';
    if (activeLeads.length > 0) {
      activeLeads.forEach(l => {
        const displayRole = l.app_role === 'president' ? 'President' : l.app_role === 'vice_president' ? 'Vice President' : 'Community Lead';
        leadsHtml += `
          <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${l.full_name || 'Resident'}</strong> (${displayRole})<br>
              <span class="text-3" style="font-size: 0.85rem;">${l.email || 'No email'}</span>
            </div>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="CommunitiesPage.demoteLead('${l.id}')">Demote</button>
          </div>
        `;
      });
    } else {
      leadsHtml = '<p class="text-3">No leads assigned to this community.</p>';
    }

    // Build Appoint Leads Options (residents who can be appointed)
    let leadAppointSelectOptions = '<option value="">Select Resident...</option>';
    nonLeadResidents.forEach(r => {
      leadAppointSelectOptions += `<option value="${r.id}">${r.full_name || 'Resident'} (${r.flat_number || 'No flat'})</option>`;
    });

    // Build block list rows
    let blocksHtml = '';
    if (community.blocks_enabled) {
      if (this.communityBlocks.length > 0) {
        this.communityBlocks.forEach(b => {
          blocksHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
              <span style="font-weight: 500;">${b.name}</span>
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; color: var(--danger);" onclick="CommunitiesPage.archiveBlock('${b.id}')">Archive</button>
            </div>
          `;
        });
      } else {
        blocksHtml = '<p class="text-3">No blocks created yet.</p>';
      }
    }

    // Build fund roles list, grouped per fund: treasurer(s) + block collectors.
    let collectorsHtml = '';
    if (community.funds_enabled) {
      if (this.communityFunds.length > 0) {
        this.communityFunds.forEach(fund => {
          const treasurers = fund.treasurers || [];
          const collectors = fund.collectors || [];

          const treasurersHtml = treasurers.length > 0
            ? treasurers.map(t => `
                <div style="padding: 4px 0; font-size: 0.85rem;">
                  <strong>${t.full_name || 'Resident'}</strong>
                  <span class="text-3" style="font-size: 0.8rem;"> · ${t.email || 'No email'}</span>
                </div>
              `).join('')
            : '<div class="text-3" style="font-size: 0.85rem; padding: 4px 0;">No treasurer assigned.</div>';

          const currentTreasurerIds = new Set(treasurers.map(t => t.user_id));
          let treasurerReassignOptions = '<option value="">Select resident...</option>';
          nonLeadResidents
            .filter(r => !currentTreasurerIds.has(r.id))
            .forEach(r => {
              treasurerReassignOptions += `<option value="${r.id}">${r.full_name || 'Resident'} (${r.flat_number || 'No flat'})</option>`;
            });

          const collectorsListHtml = collectors.length > 0
            ? collectors.map(c => {
                const resident = this.residents.find(r => r.id === c.user_id);
                const residentFlat = resident?.flat_number ? ` (Flat ${resident.flat_number})` : '';
                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                    <div style="font-size: 0.85rem;">
                      <strong>${c.full_name || 'Resident'}${residentFlat}</strong>
                      <span class="text-3" style="font-size: 0.8rem;"> · Block: ${c.block_name || 'All Blocks'}</span>
                    </div>
                    <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.75rem; color: var(--danger);" onclick="CommunitiesPage.removeBlockInCharge('${fund.id}', '${c.user_id}')">Remove</button>
                  </div>
                `;
              }).join('')
            : '<div class="text-3" style="font-size: 0.85rem; padding: 4px 0;">No collectors assigned.</div>';

          collectorsHtml += `
            <div style="padding: 10px 0; border-bottom: 1px solid var(--border);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: var(--primary); font-size: 0.9rem;">${fund.title}</strong>
                ${fund.is_closed ? '<span class="badge-pill badge-rejected" style="font-size: 0.65rem; padding: 1px 6px;">Closed</span>' : '<span class="badge-pill badge-approved" style="font-size: 0.65rem; padding: 1px 6px;">Active</span>'}
              </div>
              <div class="text-3" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; margin-top: 4px;">Treasurer</div>
              ${treasurersHtml}
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <select class="form-control" id="treasurer-select-${fund.id}" style="font-size: 0.8rem; padding: 4px 6px; flex: 1;">
                  ${treasurerReassignOptions}
                </select>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="CommunitiesPage.setFundTreasurer('${fund.id}')">${treasurers.length > 0 ? 'Replace' : 'Assign'}</button>
              </div>
              <div class="text-3" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; margin-top: 6px;">Block Collectors</div>
              ${collectorsListHtml}
            </div>
          `;
        });
      } else {
        collectorsHtml = '<p class="text-3">No funds found.</p>';
      }
    }

    // Build active funds list display for platform admin
    let fundsHtml = '';
    if (community.funds_enabled) {
      if (this.communityFunds && this.communityFunds.length > 0) {
        this.communityFunds.forEach(fund => {
          const formattedBalance = Number(fund.balance || 0).toLocaleString('en-IN');
          fundsHtml += `
            <div class="fund-item-card" onclick="CommunitiesPage.viewFundDetails('${fund.id}')" style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <span style="font-weight: 600; font-size: 0.85rem; color: var(--primary); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;" title="${fund.title}">${fund.title}</span>
                ${fund.is_closed ? '<span class="badge-pill badge-rejected" style="font-size: 0.65rem; padding: 1px 6px;">Closed</span>' : '<span class="badge-pill badge-approved" style="font-size: 0.65rem; padding: 1px 6px;">Active</span>'}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; margin-top: 4px;">
                <span style="color: var(--text-3);">Balance:</span>
                <span style="font-weight: 600; color: var(--accent);">₹${formattedBalance}</span>
              </div>
            </div>
          `;
        });
      } else {
        fundsHtml = '<div style="font-size: 0.8rem; color: var(--text-3); text-align: center; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">No active funds found.</div>';
      }
    }

    // Build Pre-Order Food Drops HTML Table
    let preordersTableRows = '';
    const preordersList = this.communityPreorders || [];
    let totalFoodRev = 0;
    let totalFoodOrders = 0;
    let activeFoodDropsCount = 0;

    if (preordersList.length === 0) {
      preordersTableRows = '<tr><td colspan="5" class="text-3" style="text-align: center; padding: 16px;">No food drops created in this community yet.</td></tr>';
    } else {
      preordersList.forEach(drop => {
        const rev = Number(drop.total_revenue || 0);
        totalFoodRev += rev;
        const ords = Number(drop.orders_count || 0);
        totalFoodOrders += ords;
        if (drop.status === 'open') activeFoodDropsCount++;

        const statusBadge = drop.status === 'open' 
          ? '<span class="badge-pill badge-approved">Open</span>'
          : drop.status === 'completed'
          ? '<span class="badge-pill badge-active">Completed</span>'
          : drop.status === 'cancelled'
          ? '<span class="badge-pill badge-rejected">Cancelled</span>'
          : '<span class="badge-pill badge-muted">Closed</span>';

        const delivDate = drop.fulfillment_date ? new Date(drop.fulfillment_date).toLocaleDateString() : 'N/A';

        preordersTableRows += `
          <tr>
            <td style="font-weight: 500;">
              ${drop.title || 'Food Drop'}<br>
              <span class="text-3" style="font-size: 0.8rem; font-weight: normal;">Host: ${drop.creator_name || 'Resident'} (${drop.creator_flat || 'N/A'})</span>
            </td>
            <td>📅 ${delivDate}<br><span class="text-3" style="font-size: 0.8rem;">⏰ ${drop.fulfillment_time || 'N/A'}</span></td>
            <td>${statusBadge}</td>
            <td style="font-weight: 500;">${ords} orders</td>
            <td style="font-weight: 600; color: var(--primary);">₹${rev.toLocaleString('en-IN')}</td>
          </tr>
        `;
      });
    }

    // Build Community Businesses HTML Table
    let businessesTableRows = '';
    const businessesList = this.communityBusinesses || [];
    let activeBizCount = 0;

    if (businessesList.length === 0) {
      businessesTableRows = '<tr><td colspan="6" class="text-3" style="text-align: center; padding: 16px;">No resident business listings created in this community yet.</td></tr>';
    } else {
      businessesList.forEach(biz => {
        if (biz.is_active) activeBizCount++;

        const statusBadge = biz.is_active 
          ? '<span class="badge-pill badge-approved">Active</span>'
          : '<span class="badge-pill badge-rejected">Inactive</span>';

        const phoneClean = (biz.contact_phone || '').replace(/[^0-9]/g, '');
        const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;

        businessesTableRows += `
          <tr>
            <td style="font-weight: 500;">
              ${biz.category_emoji || '🏪'} ${biz.name || 'Business'}<br>
              <span class="text-3" style="font-size: 0.8rem; font-weight: normal;">Owner: ${biz.owner_name || 'Resident'} (${biz.owner_flat || 'N/A'})</span>
            </td>
            <td><span class="badge-pill badge-muted">${biz.category_name || 'General'}</span></td>
            <td>
              ${biz.contact_phone || 'N/A'}
              ${waLink ? `<a href="${waLink}" target="_blank" style="margin-left: 6px; text-decoration: none;" title="Chat on WhatsApp">💬</a>` : ''}
            </td>
            <td>${biz.product_count || 0}</td>
            <td>⭐ ${Number(biz.avg_rating || 0).toFixed(1)} (${biz.rating_count || 0})</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });
    }

    // Build residents list table rows
    let residentsTableRows = '';
    const searchInput = document.getElementById('residents-search')?.value.toLowerCase().trim() || '';
    const filteredResidents = this.residents.filter(r => {
      const name = (r.full_name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const phone = (r.phone_number || '').toLowerCase();
      const flat = (r.flat_number || '').toLowerCase();
      
      const matchesSearch = name.includes(searchInput) || email.includes(searchInput) || phone.includes(searchInput) || flat.includes(searchInput);
      return matchesSearch;
    });

    if (filteredResidents.length === 0) {
      residentsTableRows = '<tr><td colspan="5" class="text-3" style="text-align: center;">No residents found.</td></tr>';
    } else {
      filteredResidents.forEach(r => {
        const statusBadge = r.removed_at 
          ? '<span class="badge-pill badge-rejected">Removed</span>'
          : '<span class="badge-pill badge-approved">Active</span>';
          
        const roleDisplay = r.app_role === 'president' ? 'President'
          : r.app_role === 'vice_president' ? 'Vice President'
          : 'Resident';

        residentsTableRows += `
          <tr class="${r.removed_at ? 'rowRemoved' : ''}" style="cursor: pointer;" onclick="CommunitiesPage.viewResidentDetails('${r.id}')">
            <td style="font-weight: 500;">
              ${r.full_name || 'Resident'}<br>
              <span class="text-3" style="font-size: 0.8rem; font-weight: normal;">${r.email || 'No email'}</span>
            </td>
            <td>${r.flat_number || 'N/A'}</td>
            <td>${r.phone_number || 'N/A'}</td>
            <td>
              <span class="badge-pill ${r.app_role !== 'resident' ? 'badge-active' : 'badge-muted'}">
                ${roleDisplay}
              </span>
            </td>
            <td>
              ${!r.removed_at ? `<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="event.stopPropagation(); CommunitiesPage.confirmRemoveResident('${r.id}')">Remove</button>` : ''}
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="detail-layout">
        <!-- Sidebar Columns -->
        <div class="detail-sidebar">
          
          <!-- Community Info -->
          <div class="section-card" style="margin-bottom: 0;">
            <div class="section-card-header" style="margin-bottom: 12px;">
              <h2>${community.name}</h2>
              <span class="badge-pill badge-active">CODE: ${community.code}</span>
            </div>
            <p class="text-2" style="margin-bottom: 12px;">
              ${community.community_type || 'Residential'} community in ${community.city || 'N/A'}.
            </p>
            <div style="font-size: 0.85rem; line-height: 1.6; border-top: 1px solid var(--border); padding-top: 12px;">
              <strong>Area:</strong> ${community.area || 'N/A'}<br>
              <strong>Pincode:</strong> ${community.pincode || 'N/A'}<br>
              <strong>Created at:</strong> ${new Date(community.created_at).toLocaleDateString()}
            </div>
          </div>

          <!-- Community Leads -->
          <div class="section-card" style="margin-bottom: 0;">
            <h2>Community Leads</h2>
            <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              ${leadsHtml}
            </div>
          </div>

          <!-- Funds Activation -->
          <div class="section-card" style="margin-bottom: 0;">
            <h2>Funds Activation</h2>
            <div style="margin-top: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span>Status:</span>
                <span class="badge-pill ${community.funds_enabled ? 'badge-approved' : 'badge-rejected'}">
                  ${community.funds_enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              ${community.funds_enabled ? `
                <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
                  <h3 style="font-size: 0.9rem; margin-bottom: 12px; color: var(--primary); font-weight: 600;">Active Funds</h3>
                  <div style="display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; padding-right: 2px;">
                    ${fundsHtml}
                  </div>
                </div>
                <button class="btn btn-danger btn-block" style="font-size: 0.85rem; margin-top: 16px;" onclick="CommunitiesPage.openRevocationModal()">
                  Revoke Funds Access
                </button>
              ` : ''}
            </div>
          </div>

        </div>

        <!-- Main Column -->
        <div class="detail-main">
          
          <!-- Lead Management -->
          ${community.funds_enabled ? `
            <div class="section-card" style="margin-bottom: 0;">
              <h2>Community Lead Management</h2>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 12px;">Appoint active residents to roles.</p>
              
              <div class="form-row" style="grid-template-columns: 2fr 1fr; align-items: end;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label>Select Resident</label>
                  <select class="form-control" id="lead-appoint-resident">${leadAppointSelectOptions}</select>
                </div>
                <div class="form-group" style="margin-bottom: 0; display: flex; gap: 8px;">
                  <button class="btn btn-primary" style="padding: 10px 12px; font-size: 0.85rem;" onclick="CommunitiesPage.appointLead('president')">President</button>
                  <button class="btn btn-secondary" style="padding: 10px 12px; font-size: 0.85rem;" onclick="CommunitiesPage.appointLead('vice_president')">VP</button>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Block / Tower Management -->
          <div class="section-card" style="margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h2>Blocks / Towers</h2>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="text-2">Enabled:</span>
                <input type="checkbox" id="blocks-enabled-toggle" ${community.blocks_enabled ? 'checked' : ''} 
                       style="width: 18px; height: 18px; cursor: pointer;">
              </div>
            </div>

            ${community.blocks_enabled ? `
              <div style="margin-top: 16px;">
                <!-- Label Select buttons -->
                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                  <button class="btn ${community.block_label === 'Block' ? 'btn-primary' : 'btn-secondary'}" 
                          style="padding: 6px 12px; font-size: 0.8rem; border-radius: 20px;" 
                          onclick="CommunitiesPage.setBlockLabel('Block')">Block</button>
                  <button class="btn ${community.block_label === 'Tower' ? 'btn-primary' : 'btn-secondary'}" 
                          style="padding: 6px 12px; font-size: 0.8rem; border-radius: 20px;" 
                          onclick="CommunitiesPage.setBlockLabel('Tower')">Tower</button>
                </div>

                <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; background: var(--surface);">
                  ${blocksHtml}
                </div>

                <div style="display: flex; gap: 8px;">
                  <input type="text" class="form-control" id="new-block-name" placeholder="Add new ${community.block_label.toLowerCase()}...">
                  <button class="btn btn-primary" onclick="CommunitiesPage.addBlock()">Add</button>
                </div>
              </div>
            ` : `<p class="text-3">Turn on blocks/towers to manage collection scopes.</p>`}
          </div>

          <!-- Fund Roles (Treasurers & Block In-Charges), grouped per fund -->
          ${community.funds_enabled ? `
            <div class="section-card" style="margin-bottom: 0;">
              <h2>Fund Roles</h2>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 4px;">Treasurer and block in-charges (collectors) for each fund.</p>
              <div style="margin-top: 8px; max-height: 320px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; background: var(--surface);">
                ${collectorsHtml}
              </div>
            </div>
          ` : ''}

          <!-- Pre-Order Food Statistics Section Card -->
          <div class="section-card" style="margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <h2>🍲 Pre-Order Food Drops & Statistics</h2>
                <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
                  ${preordersList.length} total drops (${activeFoodDropsCount} open) · ${totalFoodOrders} pre-orders placed
                </p>
              </div>
              <span class="badge-pill badge-approved" style="font-size: 0.9rem; padding: 6px 12px; font-weight: 700;">
                ₹${totalFoodRev.toLocaleString('en-IN')} Sales
              </span>
            </div>

            <div class="table-container" style="max-height: 280px; overflow-y: auto;">
              <table>
                <thead>
                  <tr>
                    <th>Drop Title & Host</th>
                    <th>Fulfillment Date</th>
                    <th>Status</th>
                    <th>Orders</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  ${preordersTableRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Community Businesses Available Section Card -->
          <div class="section-card" style="margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <h2>🏪 Businesses Available in Community</h2>
                <p class="text-3" style="font-size: 0.8rem; margin-top: 2px;">
                  ${businessesList.length} total resident businesses listed (${activeBizCount} active)
                </p>
              </div>
              <span class="badge-pill badge-active" style="font-size: 0.85rem; padding: 4px 10px;">
                ${activeBizCount} / ${businessesList.length} Active
              </span>
            </div>

            <div class="table-container" style="max-height: 280px; overflow-y: auto;">
              <table>
                <thead>
                  <tr>
                    <th>Business Name & Owner</th>
                    <th>Category</th>
                    <th>Contact Phone</th>
                    <th>Products</th>
                    <th>Rating</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${businessesTableRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Residents Directory -->
          <div class="section-card" style="margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2>Residents Directory</h2>
              <input type="text" class="form-control" id="residents-search" placeholder="Search residents..." 
                     style="max-width: 260px;" value="${searchInput}">
            </div>
            
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th>Flat</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${residentsTableRows}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    `;

    // Bind Search Input Listener
    const searchBar = document.getElementById('residents-search');
    if (searchBar) {
      searchBar.addEventListener('input', () => {
        this.renderCommunityDetailView(community);
      });
    }

    // Bind Blocks Enable Switch Listener
    const blocksToggle = document.getElementById('blocks-enabled-toggle');
    if (blocksToggle) {
      blocksToggle.addEventListener('change', async (e) => {
        try {
          const { error } = await supabase.rpc('platform_set_blocks_enabled', {
            p_community_id: community.id,
            p_enabled: e.target.checked
          });
          if (error) throw error;
          await this.load();
        } catch (err) {
          console.error(err);
          alert('Failed to update blocks: ' + err.message);
          e.target.checked = !e.target.checked;
        }
      });
    }
  },

  async setBlockLabel(label) {
    try {
      const { error } = await supabase.rpc('platform_set_block_label', {
        p_community_id: this.selectedCommunityId,
        p_label: label
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to update block label: ' + err.message);
    }
  },

  async addBlock() {
    const input = document.getElementById('new-block-name');
    const name = input.value.trim();
    if (!name) return;

    try {
      const { error } = await supabase.rpc('platform_add_community_block', {
        p_community_id: this.selectedCommunityId,
        p_name: name
      });
      if (error) throw error;
      
      input.value = '';
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to add block: ' + err.message);
    }
  },

  async archiveBlock(blockId) {
    if (!confirm('Are you sure you want to archive this block?')) return;

    try {
      const { error } = await supabase.rpc('platform_archive_community_block', {
        p_block_id: blockId
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to archive block: ' + err.message);
    }
  },

  async appointLead(role) {
    const residentSelect = document.getElementById('lead-appoint-resident');
    const residentId = residentSelect.value;
    if (!residentId) {
      alert('Please select a resident to appoint');
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_set_community_lead', {
        p_community_id: this.selectedCommunityId,
        p_target_user_id: residentId,
        p_role: role
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to appoint lead: ' + err.message);
    }
  },

  async demoteLead(residentId) {
    const activeLeads = this.residents.filter(r => !r.removed_at && (r.app_role === 'president' || r.app_role === 'vice_president'));
    if (activeLeads.length <= 1) {
      alert('Cannot remove the only community lead in this community.');
      return;
    }

    if (!confirm('Are you sure you want to remove lead roles from this user?')) return;

    try {
      const { error } = await supabase.rpc('platform_remove_community_lead', {
        p_target_user_id: residentId
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to remove lead: ' + err.message);
    }
  },

  async removeBlockInCharge(eventId, userId) {
    if (!confirm('Are you sure you want to remove this collector?')) return;

    try {
      const { error } = await supabase.rpc('platform_remove_block_in_charge', {
        p_event_id: eventId,
        p_user_id: userId
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to remove collector: ' + err.message);
    }
  },

  async setFundTreasurer(eventId) {
    const select = document.getElementById(`treasurer-select-${eventId}`);
    const residentId = select?.value;
    if (!residentId) {
      alert('Please select a resident to assign as treasurer');
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_set_fund_treasurer', {
        p_event_id: eventId,
        p_target_user_id: residentId
      });
      if (error) throw error;
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to set treasurer: ' + err.message);
    }
  },

  async confirmRemoveResident(residentId) {
    const resident = this.residents.find(r => r.id === residentId);
    if (!resident) return;

    const leadCount = this.residents.filter(r => !r.removed_at && (r.app_role === 'president' || r.app_role === 'vice_president')).length;
    const isLead = resident.app_role === 'president' || resident.app_role === 'vice_president';
    
    if (isLead && leadCount <= 1) {
      alert('Cannot remove the last community lead from the community.');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${resident.full_name || 'Resident'} from the community?\nThis will soft-remove the resident, reset their role to resident, and log the action.`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc('set_audit_actor', { p_actor_id: user.id });

      const { error } = await supabase.rpc('platform_soft_remove_resident', {
        p_target_profile_id: residentId,
        p_reason: 'Platform admin removal'
      });

      if (error) throw error;
      alert('Resident removed successfully.');
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to remove resident: ' + err.message);
    }
  },

  openRevocationModal() {
    document.getElementById('revoke-reason-input').value = '';
    document.getElementById('revoke-modal').classList.remove('hidden');
  },

  closeRevocationModal() {
    document.getElementById('revoke-modal').classList.add('hidden');
  },

  async submitRevocation() {
    const reason = document.getElementById('revoke-reason-input').value.trim();
    if (!reason) {
      alert('Reason is required');
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_revoke_funds_access', {
        p_community_id: this.selectedCommunityId,
        p_revoke_reason: reason
      });

      if (error) throw error;

      alert('Funds access revoked.');
      this.closeRevocationModal();
      await this.load();
    } catch (err) {
      console.error(err);
      alert('Failed to revoke funds access: ' + err.message);
    }
  },

  goBack() {
    this.selectedCommunityId = null;
    this.load();
  },

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
        body.innerHTML = '<div class="alert alert-danger">Resident profile not found.</div>';
        return;
      }

      title.textContent = data.full_name || 'Resident Profile';

      const roleDisplay = data.app_role === 'president' ? 'President'
        : data.app_role === 'vice_president' ? 'Vice President'
        : 'Resident';

      const statusHtml = data.removed_at 
        ? '<span class="badge-pill badge-rejected">Removed from Community</span>'
        : '<span class="badge-pill badge-approved">Active Member</span>';

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <div>
              <h4 style="margin: 0; font-size: 1.1rem; color: var(--primary);">${data.full_name || 'Resident'}</h4>
              <span class="text-3" style="font-size: 0.85rem;">Role: ${roleDisplay}</span>
            </div>
            <div>
              ${statusHtml}
            </div>
          </div>

          <div style="font-size: 0.9rem; line-height: 1.6; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <strong>Email:</strong><br>
              <span class="text-2">${data.email || 'N/A'}</span>
            </div>
            <div>
              <strong>Phone:</strong><br>
              <span class="text-2">${data.phone_number || 'N/A'}</span>
            </div>
            <div>
              <strong>Flat Number:</strong><br>
              <span class="text-2">${data.flat_number || 'N/A'}</span>
            </div>
            <div>
              <strong>Community:</strong><br>
              <span class="text-2">${data.community_name || 'N/A'}</span>
            </div>
            <div style="grid-column: span 2;">
              <strong>Joined:</strong> ${new Date(data.created_at).toLocaleDateString()}
            </div>
          </div>

          <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px;">
            <h5 style="margin: 0 0 10px 0; color: var(--primary); font-size: 0.95rem;">Community Activity</h5>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
              <div style="background: var(--surface); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: var(--primary);">${data.orders_count || 0}</div>
                <div style="font-size: 0.75rem; color: var(--text-3);">Orders</div>
              </div>
              <div style="background: var(--surface); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: var(--primary);">${data.posts_count || 0}</div>
                <div style="font-size: 0.75rem; color: var(--text-3);">Posts</div>
              </div>
              <div style="background: var(--surface); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: var(--primary);">${data.visits_count || 0}</div>
                <div style="font-size: 0.75rem; color: var(--text-3);">Visits</div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Set up modal footer actions
      if (!data.removed_at) {
        footer.innerHTML = `
          <button class="btn btn-danger" style="margin-right: auto;" onclick="CommunitiesPage.confirmRemoveFromModal('${data.id}', '${data.full_name}')">Remove Resident</button>
          <button class="btn btn-secondary" onclick="CommunitiesPage.closeResidentModal()">Close</button>
        `;
      } else {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="CommunitiesPage.closeResidentModal()">Close</button>
        `;
      }
    } catch (err) {
      console.error('Error loading resident profile details:', err);
      body.innerHTML = '<div class="alert alert-danger">Failed to load profile details.</div>';
    }
  },

  closeResidentModal() {
    const modal = document.getElementById('resident-modal');
    if (modal) modal.classList.add('hidden');
  },

  async confirmRemoveFromModal(profileId, fullName) {
    this.closeResidentModal();
    await this.confirmRemoveResident(profileId);
  },

  async viewFundDetails(fundId) {
    const modal = document.getElementById('fund-modal');
    const title = document.getElementById('fund-modal-title');
    const body = document.getElementById('fund-modal-body');
    const footer = document.getElementById('fund-modal-footer');

    body.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading fund details...</p></div>';
    modal.classList.remove('hidden');

    try {
      const fund = this.communityFunds.find(f => f.id === fundId);
      if (!fund) {
        body.innerHTML = '<div class="alert alert-danger">Fund not found.</div>';
        return;
      }

      title.textContent = fund.title;

      const statusHtml = fund.is_closed 
        ? '<span class="badge-pill badge-rejected">Closed</span>'
        : '<span class="badge-pill badge-approved">Open / Active</span>';

      // Format Treasurers List
      let treasurersHtml = '';
      if (fund.treasurers && fund.treasurers.length > 0) {
        fund.treasurers.forEach(t => {
          treasurersHtml += `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 500; font-size: 0.9rem; color: var(--text-1);">${t.full_name || 'Resident'}</span>
              <span class="text-3" style="font-size: 0.8rem; color: var(--text-3);">${t.email || ''}</span>
            </div>
          `;
        });
      } else {
        treasurersHtml = '<div style="font-size: 0.85rem; color: var(--text-3); padding: 8px 0;">No treasurers assigned.</div>';
      }

      // Format Collectors List
      let collectorsHtml = '';
      if (fund.collectors && fund.collectors.length > 0) {
        fund.collectors.forEach(c => {
          const blockLabel = c.block_name ? `Scope: Block ${c.block_name}` : 'Scope: All blocks';
          collectorsHtml += `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-weight: 500; font-size: 0.9rem; color: var(--text-1);">${c.full_name || 'Resident'}</span>
                <div class="text-3" style="font-size: 0.75rem; color: var(--text-3);">${c.email || ''}</div>
              </div>
              <span class="badge-pill badge-muted" style="font-size: 0.75rem; padding: 2px 8px;">${blockLabel}</span>
            </div>
          `;
        });
      } else {
        collectorsHtml = '<div style="font-size: 0.85rem; color: var(--text-3); padding: 8px 0;">No block in-charges assigned.</div>';
      }

      // Format Contributions List
      let contributionsHtml = '';
      if (fund.contributions && fund.contributions.length > 0) {
        fund.contributions.forEach(c => {
          const formattedAmount = Number(c.amount || 0).toLocaleString('en-IN');
          const flatDisplay = c.contributor_flat ? ` (Flat ${c.contributor_flat})` : '';
          const dateLabel = new Date(c.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
          contributionsHtml += `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-weight: 500; font-size: 0.9rem; color: var(--text-1);">${c.contributor_name || 'Resident'}${flatDisplay}</span>
                <div class="text-3" style="font-size: 0.75rem; color: var(--text-3);">${dateLabel}</div>
              </div>
              <span style="font-weight: 600; font-size: 0.9rem; color: var(--accent);">+ ₹${formattedAmount}</span>
            </div>
          `;
        });
      } else {
        contributionsHtml = '<div style="font-size: 0.85rem; color: var(--text-3); padding: 8px 0;">No contributions logged yet.</div>';
      }

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Status and Description -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 14px;">
            <div style="flex: 1; padding-right: 12px;">
              <h4 style="margin: 0; font-size: 1.15rem; color: var(--primary); font-weight: 600;">${fund.title}</h4>
              <p class="text-3" style="margin: 6px 0 0 0; font-size: 0.85rem; color: var(--text-2); line-height: 1.4;">${fund.description || 'Transparent community fund.'}</p>
            </div>
            <div style="flex-shrink: 0;">
              ${statusHtml}
            </div>
          </div>

          <!-- Financial Summary Cards -->
          <div>
            <h5 style="margin: 0 0 10px 0; color: var(--primary); font-size: 0.95rem; font-weight: 500;">Financial Summary</h5>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
              <div style="background: var(--surface); padding: 12px 8px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 0.7rem; color: var(--text-3); text-transform: uppercase; font-weight: 500; margin-bottom: 4px; letter-spacing: 0.02em;">Collected</div>
                <div style="font-size: 1.15rem; font-weight: 600; color: var(--accent);">₹${Number(fund.income || 0).toLocaleString('en-IN')}</div>
              </div>
              <div style="background: var(--surface); padding: 12px 8px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 0.7rem; color: var(--text-3); text-transform: uppercase; font-weight: 500; margin-bottom: 4px; letter-spacing: 0.02em;">Spent</div>
                <div style="font-size: 1.15rem; font-weight: 600; color: var(--text-2);">₹${Number(fund.expense || 0).toLocaleString('en-IN')}</div>
              </div>
              <div style="background: var(--surface); padding: 12px 8px; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 0.7rem; color: var(--text-3); text-transform: uppercase; font-weight: 500; margin-bottom: 4px; letter-spacing: 0.02em;">Balance</div>
                <div style="font-size: 1.15rem; font-weight: 600; color: var(--primary);">₹${Number(fund.balance || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>

          <!-- Treasurers Section -->
          <div>
            <h5 style="margin: 0 0 8px 0; color: var(--primary); font-size: 0.95rem; font-weight: 500;">Treasurers</h5>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 4px 16px;">
              ${treasurersHtml}
            </div>
          </div>

          <!-- Collectors / Block In-Charges Section -->
          <div>
            <h5 style="margin: 0 0 8px 0; color: var(--primary); font-size: 0.95rem; font-weight: 500;">Block In-Charges (Collectors)</h5>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 4px 16px; max-height: 180px; overflow-y: auto;">
              ${collectorsHtml}
            </div>
          </div>

          <!-- Contributions Section -->
          <div>
            <h5 style="margin: 0 0 8px 0; color: var(--primary); font-size: 0.95rem; font-weight: 500;">Contributions</h5>
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 4px 16px; max-height: 200px; overflow-y: auto;">
              ${contributionsHtml}
            </div>
          </div>

        </div>
      `;

      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="CommunitiesPage.closeFundModal()">Close</button>
      `;

    } catch (err) {
      console.error('Error rendering fund details:', err);
      body.innerHTML = '<div class="alert alert-danger">Failed to display fund details.</div>';
    }
  },

  closeFundModal() {
    const modal = document.getElementById('fund-modal');
    if (modal) modal.classList.add('hidden');
  }
};

window.CommunitiesPage = CommunitiesPage;
