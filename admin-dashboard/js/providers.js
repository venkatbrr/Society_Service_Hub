// Providers Page Controller
//
// `esc` and the other helpers come from utils.js, which index.html loads first.

const ProvidersPage = {
  communities: [],
  selectedCommunityId: null,
  selectedProviderId: null,
  searchBound: false,

  async load() {
    const listContainer = document.getElementById('providers-list-view');
    const detailContainer = document.getElementById('providers-detail-view');
    const loadingEl = document.getElementById('providers-loading');

    loadingEl.classList.remove('hidden');

    // Load communities filter dropdown once
    const filterSelect = document.getElementById('providers-community-filter');
    if (this.communities.length === 0) {
      await this.loadCommunitiesFilter(filterSelect);
    }
    this.bindSearch();

    if (this.selectedProviderId) {
      listContainer.classList.add('hidden');
      detailContainer.classList.remove('hidden');
      await this.loadProviderDetail(this.selectedProviderId);
    } else {
      listContainer.classList.remove('hidden');
      detailContainer.classList.add('hidden');
      await this.loadProvidersList();
    }
  },

  // The search box had no listener at all — typing in it did nothing.
  bindSearch() {
    if (this.searchBound) return;
    const input = document.getElementById('providers-search');
    if (!input) return;
    this.searchBound = true;
    input.addEventListener('input', debounce(() => this.loadProvidersList(), 250));
  },

  async loadCommunitiesFilter(selector) {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name')
        .order('name');
        
      if (error) throw error;
      this.communities = data || [];
      
      selector.innerHTML = '<option value="">All Communities</option>';
      this.communities.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        selector.appendChild(option);
      });

      // Bind listener
      selector.addEventListener('change', (e) => {
        this.selectedCommunityId = e.target.value;
        this.loadProvidersList();
      });
    } catch (err) {
      console.error('Error loading communities filter:', err);
    }
  },

  async loadProvidersList() {
    const loadingEl = document.getElementById('providers-loading');
    const tbody = document.getElementById('providers-tbody');
    tbody.innerHTML = '';

    const filterVal = this.selectedCommunityId || null;
    const searchVal = document.getElementById('providers-search').value.trim();

    try {
      const { data, error } = await supabase.rpc('platform_get_all_providers', {
        p_community_id: filterVal,
        p_search: searchVal
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-3" style="text-align: center; padding: 24px;">No service providers found.</td></tr>';
        return;
      }

      data.forEach(sp => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        
        const ratingDisplay = sp.rating_count > 0 
          ? `⭐ ${parseFloat(sp.avg_rating).toFixed(1)} <span class="text-3">(${sp.rating_count})</span>` 
          : '<span class="text-3">No ratings</span>';

        const statusClass = sp.fraud_status === 'hidden' ? 'badge-rejected' : sp.fraud_status === 'queued_low' ? 'badge-pending' : 'badge-approved';
        const statusBadge = `<span class="badge-pill ${statusClass}">${esc(sp.fraud_status || 'pass')}</span>`;
        const verifiedBadge = sp.is_verified ? `<span class="badge-pill badge-approved" style="margin-left: 4px;">Verified</span>` : '';

        tr.innerHTML = `
          <td style="font-weight: 500;">${esc(sp.name)} ${verifiedBadge}</td>
          <td><span class="badge-pill badge-muted">${esc(sp.category)}</span></td>
          <td>${esc(sp.phone)}</td>
          <td>${esc(sp.community_name)}</td>
          <td>${ratingDisplay}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-secondary btn-inspect" style="padding: 4px 8px; font-size: 0.8rem;" data-id="${esc(sp.id)}">Inspect</button>
            <button class="btn btn-secondary btn-delete" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" data-id="${esc(sp.id)}" data-name="${esc(sp.name)}">Delete</button>
          </td>
        `;

        tr.querySelector('.btn-inspect').addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewDetails(sp.id);
        });

        tr.querySelector('.btn-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmDelete(sp.id, sp.name);
        });

        tr.addEventListener('click', () => {
          this.viewDetails(sp.id);
        });

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error fetching providers:', err);
      tbody.innerHTML = '<tr><td colspan="7" class="alert alert-danger">Error loading provider database.</td></tr>';
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  viewDetails(providerId) {
    this.selectedProviderId = providerId;
    window.location.hash = `#providers?id=${providerId}`;
  },

  async loadProviderDetail(providerId) {
    const loadingEl = document.getElementById('providers-loading');
    const infoContainer = document.getElementById('provider-detail-info');
    infoContainer.innerHTML = '';

    try {
      const { data: rawData, error } = await supabase.rpc('platform_get_provider_details', {
        p_provider_id: providerId
      });

      if (error) throw error;
      if (!rawData || !rawData.provider) {
        infoContainer.innerHTML = '<div class="alert alert-danger">Provider not found.</div>';
        return;
      }

      const p = rawData.provider;
      const reports = rawData.reports || [];
      const reviews = rawData.reviews || [];
      const hiresCount = rawData.hires_count || 0;

      // Render reports list
      let reportsHtml = '';
      if (reports.length > 0) {
        reports.forEach(r => {
          const statusClass = r.status === 'pending' ? 'badge-pending' : r.status === 'reviewed' ? 'badge-approved' : 'badge-muted';
          const isPending = r.status === 'pending';
          reportsHtml += `
            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; background-color: var(--surface);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="badge-pill ${statusClass}" style="text-transform: uppercase; font-size: 0.75rem;">${esc(r.status)}</span>
                <span class="text-3" style="font-size: 0.8rem;">${new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p style="font-weight: 500; margin-bottom: 4px;">Reason: ${esc(r.reason.replace('_', ' '))}</p>
              ${r.details ? `<p class="text-2" style="font-size: 0.85rem; margin-bottom: 8px;">"${esc(r.details)}"</p>` : ''}
              <div class="text-3" style="font-size: 0.8rem; border-top: 1px solid rgba(0,0,0,0.04); padding-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>Reported by: ${esc(r.user_name || 'Resident')} (${esc(r.user_email || 'No email')})</span>
                ${isPending ? `
                  <span>
                    <button class="btn btn-secondary btn-resolve-report" style="padding: 2px 6px; font-size: 0.75rem;" data-report-id="${esc(r.report_id)}" data-status="reviewed">Mark reviewed</button>
                    <button class="btn btn-secondary btn-resolve-report" style="padding: 2px 6px; font-size: 0.75rem;" data-report-id="${esc(r.report_id)}" data-status="dismissed">Dismiss</button>
                  </span>
                ` : ''}
              </div>
            </div>
          `;
        });
      } else {
        reportsHtml = '<p class="text-3">No complaints or flags reported against this provider.</p>';
      }

      // Render reviews list
      let reviewsHtml = '';
      if (reviews.length > 0) {
        reviews.forEach(rv => {
          const statusBadge = rv.fraud_status && rv.fraud_status !== 'pass'
            ? `<span class="badge-pill badge-pending" style="margin-left: 6px; font-size: 0.7rem;">${esc(rv.fraud_status)}</span>`
            : '';

          reviewsHtml += `
            <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <div>
                  <span style="color: var(--caution); font-weight: 500;">${'⭐'.repeat(rv.rating)}</span>
                  ${statusBadge}
                </div>
                <span class="text-3" style="font-size: 0.8rem;">${new Date(rv.created_at).toLocaleDateString()}</span>
              </div>
              ${rv.review_text ? `<p class="text-2" style="font-size: 0.9rem; margin-bottom: 6px;">"${esc(rv.review_text)}"</p>` : ''}
              <div class="text-3" style="font-size: 0.85rem;">
                By: <strong>${esc(rv.user_name || 'Resident')}</strong> (${esc(rv.flat_number || 'No flat')})
              </div>
            </div>
          `;
        });
      } else {
        reviewsHtml = '<p class="text-3">No public ratings/reviews recorded.</p>';
      }

      const isHidden = p.fraud_status === 'hidden' || p.visibility === 'hidden';
      const isVerified = p.is_verified === true;

      infoContainer.innerHTML = `
        <div class="detail-layout">
          <!-- Sidebar column -->
          <div class="detail-sidebar">
            <div class="section-card">
              <div class="section-card-header" style="margin-bottom: 12px;">
                <h2 style="font-size: 1.5rem; margin-bottom: 0;">${esc(p.name)}</h2>
                <span class="badge-pill badge-active">${esc(p.category)}</span>
              </div>
              
              <div style="font-size: 0.9rem; line-height: 1.8; border-top: 1px solid var(--border); padding-top: 16px;">
                <strong>Contact Number:</strong> ${esc(p.phone)}<br>
                <strong>Community:</strong> ${esc(p.community_name)}<br>
                <strong>Flat / Block:</strong> ${esc(p.flat_block || 'N/A')}<br>
                <strong>Added on:</strong> ${new Date(p.created_at).toLocaleDateString()}<br>
                <strong>Fraud Status:</strong> <span class="badge-pill ${isHidden ? 'badge-rejected' : 'badge-approved'}">${esc(p.fraud_status || 'pass')}</span><br>
                <strong>Verification:</strong> <span class="badge-pill ${isVerified ? 'badge-approved' : 'badge-muted'}">${isVerified ? 'Verified' : 'Unverified'}</span><br>
                <strong>Description:</strong> ${esc(p.description || 'No description provided.')}
              </div>
            </div>

            <!-- Moderation Controls -->
            <div class="section-card">
              <h2>Moderation Controls</h2>
              <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="btn btn-secondary btn-block btn-toggle-visibility">
                  ${isHidden ? 'Unhide Provider' : 'Hide Provider'}
                </button>
                <button class="btn btn-secondary btn-block btn-toggle-verify">
                  ${isVerified ? 'Unverify' : 'Mark Verified'}
                </button>
              </div>
            </div>

            <!-- Stats Overview -->
            <div class="section-card">
              <h2>Rating Summary</h2>
              <div style="display: flex; align-items: center; gap: 16px; margin-top: 16px; margin-bottom: 12px;">
                <div style="font-size: 2.5rem; font-weight: bold; color: var(--primary);">${parseFloat(p.avg_rating || 0).toFixed(1)}</div>
                <div>
                  <div style="color: var(--caution); font-size: 1.1rem;">${'⭐'.repeat(Math.round(p.avg_rating || 0)) || '☆'}</div>
                  <div class="text-3" style="font-size: 0.85rem;">Based on ${p.rating_count || 0} rating${p.rating_count !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style="border-top: 1px solid var(--border); padding-top: 12px; font-size: 0.85rem;">
                👥 <strong>${hiresCount}</strong> residents have contacted this provider
              </div>
            </div>

            <!-- Delete Action -->
            <div class="section-card">
              <h2>Danger Zone</h2>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 16px;">Permanently remove this service provider from the system. This cannot be undone.</p>
              <button class="btn btn-danger btn-block btn-confirm-delete">
                Delete Provider Profile
              </button>
            </div>
          </div>

          <!-- Main column: reports & reviews -->
          <div class="detail-main">
            <!-- Reported Flags -->
            <div class="section-card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2>Reported Incidents / Flags</h2>
                <span class="badge-pill ${reports.length > 0 ? 'badge-rejected' : 'badge-approved'}">${reports.length} report${reports.length !== 1 ? 's' : ''}</span>
              </div>
              <div style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column;">
                ${reportsHtml}
              </div>
            </div>

            <!-- Reviews list -->
            <div class="section-card">
              <h2>Ratings & Reviews</h2>
              <div style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                ${reviewsHtml}
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind Moderation listeners
      infoContainer.querySelector('.btn-toggle-visibility')?.addEventListener('click', async () => {
        const nextStatus = isHidden ? 'pass' : 'hidden';
        await this.setModerationState(providerId, nextStatus, isVerified);
      });

      infoContainer.querySelector('.btn-toggle-verify')?.addEventListener('click', async () => {
        await this.setModerationState(providerId, p.fraud_status || 'pass', !isVerified);
      });

      infoContainer.querySelector('.btn-confirm-delete')?.addEventListener('click', () => {
        this.confirmDelete(p.id, p.name);
      });

      // Bind Report resolution listeners
      infoContainer.querySelectorAll('.btn-resolve-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const reportId = e.target.getAttribute('data-report-id');
          const newStatus = e.target.getAttribute('data-status');
          await this.resolveReport(reportId, newStatus);
        });
      });

    } catch (err) {
      console.error('Error loading provider details:', err);
      infoContainer.innerHTML = '<div class="alert alert-danger">Error loading provider details.</div>';
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  async setModerationState(providerId, fraudStatus, isVerified) {
    try {
      const { error } = await supabase.rpc('set_provider_moderation_state', {
        p_provider_id: providerId,
        p_fraud_status: fraudStatus,
        p_is_verified: isVerified
      });

      if (error) throw error;
      await this.loadProviderDetail(providerId);
    } catch (err) {
      console.error('Error setting moderation state:', err);
      alert('Failed to update provider status: ' + err.message);
    }
  },

  async resolveReport(reportId, newStatus) {
    try {
      // Must go through the RPC. The direct UPDATE this replaced could never
      // succeed: the provider_reports UPDATE policy requires is_user_approved(),
      // which requires community_id IS NOT NULL — the exact opposite of what
      // is_platform_admin() requires.
      const { error } = await supabase.rpc('platform_resolve_provider_report', {
        p_report_id: reportId,
        p_status: newStatus
      });
      if (error) throw error;

      await this.loadProviderDetail(this.selectedProviderId);
    } catch (err) {
      console.error('Error resolving report:', err);
      alert('Failed to update report status: ' + (err.message || 'Unknown error'));
    }
  },

  async confirmDelete(providerId, providerName) {
    if (!confirm(`Are you sure you want to permanently delete "${providerName}" from the service providers directory?\nAll ratings, reviews, favorites, and notes associated with this provider will also be removed.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_delete_service_provider', {
        p_provider_id: providerId
      });

      if (error) throw error;
      alert(`"${providerName}" has been successfully deleted.`);
      
      this.selectedProviderId = null;
      window.location.hash = '#providers';
      this.load();
    } catch (err) {
      console.error('Error deleting provider:', err);
      alert('Failed to delete provider: ' + err.message);
    }
  },

  goBack() {
    this.selectedProviderId = null;
    window.location.hash = '#providers';
    this.load();
  }
};

window.ProvidersPage = ProvidersPage;
