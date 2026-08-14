// Funds Requests Page Controller
const FundsRequestsPage = {
  requests: [],
  selectedRequestId: null,
  residents: [],
  leadUserId: null,
  statusFilter: 'pending',
  filterBound: false,

  bindFilter() {
    if (this.filterBound) return;
    const select = document.getElementById('funds-requests-status-filter');
    if (!select) return;
    this.filterBound = true;
    select.value = this.statusFilter;
    select.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.selectedRequestId = null;
      this.load();
    });
  },

  async load() {
    this.bindFilter();
    const listContainer = document.getElementById('funds-requests-list-view');
    const detailContainer = document.getElementById('funds-requests-detail-view');
    const loadingEl = document.getElementById('funds-requests-loading');

    loadingEl.classList.remove('hidden');

    if (this.selectedRequestId) {
      listContainer.classList.add('hidden');
      detailContainer.classList.remove('hidden');
      await this.loadRequestDetail(this.selectedRequestId);
    } else {
      listContainer.classList.remove('hidden');
      detailContainer.classList.add('hidden');
      await this.loadRequestsList();
    }
  },

  async loadRequestsList() {
    const loadingEl = document.getElementById('funds-requests-loading');
    const tbody = document.getElementById('funds-requests-tbody');
    tbody.innerHTML = '';

    try {
      let query = supabase
        .from('funds_access_requests')
        .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, decided_at, decided_by, rejection_reason, communities(name, code, funds_enabled), profiles!funds_access_requests_requested_by_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (this.statusFilter) {
        query = query.eq('status', this.statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      this.requests = data || [];

      if (this.requests.length === 0) {
        tbody.innerHTML = emptyRow(7, 'No funds requests with that status.');
        return;
      }

      this.requests.forEach(r => {
        const tr = document.createElement('tr');
        // A decided request used to show only its status — no who, when or why.
        const decision = r.status === 'pending'
          ? '<span class="text-3">—</span>'
          : `<span class="text-3" style="font-size: 0.8rem;">${esc(fmtDate(r.decided_at))}</span>` +
            (r.rejection_reason
              ? `<br><span class="text-3" style="font-size: 0.78rem;">${esc(r.rejection_reason)}</span>`
              : (r.communities && r.communities.funds_enabled
                  ? '<br><span class="text-3" style="font-size: 0.78rem;">Funds active</span>'
                  : ''));

        tr.innerHTML = `
          <td style="font-weight: 500;">${esc(r.communities?.name || 'N/A')}<br><span class="text-3" style="font-size: 0.8rem;">CODE: ${esc(r.communities?.code || 'N/A')}</span></td>
          <td>${esc(r.profiles?.full_name || 'N/A')}</td>
          <td>${esc(r.contact_name)}<br><span class="text-3" style="font-size: 0.8rem;">${esc(r.contact_phone)}</span></td>
          <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(r.purpose || 'Not specified')}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${decision}</td>
          <td><button class="btn btn-secondary btn-sm" data-action="view">View</button></td>
        `;
        tr.querySelector('[data-action="view"]')
          .addEventListener('click', () => this.viewRequestDetail(r.id));
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading funds requests list:', err);
      tbody.innerHTML = `<tr><td colspan="7">${errorBanner(err.message, 'funds requests')}</td></tr>`;
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  viewRequestDetail(requestId) {
    this.selectedRequestId = requestId;
    this.load();
  },

  async loadRequestDetail(requestId) {
    const infoContainer = document.getElementById('funds-request-detail-info');
    const loadingEl = document.getElementById('funds-requests-loading');

    try {
      const { data: req, error } = await supabase
        .from('funds_access_requests')
        .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, decided_at, decided_by, rejection_reason, designated_lead_id, communities(name, code, address, funds_enabled), profiles!funds_access_requests_requested_by_fkey(full_name)')
        .eq('id', requestId)
        .maybeSingle();

      if (error || !req) {
        throw error || new Error('Request not found');
      }

      // Fetch active residents for designated lead options
      const { data: residentRows, error: residentError } = await supabase
        .from('profiles')
        .select('id, full_name, flat_number')
        .eq('community_id', req.community_id)
        .eq('app_role', 'resident')
        .is('removed_at', null)
        .order('full_name', { ascending: true });

      if (residentError) throw residentError;

      this.residents = residentRows || [];
      
      // Default lead: requester's ID if active resident, otherwise first resident, or null
      this.leadUserId = this.residents.find(r => r.id === req.requested_by)?.id || this.residents[0]?.id || null;

      this.renderRequestDetail(req);
    } catch (err) {
      console.error('Error loading request details:', err);
      alert('Error loading request: ' + err.message);
      this.selectedRequestId = null;
      this.load();
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  renderRequestDetail(req) {
    const container = document.getElementById('funds-request-detail-info');

    let residentOptions = '';
    if (this.residents.length === 0) {
      residentOptions = '<option value="">No active residents found in this community</option>';
    } else {
      this.residents.forEach(r => {
        residentOptions += `<option value="${escAttr(r.id)}" ${this.leadUserId === r.id ? 'selected' : ''}>` +
          `${esc(r.full_name || 'Resident')} (${esc(r.flat_number || 'No flat')})</option>`;
      });
    }

    const isPending = req.status === 'pending';

    container.innerHTML = `
      <div class="section-card">
        <div class="row-between" style="margin-bottom: 24px;">
          <h2 style="font-size: 1.5rem; color: var(--primary);">Request Overview</h2>
          ${statusBadge(req.status)}
        </div>

        <div class="approval-details-grid" style="margin-bottom: 28px;">
          <div>
            <div class="approval-label">Community Details</div>
            <div style="font-size: 0.9rem; margin-top: 8px; line-height: 1.6;">
              <strong>Name:</strong> ${esc(req.communities?.name || 'N/A')}<br>
              <strong>Code:</strong> ${esc(req.communities?.code || 'N/A')}<br>
              <strong>Address:</strong> ${esc(req.communities?.address || 'N/A')}<br>
              <strong>Funds currently:</strong> ${req.communities?.funds_enabled ? badge('Active', 'approved') : badge('Inactive', 'muted')}
            </div>
          </div>
          <div>
            <div class="approval-label">Requester &amp; Contact</div>
            <div style="font-size: 0.9rem; margin-top: 8px; line-height: 1.6;">
              <strong>User Account:</strong> ${esc(req.profiles?.full_name || 'N/A')}<br>
              <strong>Contact Name:</strong> ${esc(req.contact_name)}<br>
              <strong>Contact Phone:</strong> ${esc(req.contact_phone)}<br>
              <span class="badge-pill badge-muted" style="margin-top: 8px;">Submitted: ${esc(fmtDateTime(req.created_at))}</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 28px; padding-top: 20px; border-top: 1px solid var(--border);">
          <div class="approval-label" style="margin-bottom: 8px;">Purpose &amp; Description</div>
          <div style="padding: 16px; background-color: var(--card-muted); border-radius: 8px; font-size: 0.95rem; line-height: 1.5;">
            ${req.purpose ? esc(req.purpose) : '<span class="text-3">No purpose specified</span>'}
          </div>
        </div>

        ${isPending ? `
          <div style="padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="form-group">
              <label for="designated-lead-select">Designate Community Lead</label>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 2px; margin-bottom: 8px;">
                This resident becomes President when the request is approved (defaults to the requester if eligible).
              </p>
              <select class="form-control" id="designated-lead-select">${residentOptions}</select>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button class="btn btn-primary" id="approve-request-btn" style="flex: 1;">Approve &amp; Assign Lead</button>
            </div>
          </div>

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="form-group">
              <label for="reject-reason-textarea">Rejection Reason</label>
              <textarea class="form-control" id="reject-reason-textarea" placeholder="Explain why this request is being rejected (max 280 characters)..." maxlength="280" style="height: 80px; resize: none;"></textarea>
            </div>
            <button class="btn btn-secondary danger-outline" id="reject-request-btn">Reject Request</button>
          </div>
        ` : `
          <div style="padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="approval-label" style="margin-bottom: 8px;">Decision</div>
            <div style="font-size: 0.9rem; line-height: 1.6;">
              <strong>Outcome:</strong> ${statusBadge(req.status)}<br>
              <strong>Decided:</strong> ${esc(fmtDateTime(req.decided_at))}<br>
              ${req.rejection_reason ? `<strong>Reason:</strong> ${esc(req.rejection_reason)}<br>` : ''}
              ${req.designated_lead_id ? `<strong>Designated lead:</strong> ${esc(this.leadNameFor(req.designated_lead_id))}<br>` : ''}
            </div>
            <button class="btn btn-secondary btn-sm" id="open-community-btn" style="margin-top: 14px;">Open community →</button>
          </div>
        `}
      </div>
    `;

    const leadSelect = document.getElementById('designated-lead-select');
    if (leadSelect) {
      leadSelect.addEventListener('change', (e) => { this.leadUserId = e.target.value; });
    }

    const approveBtn = document.getElementById('approve-request-btn');
    if (approveBtn) approveBtn.addEventListener('click', () => this.approveRequest(req.id));

    const rejectBtn = document.getElementById('reject-request-btn');
    if (rejectBtn) rejectBtn.addEventListener('click', () => this.rejectRequest(req.id));

    const openBtn = document.getElementById('open-community-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        window.location.hash = '#communities?id=' + req.community_id;
      });
    }
  },

  leadNameFor(userId) {
    const match = this.residents.find(r => r.id === userId);
    // The designee is a president by now, so they are no longer in the
    // plain-resident list this page loads.
    return match ? (match.full_name || 'Resident') : 'Now a community lead';
  },

  async approveRequest(requestId) {
    const leadSelect = document.getElementById('designated-lead-select');
    const selectedLeadId = leadSelect ? leadSelect.value : this.leadUserId;

    if (!selectedLeadId) {
      alert('Please select a resident to designate as community lead.');
      return;
    }

    if (!confirm('Are you sure you want to approve this funds access request?\nThis will activate funds, assign the selected resident as community lead, and notify them.')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_approve_funds_access_request', {
        p_request_id: requestId,
        p_lead_user_id: selectedLeadId
      });

      if (error) throw error;

      alert('Funds access request approved successfully!');
      this.selectedRequestId = null;
      await this.load();
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Approval failed: ' + err.message);
    }
  },

  async rejectRequest(requestId) {
    const textarea = document.getElementById('reject-reason-textarea');
    const reason = textarea ? textarea.value.trim() : '';

    if (!reason) {
      alert('Please specify a rejection reason.');
      return;
    }

    if (!confirm('Are you sure you want to reject this request?')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('platform_reject_funds_access_request', {
        p_request_id: requestId,
        p_rejection_reason: reason
      });

      if (error) throw error;

      alert('Request rejected.');
      this.selectedRequestId = null;
      await this.load();
    } catch (err) {
      console.error('Rejection failed:', err);
      alert('Rejection failed: ' + err.message);
    }
  },

  goBack() {
    this.selectedRequestId = null;
    this.load();
  }
};

window.FundsRequestsPage = FundsRequestsPage;
