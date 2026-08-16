// Bug & Feature Reports Controller
const FeedbackPage = {
  reports: [],
  kindFilter: '',
  communityFilter: '',
  searchQuery: '',
  filterBound: false,
  communitiesLoaded: false,

  bindFilters() {
    if (this.filterBound) return;
    this.filterBound = true;

    const kindSelect = document.getElementById('feedback-kind-filter');
    if (kindSelect) {
      kindSelect.addEventListener('change', (e) => {
        this.kindFilter = e.target.value;
        this.load();
      });
    }

    const commSelect = document.getElementById('feedback-community-filter');
    if (commSelect) {
      commSelect.addEventListener('change', (e) => {
        this.communityFilter = e.target.value;
        this.load();
      });
    }

    const searchInput = document.getElementById('feedback-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        this.searchQuery = (e.target.value || '').trim().toLowerCase();
        this.renderTable();
      }, 250));
    }
  },

  async populateCommunitiesDropdown() {
    if (this.communitiesLoaded) return;
    const commSelect = document.getElementById('feedback-community-filter');
    if (!commSelect) return;

    try {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name')
        .order('name');

      if (!error && data) {
        let html = '<option value="">All Communities</option>';
        data.forEach(c => {
          html += `<option value="${escAttr(c.id)}">${esc(c.name)}</option>`;
        });
        commSelect.innerHTML = html;
        this.communitiesLoaded = true;
      }
    } catch (err) {
      console.error('Failed to load communities for filter:', err);
    }
  },

  async load() {
    this.bindFilters();
    await this.populateCommunitiesDropdown();

    const loadingEl = document.getElementById('feedback-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
      const communityIdParam = normalizeCommunityId(this.communityFilter);
      const kindParam = this.kindFilter || null;

      const { data, error } = await supabase.rpc('platform_get_feedback_reports', {
        p_community_id: communityIdParam,
        p_kind: kindParam
      });

      if (error) throw error;
      this.reports = data || [];
      this.renderTable();
    } catch (err) {
      console.error('Error loading feedback reports:', err);
      const tbody = document.getElementById('feedback-tbody');
      if (tbody) {
        tbody.innerHTML = emptyRow(6, 'Failed to load feedback reports. ' + (err.message || ''));
      }
    } finally {
      if (loadingEl) loadingEl.classList.add('hidden');
    }
  },

  renderTable() {
    const tbody = document.getElementById('feedback-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let rows = this.reports;
    if (this.searchQuery) {
      rows = rows.filter(r => {
        const name = (r.resident_name || '').toLowerCase();
        const email = (r.resident_email || '').toLowerCase();
        const comm = (r.community_name || '').toLowerCase();
        const msg = (r.message || '').toLowerCase();
        return name.includes(this.searchQuery) ||
               email.includes(this.searchQuery) ||
               comm.includes(this.searchQuery) ||
               msg.includes(this.searchQuery);
      });
    }

    if (rows.length === 0) {
      tbody.innerHTML = emptyRow(6, 'No bug reports or feature ideas found.');
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');

      const isBug = r.kind === 'bug';
      const kindBadge = isBug
        ? `<span class="badge badge-danger">🐛 Bug</span>`
        : `<span class="badge badge-accent">💡 Feature</span>`;

      const residentInfo = `
        <div style="font-weight: 500; color: var(--text-1);">${esc(r.resident_name || 'Resident')}</div>
        <div class="text-3" style="font-size: 0.8rem; margin-top: 2px;">${esc(r.resident_email || '')}</div>
        ${r.resident_phone ? `<div class="text-3" style="font-size: 0.78rem;">${esc(r.resident_phone)}</div>` : ''}
      `;

      const communityInfo = `
        <div style="font-weight: 500; color: var(--text-1);">${esc(r.community_name || 'No community')}</div>
        ${r.flat_number ? `<div class="text-3" style="font-size: 0.78rem;">Unit: ${esc(r.flat_number)}</div>` : ''}
      `;

      const attachment = r.image_url
        ? `<a href="${escAttr(r.image_url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block;" title="Click to view full screenshot">
            <img src="${escAttr(r.image_url)}" alt="Screenshot" style="width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />
          </a>`
        : `<span class="text-3" style="font-size: 0.85rem;">—</span>`;

      tr.innerHTML = `
        <td style="white-space: nowrap;">
          <div style="font-weight: 500; font-size: 0.85rem;">${esc(fmtDate(r.created_at))}</div>
          <div class="text-3" style="font-size: 0.75rem;">${esc(fmtTime(r.created_at))}</div>
        </td>
        <td>${kindBadge}</td>
        <td>${residentInfo}</td>
        <td>${communityInfo}</td>
        <td>
          <div style="white-space: pre-wrap; font-size: 0.88rem; line-height: 1.45; color: var(--text-1); max-width: 520px; word-break: break-word;">${esc(r.message)}</div>
        </td>
        <td style="text-align: center;">${attachment}</td>
      `;

      tbody.appendChild(tr);
    });
  }
};

window.FeedbackPage = FeedbackPage;
