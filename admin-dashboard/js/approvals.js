// Approvals Page Controller
const ApprovalsPage = {
  requests: [],
  blockLabels: {}, // request_id -> 'Block' | 'Tower'
  blockNames: {},  // request_id -> string[]
  rejectingRequestId: null,

  async load() {
    const listContainer = document.getElementById('approvals-list');
    const loadingEl = document.getElementById('approvals-loading');
    
    listContainer.innerHTML = '';
    loadingEl.classList.remove('hidden');
    
    try {
      const { data: requestRows, error } = await supabase
        .from('community_requests')
        .select('id, name, community_type, city, pincode, area, address, approximate_units, requester_flat_number, requested_by, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (!requestRows || requestRows.length === 0) {
        listContainer.innerHTML = '<div class="alert alert-success">No pending community requests at this time.</div>';
        this.requests = [];
        loadingEl.classList.add('hidden');
        return;
      }

      // Fetch profiles
      const requesterIds = [...new Set(requestRows.map(r => r.requested_by))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, email')
        .in('id', requesterIds);

      if (profilesError) throw profilesError;
      
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      
      this.requests = requestRows.map(row => ({
        ...row,
        requester_name: profileMap.get(row.requested_by)?.full_name ?? null,
        requester_phone: profileMap.get(row.requested_by)?.phone_number ?? null,
        requester_email: profileMap.get(row.requested_by)?.email ?? null,
      }));

      this.renderRequests();
    } catch (err) {
      console.error('Error loading approvals:', err);
      listContainer.innerHTML = '<div class="alert alert-danger">Error loading community requests. Please check console.</div>';
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  renderRequests() {
    const listContainer = document.getElementById('approvals-list');
    listContainer.innerHTML = '';

    this.requests.forEach(req => {
      // Initialize block state for this request if not present
      if (!this.blockLabels[req.id]) this.blockLabels[req.id] = 'Block';
      if (!this.blockNames[req.id]) this.blockNames[req.id] = [];

      const card = document.createElement('div');
      card.className = 'approval-card';
      
      const formattedDate = new Date(req.created_at).toLocaleString();
      const unitStr = req.approximate_units ? `${req.approximate_units} units` : 'Not specified';
      
      card.innerHTML = `
        <div class="approval-details-grid">
          <div>
            <div class="approval-label">Community Details</div>
            <div class="form-group" style="margin-top: 8px;">
              <label>Community Name (Editable)</label>
              <input type="text" class="form-control" id="name-input-${req.id}" value="${req.name}">
            </div>
            <div style="font-size: 0.85rem; color: var(--text-2); margin-top: 8px;">
              <strong>Type:</strong> ${req.community_type}<br>
              <strong>Location:</strong> ${req.area || 'N/A'}, ${req.city} - ${req.pincode}<br>
              <strong>Address:</strong> ${req.address || 'N/A'}<br>
              <strong>Approx. Size:</strong> ${unitStr}
            </div>
          </div>
          <div>
            <div class="approval-label">Requester Info</div>
            <div style="margin-top: 8px; font-size: 0.9rem;">
              <strong>Name:</strong> ${req.requester_name || 'N/A'}<br>
              <strong>Email:</strong> ${req.requester_email || 'N/A'}<br>
              <strong>Phone:</strong> ${req.requester_phone || 'N/A'}<br>
              <strong>Flat Number:</strong> ${req.requester_flat_number || 'N/A'}<br>
              <span class="badge-pill badge-muted" style="margin-top: 8px;">Submitted: ${formattedDate}</span>
            </div>
          </div>
        </div>

        <div class="block-seeding-section">
          <div class="approval-label">Block / Tower Seeding</div>
          <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 8px;">Optionally seed blocks/towers to enable them automatically for this community.</p>
          
          <div class="form-row" style="grid-template-columns: 120px 1fr; align-items: end;">
            <div class="form-group" style="margin-bottom: 0;">
              <label>Label</label>
              <select class="form-control" id="label-select-${req.id}">
                <option value="Block" ${this.blockLabels[req.id] === 'Block' ? 'selected' : ''}>Block</option>
                <option value="Tower" ${this.blockLabels[req.id] === 'Tower' ? 'selected' : ''}>Tower</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Add Block Name</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="form-control" id="block-input-${req.id}" placeholder="e.g. Block A">
                <button type="button" class="btn btn-secondary" onclick="ApprovalsPage.addBlockName('${req.id}')">Add</button>
              </div>
            </div>
          </div>

          <div class="chip-container" id="chips-container-${req.id}"></div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
          <button class="btn btn-secondary" onclick="ApprovalsPage.openRejectionModal('${req.id}')">Reject</button>
          <button class="btn btn-primary" onclick="ApprovalsPage.approveRequest('${req.id}')">Approve Community</button>
        </div>
      `;

      listContainer.appendChild(card);
      
      // Render chips initially
      this.renderChips(req.id);

      // Listen to label change
      const labelSelect = card.querySelector(`#label-select-${req.id}`);
      labelSelect.addEventListener('change', (e) => {
        this.blockLabels[req.id] = e.target.value;
      });
      
      // Add enter key listener on block name input
      const blockInput = card.querySelector(`#block-input-${req.id}`);
      blockInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addBlockName(req.id);
        }
      });
    });
  },

  addBlockName(requestId) {
    const input = document.getElementById(`block-input-${requestId}`);
    const name = input.value.trim();
    if (!name) return;

    if (this.blockNames[requestId].includes(name)) {
      alert('Block name already added');
      return;
    }

    this.blockNames[requestId].push(name);
    input.value = '';
    this.renderChips(requestId);
    input.focus();
  },

  removeBlockName(requestId, index) {
    this.blockNames[requestId].splice(index, 1);
    this.renderChips(requestId);
  },

  renderChips(requestId) {
    const container = document.getElementById(`chips-container-${requestId}`);
    container.innerHTML = '';

    const list = this.blockNames[requestId];
    if (list.length === 0) {
      container.innerHTML = '<span class="text-3" style="font-size: 0.85rem;">No blocks added yet. Community will start with blocks disabled.</span>';
      return;
    }

    list.forEach((name, idx) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        ${name}
        <span class="chip-remove" onclick="ApprovalsPage.removeBlockName('${requestId}', ${idx})">&times;</span>
      `;
      container.appendChild(chip);
    });
  },

  async approveRequest(requestId) {
    const nameInput = document.getElementById(`name-input-${requestId}`);
    const newName = nameInput.value.trim();
    
    if (!newName) {
      alert('Community name cannot be empty');
      return;
    }

    const label = this.blockLabels[requestId] || 'Block';
    const names = this.blockNames[requestId] || [];
    const hasBlocks = names.length > 0;
    
    const blockDesc = hasBlocks ? ` with ${names.length} ${label.toLowerCase()}(s)` : ' with blocks disabled';
    
    if (!confirm(`Are you sure you want to approve this request?\nThis will create the community "${newName}"${blockDesc} and set the requester as community lead.`)) {
      return;
    }

    try {
      // Set audit actor
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc('set_audit_actor', { p_actor_id: user.id });

      // Update community request name inline
      const { error: updateError } = await supabase
        .from('community_requests')
        .update({ name: newName })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Call platform approve RPC
      const { error } = await supabase.rpc('platform_approve_community_request', {
        p_request_id: requestId,
        p_block_names: hasBlocks ? names : null,
        p_block_label: label
      });

      if (error) throw error;

      alert('Community request approved successfully!');
      await this.load();
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Approval failed: ' + err.message);
    }
  },

  openRejectionModal(requestId) {
    this.rejectingRequestId = requestId;
    document.getElementById('rejection-reason-input').value = '';
    document.getElementById('rejection-modal').classList.remove('hidden');
  },

  closeRejectionModal() {
    this.rejectingRequestId = null;
    document.getElementById('rejection-modal').classList.add('hidden');
  },

  async submitRejection() {
    if (!this.rejectingRequestId) return;
    
    const reason = document.getElementById('rejection-reason-input').value.trim();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.rpc('set_audit_actor', { p_actor_id: user.id });

      const { error } = await supabase.rpc('platform_reject_community_request', {
        p_request_id: this.rejectingRequestId,
        p_rejection_reason: reason || null
      });

      if (error) throw error;

      alert('Request rejected.');
      this.closeRejectionModal();
      await this.load();
    } catch (err) {
      console.error('Rejection failed:', err);
      alert('Rejection failed: ' + err.message);
    }
  }
};

window.ApprovalsPage = ApprovalsPage;
