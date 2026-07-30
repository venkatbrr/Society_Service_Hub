// Providers Page Controller
const ProvidersPage = {
  communities: [],
  selectedCommunityId: null,
  selectedProviderId: null,

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
        tbody.innerHTML = '<tr><td colspan="6" class="text-3" style="text-align: center; padding: 24px;">No service providers found.</td></tr>';
        return;
      }

      data.forEach(sp => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        
        const ratingDisplay = sp.rating_count > 0 
          ? `⭐ ${parseFloat(sp.avg_rating).toFixed(1)} <span class="text-3">(${sp.rating_count})</span>` 
          : '<span class="text-3">No ratings</span>';

        tr.innerHTML = `
          <td style="font-weight: 500;">${sp.name}</td>
          <td><span class="badge-pill badge-muted">${sp.category}</span></td>
          <td>${sp.phone}</td>
          <td>${sp.community_name}</td>
          <td>${ratingDisplay}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); ProvidersPage.viewDetails('${sp.id}')">Inspect</button>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger);" onclick="event.stopPropagation(); ProvidersPage.confirmDelete('${sp.id}', '${sp.name}')">Delete</button>
          </td>
        `;

        tr.addEventListener('click', () => {
          this.viewDetails(sp.id);
        });

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error fetching providers:', err);
      tbody.innerHTML = '<tr><td colspan="6" class="alert alert-danger">Error loading provider database.</td></tr>';
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
      const { data, error } = await supabase.rpc('platform_get_provider_details', {
        p_provider_id: providerId
      });

      if (error) throw error;
      if (!data) {
        infoContainer.innerHTML = '<div class="alert alert-danger">Provider not found.</div>';
        return;
      }

      // Render reports list
      let reportsHtml = '';
      const reports = data.reports || [];
      if (reports.length > 0) {
        reports.forEach(r => {
          const statusClass = r.status === 'pending' ? 'badge-pending' : r.status === 'reviewed' ? 'badge-approved' : 'badge-muted';
          reportsHtml += `
            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; background-color: var(--surface);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="badge-pill ${statusClass}" style="text-transform: uppercase; font-size: 0.75rem;">${r.status}</span>
                <span class="text-3" style="font-size: 0.8rem;">${new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p style="font-weight: 500; margin-bottom: 4px;">Reason: ${r.reason.replace('_', ' ')}</p>
              ${r.details ? `<p class="text-2" style="font-size: 0.85rem; margin-bottom: 8px;">"${r.details}"</p>` : ''}
              <div class="text-3" style="font-size: 0.8rem; border-top: 1px solid rgba(0,0,0,0.04); padding-top: 6px;">
                Reported by: ${r.user_name || 'Resident'} (${r.user_email || 'No email'})
              </div>
            </div>
          `;
        });
      } else {
        reportsHtml = '<p class="text-3">No complaints or flags reported against this provider.</p>';
      }

      // Render reviews list
      let reviewsHtml = '';
      const reviews = data.reviews || [];
      if (reviews.length > 0) {
        reviews.forEach(rv => {
          reviewsHtml += `
            <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--caution); font-weight: 500;">${'⭐'.repeat(rv.rating)}</span>
                <span class="text-3" style="font-size: 0.8rem;">${new Date(rv.created_at).toLocaleDateString()}</span>
              </div>
              <div class="text-3" style="font-size: 0.85rem;">
                By: <strong>${rv.user_name || 'Resident'}</strong> (${rv.flat_number || 'No flat'})
              </div>
            </div>
          `;
        });
      } else {
        reviewsHtml = '<p class="text-3">No public ratings/reviews recorded.</p>';
      }

      infoContainer.innerHTML = `
        <div class="detail-layout">
          <!-- Sidebar column -->
          <div class="detail-sidebar">
            <div class="section-card">
              <div class="section-card-header" style="margin-bottom: 12px;">
                <h2 style="font-size: 1.5rem; margin-bottom: 0;">${data.name}</h2>
                <span class="badge-pill badge-active">${data.category}</span>
              </div>
              
              <div style="font-size: 0.9rem; line-height: 1.8; border-top: 1px solid var(--border); padding-top: 16px;">
                <strong>Contact Number:</strong> ${data.phone}<br>
                <strong>Community:</strong> ${data.community_name}<br>
                <strong>Flat / Block:</strong> ${data.flat_block || 'N/A'}<br>
                <strong>Added on:</strong> ${new Date(data.created_at).toLocaleDateString()}<br>
                <strong>Description:</strong> ${data.description || 'No description provided.'}
              </div>
            </div>

            <!-- Stats Overview -->
            <div class="section-card">
              <h2>Rating Summary</h2>
              <div style="display: flex; align-items: center; gap: 16px; margin-top: 16px; margin-bottom: 12px;">
                <div style="font-size: 2.5rem; font-weight: bold; color: var(--primary);">${parseFloat(data.avg_rating || 0).toFixed(1)}</div>
                <div>
                  <div style="color: var(--caution); font-size: 1.1rem;">${'⭐'.repeat(Math.round(data.avg_rating || 0)) || '☆'}</div>
                  <div class="text-3" style="font-size: 0.85rem;">Based on ${data.rating_count || 0} rating${data.rating_count !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style="border-top: 1px solid var(--border); padding-top: 12px; font-size: 0.85rem;">
                👥 <strong>${data.hires_count || 0}</strong> residents have contacted this provider
              </div>
            </div>

            <!-- Delete Action -->
            <div class="section-card">
              <h2>Danger Zone</h2>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 16px;">Permanently remove this service provider from the system. This cannot be undone.</p>
              <button class="btn btn-danger btn-block" onclick="ProvidersPage.confirmDelete('${data.id}', '${data.name}')">
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
    } catch (err) {
      console.error('Error loading provider details:', err);
      infoContainer.innerHTML = '<div class="alert alert-danger">Error loading provider details.</div>';
    } finally {
      loadingEl.classList.add('hidden');
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
