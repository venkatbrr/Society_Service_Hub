// Approvals Page Controller
const ApprovalsPage = {
  requests: [],
  blockLabels: {}, // request_id -> 'Block' | 'Tower'
  blockNames: {},  // request_id -> string[]
  blockFlatsPayload: {}, // request_id -> JSON
  rejectingRequestId: null,
  statusFilter: 'pending',
  filterBound: false,

  bindFilter() {
    if (this.filterBound) return;
    const select = document.getElementById('approvals-status-filter');
    if (!select) return;
    this.filterBound = true;
    select.value = this.statusFilter;
    select.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.load();
    });
  },

  async load() {
    const listContainer = document.getElementById('approvals-list');
    const loadingEl = document.getElementById('approvals-loading');

    listContainer.innerHTML = '';
    loadingEl.classList.remove('hidden');
    this.bindFilter();

    try {
      // Decided requests stay browsable — the page used to show only `pending`,
      // so there was no way to see what had already been approved or refused.
      let query = supabase
        .from('community_requests')
        .select('id, name, community_type, city, pincode, area, address, approximate_units, requester_flat_number, requested_by, created_at, block_label, block_details, status, rejection_reason, reviewed_at, resulting_community_id')
        .order('created_at', { ascending: false });

      if (this.statusFilter) {
        query = query.eq('status', this.statusFilter);
      }

      const { data: requestRows, error } = await query;

      if (error) throw error;

      if (!requestRows || requestRows.length === 0) {
        listContainer.innerHTML = this.statusFilter === 'pending'
          ? '<div class="alert alert-success">No pending community requests at this time.</div>'
          : emptyState('No community requests with that status.');
        this.requests = [];
        loadingEl.classList.add('hidden');
        return;
      }

      // Fetch profiles
      const requesterIds = [...new Set(requestRows.map(r => r.requested_by))];
      // Via RPC, not `from('profiles')`: `email` was dropped from the
      // resident-facing column grant in 20260918000000, and a missing column
      // grant fails the whole select rather than omitting the column.
      const { data: profiles, error: profilesError } = await supabase
        .rpc('platform_get_profiles_contact', { p_ids: requesterIds });

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
      if (!this.blockLabels[req.id]) {
        this.blockLabels[req.id] = req.block_label || 'Block';
      }
      if (!this.blockNames[req.id]) {
        if (req.block_details && Array.isArray(req.block_details)) {
          this.blockNames[req.id] = req.block_details.map(b => (typeof b === 'object' ? b.block : b)).filter(Boolean);
          this.blockFlatsPayload[req.id] = req.block_details;
        } else {
          this.blockNames[req.id] = [];
        }
      }

      const card = document.createElement('div');
      card.className = 'approval-card';
      
      const formattedDate = fmtDateTime(req.created_at);
      const unitStr = req.approximate_units ? `${esc(req.approximate_units)} units` : 'Not specified';
      const isPending = req.status === 'pending';

      card.innerHTML = `
        <div class="approval-details-grid">
          <div>
            <div class="approval-label">Community Details</div>
            ${isPending ? `
              <div class="form-group" style="margin-top: 8px;">
                <label>Community Name (Editable)</label>
                <input type="text" class="form-control" id="name-input-${escAttr(req.id)}" value="${escAttr(req.name)}">
              </div>
            ` : `
              <div style="margin-top: 8px;"><strong style="font-size: 1.05rem;">${esc(req.name)}</strong></div>
            `}
            <div style="font-size: 0.85rem; color: var(--text-2); margin-top: 8px;">
              <strong>Type:</strong> ${esc(req.community_type)}<br>
              <strong>Location:</strong> ${esc(req.area || 'N/A')}, ${esc(req.city)} - ${esc(req.pincode)}<br>
              <strong>Address:</strong> ${esc(req.address || 'N/A')}<br>
              <strong>Approx. Size:</strong> ${unitStr}
            </div>
          </div>
          <div>
            <div class="approval-label">Requester Info</div>
            <div style="margin-top: 8px; font-size: 0.9rem;">
              <strong>Name:</strong> ${esc(req.requester_name || 'N/A')}<br>
              <strong>Email:</strong> ${esc(req.requester_email || 'N/A')}<br>
              <strong>Phone:</strong> ${esc(req.requester_phone || 'N/A')}<br>
              <strong>Flat Number:</strong> ${esc(req.requester_flat_number || 'N/A')}<br>
              <span class="badge-pill badge-muted" style="margin-top: 8px;">Submitted: ${esc(formattedDate)}</span>
            </div>
          </div>
        </div>

        ${isPending ? `
          <div class="block-seeding-section">
            <div class="approval-label">Block / Tower Seeding</div>
            <p class="text-3" style="font-size: 0.8rem; margin-top: 4px; margin-bottom: 8px;">Optionally seed blocks/towers to enable them automatically for this community.</p>

            <div class="form-row" style="grid-template-columns: 120px 1fr; align-items: end;">
              <div class="form-group" style="margin-bottom: 0;">
                <label>Label</label>
                <select class="form-control" id="label-select-${escAttr(req.id)}">
                  <option value="Block" ${this.blockLabels[req.id] === 'Block' ? 'selected' : ''}>Block</option>
                  <option value="Tower" ${this.blockLabels[req.id] === 'Tower' ? 'selected' : ''}>Tower</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Add Block Name</label>
                <div style="display: flex; gap: 8px;">
                  <input type="text" class="form-control" id="block-input-${escAttr(req.id)}" placeholder="e.g. A, B, C">
                  <button type="button" class="btn btn-secondary" data-action="add-block-name">Add</button>
                </div>
              </div>
            </div>

            <div class="chip-container" id="chips-container-${escAttr(req.id)}"></div>
          </div>

          <div class="approval-actions">
            <button class="btn btn-secondary" data-action="reject">Reject</button>
            <button class="btn btn-primary" data-action="approve">Approve Community</button>
          </div>
        ` : `
          <div class="approval-decision">
            <div class="row-between">
              <div>
                ${statusBadge(req.status)}
                <span class="text-3" style="font-size: 0.85rem; margin-left: 8px;">
                  Decided ${esc(fmtDateTime(req.reviewed_at))}
                </span>
              </div>
              ${req.resulting_community_id
                ? `<button class="btn btn-secondary btn-sm" data-action="open-community">Open community →</button>`
                : ''}
            </div>
            ${req.rejection_reason
              ? `<p class="text-2" style="margin-top: 10px; font-size: 0.88rem;"><strong>Reason:</strong> ${esc(req.rejection_reason)}</p>`
              : ''}
          </div>
        `}
      `;

      listContainer.appendChild(card);

      if (isPending) {
        this.renderChips(req.id);

        card.querySelector('[data-action="add-block-name"]')
          .addEventListener('click', () => this.addBlockName(req.id));
        card.querySelector('[data-action="reject"]')
          .addEventListener('click', () => this.openRejectionModal(req.id));
        card.querySelector('[data-action="approve"]')
          .addEventListener('click', () => this.approveRequest(req.id));

        const labelSelect = card.querySelector(`#label-select-${CSS.escape(req.id)}`);
        labelSelect.addEventListener('change', (e) => {
          this.blockLabels[req.id] = e.target.value;
        });

        const blockInput = card.querySelector(`#block-input-${CSS.escape(req.id)}`);
        blockInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.addBlockName(req.id);
          }
        });
      } else if (req.resulting_community_id) {
        card.querySelector('[data-action="open-community"]')
          .addEventListener('click', () => {
            window.location.hash = '#communities?id=' + req.resulting_community_id;
          });
      }
    });
  },

  addBlockName(requestId) {
    const input = document.getElementById(`block-input-${requestId}`);
    const name = input.value.trim().toUpperCase();
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
    if (!container) return;
    container.innerHTML = '';

    const list = this.blockNames[requestId];
    if (list.length === 0) {
      container.innerHTML = '<span class="text-3" style="font-size: 0.85rem;">No blocks added yet. Community will start with blocks disabled.</span>';
      return;
    }

    list.forEach((name, idx) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${esc(name)} <span class="chip-remove" title="Remove">&times;</span>`;
      chip.querySelector('.chip-remove')
        .addEventListener('click', () => this.removeBlockName(requestId, idx));
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

      // Build flats payload if structured flats were passed
      const rawPayload = this.blockFlatsPayload[requestId];
      const flatsPayload = (rawPayload && Array.isArray(rawPayload) && rawPayload.length > 0)
        ? rawPayload
        : (hasBlocks ? names.map(n => ({ block: n, flats: [] })) : null);

      // Call platform approve RPC
      const { error } = await supabase.rpc('platform_approve_community_request', {
        p_request_id: requestId,
        p_block_names: hasBlocks ? names : null,
        p_block_label: label,
        p_flats: flatsPayload
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
