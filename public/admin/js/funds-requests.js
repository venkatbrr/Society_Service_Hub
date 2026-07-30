// Funds Requests Page Controller
const FundsRequestsPage = {
  requests: [],
  selectedRequestId: null,
  residents: [],
  leadUserId: null,

  async load() {
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
      const { data, error } = await supabase
        .from('funds_access_requests')
        .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, communities(name, code), profiles!funds_access_requests_requested_by_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.requests = data || [];

      if (this.requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-3" style="text-align: center;">No funds requests found.</td></tr>';
        return;
      }

      this.requests.forEach(r => {
        const formattedDate = new Date(r.created_at).toLocaleDateString();
        
        let statusBadge = '';
        if (r.status === 'pending') {
          statusBadge = '<span class="badge-pill badge-pending">Pending</span>';
        } else if (r.status === 'approved') {
          statusBadge = '<span class="badge-pill badge-approved">Approved</span>';
        } else {
          statusBadge = `<span class="badge-pill badge-rejected">Rejected</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 500;">${r.communities?.name || 'N/A'}<br><span class="text-3" style="font-size: 0.8rem;">CODE: ${r.communities?.code || 'N/A'}</span></td>
          <td>${r.profiles?.full_name || 'N/A'}</td>
          <td>${r.contact_name}<br><span class="text-3" style="font-size: 0.8rem;">${r.contact_phone}</span></td>
          <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.purpose || 'N/A'}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="FundsRequestsPage.viewRequestDetail('${r.id}')">View</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading funds requests list:', err);
      tbody.innerHTML = '<tr><td colspan="6" class="alert alert-danger" style="text-align: center;">Failed to load requests.</td></tr>';
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
        .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, communities(name, code, address), profiles!funds_access_requests_requested_by_fkey(full_name)')
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
        residentOptions += `
          <option value="${r.id}" ${this.leadUserId === r.id ? 'selected' : ''}>
            ${r.full_name || 'Resident'} (${r.flat_number || 'No flat'})
          </option>
        `;
      });
    }

    const formattedDate = new Date(req.created_at).toLocaleString();
    
    let statusLabel = '';
    if (req.status === 'pending') {
      statusLabel = '<span class="badge-pill badge-pending">Pending Review</span>';
    } else if (req.status === 'approved') {
      statusLabel = '<span class="badge-pill badge-approved">Approved</span>';
    } else {
      statusLabel = '<span class="badge-pill badge-rejected">Rejected</span>';
    }

    container.innerHTML = `
      <div style="background-color: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="font-size: 1.5rem; color: var(--primary);">Request Overview</h2>
          ${statusLabel}
        </div>

        <div class="approval-details-grid" style="margin-bottom: 28px;">
          <div>
            <div class="approval-label">Community Details</div>
            <div style="font-size: 0.9rem; margin-top: 8px; line-height: 1.6;">
              <strong>Name:</strong> ${req.communities?.name || 'N/A'}<br>
              <strong>Code:</strong> ${req.communities?.code || 'N/A'}<br>
              <strong>Address:</strong> ${req.communities?.address || 'N/A'}
            </div>
          </div>
          <div>
            <div class="approval-label">Requester & Contact</div>
            <div style="font-size: 0.9rem; margin-top: 8px; line-height: 1.6;">
              <strong>User Account:</strong> ${req.profiles?.full_name || 'N/A'}<br>
              <strong>Contact Name:</strong> ${req.contact_name}<br>
              <strong>Contact Phone:</strong> ${req.contact_phone}<br>
              <span class="badge-pill badge-muted" style="margin-top: 8px;">Submitted: ${formattedDate}</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 28px; padding-top: 20px; border-top: 1px solid var(--border);">
          <div class="approval-label" style="margin-bottom: 8px;">Purpose & Description</div>
          <div style="padding: 16px; background-color: var(--card-muted); border-radius: 8px; font-size: 0.95rem; line-height: 1.5;">
            ${req.purpose || '<span class="text-3">No purpose specified</span>'}
          </div>
        </div>

        ${req.status === 'pending' ? `
          <div style="padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="form-group">
              <label for="designated-lead">Designate Community Lead</label>
              <p class="text-3" style="font-size: 0.8rem; margin-top: 2px; margin-bottom: 8px;">
                Select the resident who will be set as Community Lead upon approval (defaults to requester if eligible).
              </p>
              <select class="form-control" id="designated-lead-select">${residentOptions}</select>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 20px;">
              <button class="btn btn-primary" onclick="FundsRequestsPage.approveRequest('${req.id}')" style="flex: 1;">
                Approve & Assign Lead
              </button>
            </div>
          </div>

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="form-group">
              <label for="reject-reason">Rejection Reason</label>
              <textarea class="form-control" id="reject-reason-textarea" placeholder="Explain why this request is being rejected (max 280 characters)..." maxlength="280" style="height: 80px; resize: none;"></textarea>
            </div>
            <button class="btn btn-secondary" onclick="FundsRequestsPage.rejectRequest('${req.id}')" style="color: var(--danger); border-color: var(--danger); background-color: var(--danger-soft);">
              Reject Request
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Listen to lead select change
    const leadSelect = document.getElementById('designated-lead-select');
    if (leadSelect) {
      leadSelect.addEventListener('change', (e) => {
        this.leadUserId = e.target.value;
      });
    }
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
