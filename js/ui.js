/**
 * ui.js — DOM rendering helpers
 */
const UI = (() => {
  let _alertTimer = null;

  function showAlert(msg, type = 'success') {
    const b = document.getElementById('alert-box');
    b.textContent = msg;
    b.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    b.classList.add('show');
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => b.classList.remove('show'), 5000);
  }
  function hideAlert() { document.getElementById('alert-box').classList.remove('show'); }

  // ── Dashboard ─────────────────────────────────────────────────────────
  function renderDashboard() {
    const stats    = Inventory.getStats();
    const lowItems = Inventory.getLowStockItems();
    const { movements } = DB.getData();
    const byProduct = Inventory.getStockByProduct();

    document.getElementById('stats-row').innerHTML = `
      <div class="stat"><div class="stat-label">In stock</div><div class="stat-val green">${stats.inStock}</div></div>
      <div class="stat"><div class="stat-label">In transit</div><div class="stat-val transit">${stats.inTransit}</div></div>
      <div class="stat"><div class="stat-label">Deployed</div><div class="stat-val deployed">${stats.deployed}</div></div>
      <div class="stat"><div class="stat-label">Total received</div><div class="stat-val">${stats.totalIn}</div></div>
      <div class="stat"><div class="stat-label">Product lines</div><div class="stat-val">${stats.productLines}</div></div>
      <div class="stat"><div class="stat-label">Low stock</div><div class="stat-val amber">${stats.lowCount}</div></div>`;

    const lowBox = document.getElementById('low-alert-box');
    if (lowItems.length > 0) {
      lowBox.style.display = 'block';
      lowBox.textContent = `⚠ Low stock: ${lowItems.map(v => `${v.product} (${v.inStock.size})`).join(', ')}`;
    } else { lowBox.style.display = 'none'; }

    // Stock by product
    const maxStock = Math.max(...byProduct.map(p => p.inStock), 1);
    const grandTotalCost  = byProduct.reduce((a, p) => a + p.totalCost, 0);
    const grandTotalUnits = byProduct.reduce((a, p) => a + p.inStock + p.inTransit, 0);
    const fmt$ = n => n != null && n > 0 ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:var(--text-hint)">—</span>';

    document.getElementById('dash-product-stock').innerHTML = byProduct.length
      ? `<table class="product-stock-table">
          <thead><tr>
            <th style="width:24%">Product</th>
            <th style="width:14%">Category</th>
            <th style="width:20%">In stock</th>
            <th style="width:10%">In transit</th>
            <th style="width:12%">Avg cost</th>
            <th style="width:10%">Units</th>
            <th style="width:10%">Total value</th>
          </tr></thead>
          <tbody>
            ${byProduct.map(p => `<tr>
              <td style="font-weight:500">${esc(p.product)}</td>
              <td><span class="cat-badge">${esc(p.category || '—')}</span></td>
              <td>
                <div class="stock-bar-wrap">
                  <div class="stock-bar"><div class="stock-bar-fill" style="width:${Math.round(p.inStock / maxStock * 100)}%"></div></div>
                  <span style="font-size:13px;font-weight:600;color:var(--success-text)">${p.inStock}</span>
                </div>
              </td>
              <td>${p.inTransit > 0 ? `<span class="transit-pill">✈ ${p.inTransit}</span>` : '<span style="color:var(--text-hint)">—</span>'}</td>
              <td style="font-size:12px">${fmt$(p.avgCost)}</td>
              <td style="font-size:12px;color:var(--text-muted)">${p.costedUnits > 0 ? p.costedUnits : '<span style="color:var(--text-hint)">—</span>'}</td>
              <td style="font-size:12px;font-weight:600;color:var(--aio-purple)">${fmt$(p.totalCost)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--aio-purple-light);">
              <td colspan="2" style="font-weight:700;font-size:12px;color:var(--text-muted);padding-top:10px;">Total</td>
              <td style="font-weight:700;font-size:13px;color:var(--success-text);padding-top:10px;">${grandTotalUnits}</td>
              <td colspan="3" style="padding-top:10px;"></td>
              <td style="font-weight:700;font-size:13px;color:var(--aio-purple);padding-top:10px;">$${grandTotalCost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            </tr>
          </tfoot>
        </table>`
      : '<div class="empty">No stock data yet</div>';

    // ── Deployed stock by product ──────────────────────────────────────
    const deployedByProduct  = Inventory.getDeployedByProduct();
    const deployedGrandTotal = deployedByProduct.reduce((a, p) => a + p.totalCost, 0);
    const deployedGrandUnits = deployedByProduct.reduce((a, p) => a + p.units, 0);

    document.getElementById('dash-deployed-stock').innerHTML = deployedByProduct.length
      ? `<table class="product-stock-table">
          <thead><tr>
            <th style="width:28%">Product</th>
            <th style="width:16%">Category</th>
            <th style="width:12%">Units deployed</th>
            <th style="width:14%">Avg cost</th>
            <th style="width:10%">Priced</th>
            <th style="width:14%">Total value</th>
          </tr></thead>
          <tbody>
            ${deployedByProduct.map(p => `<tr>
              <td style="font-weight:500">${esc(p.product)}</td>
              <td><span class="cat-badge">${esc(p.category || '—')}</span></td>
              <td><span style="font-size:13px;font-weight:600;color:var(--aio-orange-dark)">${p.units}</span></td>
              <td style="font-size:12px">${fmt$(p.avgCost)}</td>
              <td style="font-size:12px;color:var(--text-muted)">${p.costedUnits > 0 ? p.costedUnits : '<span style="color:var(--text-hint)">—</span>'}</td>
              <td style="font-size:12px;font-weight:600;color:var(--aio-orange-dark)">${fmt$(p.totalCost)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="font-weight:700;font-size:12px;color:var(--text-muted)">Total</td>
              <td style="font-weight:700;font-size:13px;color:var(--aio-orange-dark)">${deployedGrandUnits}</td>
              <td colspan="2"></td>
              <td style="font-weight:700;font-size:13px;color:var(--aio-orange-dark)">$${deployedGrandTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            </tr>
          </tfoot>
        </table>`
      : '<div class="empty">No stock deployed yet</div>';
    document.getElementById('dash-recent').innerHTML = recent.length
      ? `<table><thead><tr><th style="width:40%">Product</th><th style="width:13%">Type</th><th style="width:25%">Location</th><th style="width:22%">Date</th></tr></thead><tbody>
         ${recent.map(m => `<tr><td style="font-weight:500">${esc(m.product)}</td><td><span class="badge ${m.type==='IN'?'b-in':'b-out'}">${m.type}</span></td><td><span class="loc-badge">${esc(m.location||'—')}</span></td><td style="color:var(--text-hint)">${fmtDate(m.date)}</td></tr>`).join('')}
         </tbody></table>`
      : '<div class="empty">No movements yet</div>';

    document.getElementById('dash-low').innerHTML = lowItems.length
      ? `<table><thead><tr><th style="width:45%">Product</th><th style="width:30%">Location</th><th>Stock</th></tr></thead><tbody>
         ${lowItems.map(v => `<tr><td>${esc(v.product)}</td><td><span class="loc-badge">${esc(v.location||'—')}</span></td><td><span class="badge ${v.inStock.size===0?'b-zero':'b-low'}">${v.inStock.size}</span></td></tr>`).join('')}
         </tbody></table>`
      : '<div class="empty" style="padding:1rem">All products well stocked</div>';

    const map = Inventory.getInventoryMap();
    const locMap = {};
    Object.values(map).forEach(v => { const l = v.location || 'Unassigned'; locMap[l] = (locMap[l] || 0) + v.inStock.size; });
    document.getElementById('dash-locations').innerHTML = Object.keys(locMap).length
      ? `<div class="loc-grid">${Object.entries(locMap).map(([loc, qty]) => `<div class="loc-card"><div class="loc-card-label">${esc(loc)}</div><div class="loc-card-val">${qty} <span class="loc-card-sub">units</span></div></div>`).join('')}</div>`
      : '<div class="empty">No location data yet</div>';
  }

  // ── In Transit ────────────────────────────────────────────────────────
  function renderTransitList() {
    const { shipments } = DB.getData();
    const active = shipments.filter(s => s.status === 'in-transit').reverse();
    const badge = document.getElementById('transit-count-badge');
    if (badge) badge.textContent = active.length > 0 ? `(${active.length})` : '';

    const container = document.getElementById('transit-list');
    if (!container) return;
    if (!active.length) { container.innerHTML = '<div class="empty">No active shipments</div>'; return; }

    container.innerHTML = active.map(s => {
      const totalUnits = s.products.reduce((a, p) => a + p.serials.length, 0);
      const expectedStr = s.expectedBy ? `Expected ${new Date(s.expectedBy).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : '';
      return `<div class="shipment-card">
        <div class="shipment-card-header">
          <div>
            <div class="shipment-card-title">${esc(s.supplier || 'Shipment')} → <span class="loc-badge">${esc(s.location || '?')}</span></div>
            <div class="shipment-card-meta">${totalUnits} unit${totalUnits!==1?'s':''} · ${s.products.length} product${s.products.length!==1?'s':''} · Registered ${fmtDate(s.createdAt)}${expectedStr ? ' · ' + expectedStr : ''}</div>
          </div>
          <div class="shipment-actions">
            <button class="btn btn-success btn-xs" data-receive="${s.id}">Receive</button>
            <button class="btn btn-ghost btn-xs" data-cancel="${s.id}">Cancel</button>
          </div>
        </div>
        <div class="shipment-products">
          ${s.products.map(p => `<span class="shipment-product-tag"><strong>${esc(p.product)}</strong> · ${p.serials.length} unit${p.serials.length!==1?'s':''}</span>`).join('')}
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-receive]').forEach(btn => {
      btn.addEventListener('click', () => showReceiveModal(parseInt(btn.dataset.receive)));
    });
    container.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Cancel this shipment? The serials will be removed.')) {
          DB.removeShipment(parseInt(btn.dataset.cancel));
          renderTransitList();
          renderDashboard();
        }
      });
    });
  }

  function showReceiveModal(shipmentId) {
    const { shipments } = DB.getData();
    const s = shipments.find(x => x.id === shipmentId);
    if (!s) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">Receive shipment</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:1rem;">${s.products.reduce((a,p)=>a+p.serials.length,0)} units from ${esc(s.supplier||'supplier')}</div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Confirm location *</label>
          <input class="fi" id="modal-loc" value="${esc(s.location||'')}" placeholder="e.g. SF Warehouse" list="modal-loc-list" />
          <datalist id="modal-loc-list">${Inventory.getLocations().map(l=>`<option value="${esc(l)}">`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Received by</label>
          <input class="fi" id="modal-by" placeholder="e.g. Peter Roberts" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-success" id="modal-confirm-btn">Receive into stock</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('modal-cancel-btn').addEventListener('click', () => overlay.remove());
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      const loc = document.getElementById('modal-loc').value.trim();
      const by  = document.getElementById('modal-by').value.trim();
      try {
        Inventory.receiveShipment(shipmentId, by, loc);
        overlay.remove();
        renderTransitList();
        renderDashboard();
        showAlert(`Shipment received into stock at ${loc}`, 'success');
      } catch (err) { showAlert(err.message, 'error'); }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Stock Deployed ────────────────────────────────────────────────────
  function renderDeployed() {
    const search  = (document.getElementById('dep-search').value || '').toLowerCase();
    const catF    = document.getElementById('dep-cat-filter').value;
    const custF   = document.getElementById('dep-customer-filter').value;

    let rows = Inventory.getDeployedSerialRows().filter(r => {
      const ms = !search  || r.serial.toLowerCase().includes(search) || r.product.toLowerCase().includes(search) || r.customer.toLowerCase().includes(search);
      const mc = !catF    || r.category === catF;
      const mcu= !custF   || r.customer === custF;
      return ms && mc && mcu;
    });

    const totalCost    = rows.filter(r => r.cost != null).reduce((a, r) => a + r.cost, 0);
    const costedCount  = rows.filter(r => r.cost != null).length;

    const tbody = document.getElementById('dep-body');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No deployed stock found</div></td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => `<tr>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category || '—')}</span></td>
        <td><strong>${esc(r.customer || '—')}</strong></td>
        <td style="font-size:11px;color:var(--text-muted)">${esc(r.by || '—')}</td>
        <td style="font-size:11px;color:var(--text-hint)">${fmtDateFull(r.date)}</td>
        <td style="font-size:12px">${r.cost != null ? '$' + r.cost.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : '<span style="color:var(--text-hint)">—</span>'}</td>
      </tr>`).join('');
    }

    const footer = document.getElementById('dep-footer');
    footer.textContent = rows.length
      ? `${rows.length} unit${rows.length!==1?'s':''} deployed${costedCount > 0 ? ` · Total cost: $${totalCost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''}`
      : '';
  }

  function populateDeployedFilters() {
    const customers = Inventory.getCustomers();
    const sel = document.getElementById('dep-customer-filter');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All customers</option>' + customers.map(c => `<option value="${esc(c)}"${c===cur?' selected':''}>${esc(c)}</option>`).join('');
  }

  function exportDeployedCSV() {
    const rows = [['Serial Number','Product','Category','Customer / Account','Dispatched By','Date Deployed','Reference','Cost']];
    Inventory.getDeployedSerialRows().forEach(r => {
      rows.push([r.serial, r.product, r.category, r.customer, r.by, fmtDateFull(r.date), r.ref, r.cost != null ? r.cost : '']);
    });
    _dlCSV(rows, 'aio_stock_deployed.csv');
  }

  // ── Stock Deployed ────────────────────────────────────────────────────
  function renderStockList() {
    const search  = (document.getElementById('inv-search').value || '').toLowerCase();
    const catF    = document.getElementById('inv-cat-filter').value;
    const locF    = document.getElementById('inv-loc-filter').value;
    const statusF = document.getElementById('inv-status-filter').value;

    let rows = Inventory.getAllSerialRows().filter(r => {
      const ms = !search || r.serial.toLowerCase().includes(search) || r.product.toLowerCase().includes(search) || r.location.toLowerCase().includes(search);
      const mc = !catF   || r.category === catF;
      const ml = !locF   || r.location === locF;
      const mst= !statusF|| r.status === statusF;
      return ms && mc && ml && mst;
    });

    const totalCost = rows.filter(r => r.cost != null).reduce((a, r) => a + r.cost, 0);
    const costedCount = rows.filter(r => r.cost != null).length;

    const tbody = document.getElementById('inv-body');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty">No items found</div></td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => `<tr>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
        <td><span class="loc-badge">${esc(r.location||'—')}</span></td>
        <td>
          <span class="badge ${r.status==='in-stock'?'b-ok':'b-transit'}">${r.status==='in-stock'?'In stock':'In transit'}</span>
          ${r.used ? '<span class="badge b-used" style="margin-left:4px;">USED</span>' : ''}
        </td>
        <td class="cost-cell" data-product="${esc(r.product)}" data-serial="${esc(r.serial)}" style="cursor:pointer;" title="Click to edit — updates all ${esc(r.product)} units">
          ${r.cost != null
            ? `<span class="cost-val">$${r.cost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>`
            : `<span style="color:var(--text-hint);font-size:11px">+ Add cost</span>`}
        </td>
      </tr>`).join('');

      // Inline cost editor — click to edit, propagates to ALL serials of that product
      tbody.querySelectorAll('.cost-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          if (cell.querySelector('input')) return;
          const product = cell.dataset.product;
          const serial  = cell.dataset.serial;
          const cur = DB.getSerialCost(serial);
          cell.innerHTML = `<div style="display:flex;align-items:center;gap:4px;">
            <input class="serial-cost-input" type="number" min="0" step="0.01"
              value="${cur != null ? cur : ''}" placeholder="0.00" style="width:85px;" />
            <span style="font-size:10px;color:var(--aio-purple);white-space:nowrap">all ${esc(product)}</span>
          </div>`;
          const inp = cell.querySelector('input');
          inp.focus(); inp.select();
          const save = () => {
            const cost = inp.value !== '' ? parseFloat(inp.value) : null;
            DB.setProductCost(product, cost, Inventory.getInventoryMap());
            renderStockList();
          };
          inp.addEventListener('blur', save);
          inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
            if (e.key === 'Escape') { inp.removeEventListener('blur', save); renderStockList(); }
          });
        });
      });
    }

    const footer = document.getElementById('inv-footer');
    footer.textContent = rows.length
      ? `${rows.length} serial${rows.length!==1?'s':''} shown${costedCount > 0 ? ` · Total cost: $${totalCost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} (${costedCount} priced)` : ' · Click any cost cell to add/edit price'}`
      : '';
  }

  function populateStockListFilters() {
    const locs = Inventory.getLocations();
    const sel  = document.getElementById('inv-loc-filter');
    const cur  = sel.value;
    sel.innerHTML = '<option value="">All locations</option>' + locs.map(l => `<option value="${esc(l)}"${l===cur?' selected':''}>${esc(l)}</option>`).join('');
  }

  // ── History ───────────────────────────────────────────────────────────
  function renderHistory() {
    const search   = (document.getElementById('hist-search').value || '').toLowerCase();
    const typeF    = document.getElementById('hist-type-filter').value;
    const catF     = document.getElementById('hist-cat-filter').value;
    const dateFrom = document.getElementById('hist-date-from').value;
    const dateTo   = document.getElementById('hist-date-to').value;
    const { movements } = DB.getData();

    let rows = [...movements].reverse().filter(m => {
      const mt = !typeF  || m.type === typeF;
      const mc = !catF   || m.category === catF;
      const ms = !search || m.product.toLowerCase().includes(search) || (m.customer||'').toLowerCase().includes(search) || (m.supplier||'').toLowerCase().includes(search) || (m.ref||'').toLowerCase().includes(search) || (m.location||'').toLowerCase().includes(search) || (m.receivedBy||'').toLowerCase().includes(search) || m.serials.some(s => s.toLowerCase().includes(search));
      const mdf= !dateFrom || m.date.slice(0,10) >= dateFrom;
      const mdt= !dateTo   || m.date.slice(0,10) <= dateTo;
      return mt && mc && ms && mdf && mdt;
    });

    const totalIn  = rows.filter(m => m.type==='IN').reduce((a,m) => a+m.serials.length, 0);
    const totalOut = rows.filter(m => m.type==='OUT').reduce((a,m) => a+m.serials.length, 0);
    document.getElementById('hist-summary').textContent = rows.length
      ? `${rows.length} movement${rows.length!==1?'s':''} · ${totalIn} received · ${totalOut} dispatched`
      : '';

    const tbody = document.getElementById('hist-body');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No movements found</div></td></tr>'; return; }
    tbody.innerHTML = rows.map(m => {
      const party   = m.type==='IN' ? (m.supplier||'—') : (m.customer||'—');
      const preview = m.serials.slice(0,3).join(', ') + (m.serials.length>3 ? ` +${m.serials.length-3}` : '');
      return `<tr title="${esc(m.serials.join(', '))}">
        <td style="color:var(--text-hint)">${fmtDateFull(m.date)}</td>
        <td><span class="badge ${m.type==='IN'?'b-in':'b-out'}">${m.type}</span></td>
        <td style="font-weight:500">${esc(m.product)}</td>
        <td><span class="cat-badge">${esc(m.category||'—')}</span></td>
        <td><span class="loc-badge">${esc(m.location||'—')}</span></td>
        <td>${m.serials.length}</td>
        <td>${esc(party)}</td>
        <td class="serial-mono">${esc(preview)}</td>
      </tr>`;
    }).join('');
  }

  // ── Serial Lookup ─────────────────────────────────────────────────────
  function renderLookup(raw) {
    const res = document.getElementById('lookup-result');
    if (!raw || !raw.trim()) { res.innerHTML = '<div class="empty">Enter a serial number above</div>'; return; }
    const info = Inventory.getSerialInfo(raw);
    const cost = DB.getSerialCost(raw);
    const costStr = cost != null ? `$${cost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
    if (info.history.length === 0 && info.status === 'unknown') {
      res.innerHTML = `<div class="lookup-not-found">Serial <code>${esc(info.serial)}</code> not found in any record.</div>`;
      return;
    }
    const statusBadge = info.status==='in-stock' ? '<span class="badge b-ok">In stock</span>' : info.status==='in-transit' ? '<span class="badge b-transit">In transit</span>' : '<span class="badge b-out">Dispatched</span>';
    const lastOut = info.history.filter(m=>m.type==='OUT').slice(-1)[0];
    res.innerHTML = `
      <div class="lookup-status-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-family:var(--mono);font-size:15px;font-weight:600">${esc(info.serial)}</span>${statusBadge}
          ${cost != null ? `<span style="font-size:12px;color:var(--text-muted)">Cost: <strong>${costStr}</strong></span>` : ''}
        </div>
        <div class="lookup-meta">
          <div><div class="lookup-meta-label">Product</div>${esc(info.currentProduct||'—')}</div>
          <div><div class="lookup-meta-label">Location</div><span class="loc-badge">${esc(info.currentLocation||'—')}</span></div>
          <div><div class="lookup-meta-label">Category</div>${esc(info.currentCategory||'—')}</div>
        </div>
        ${info.status==='dispatched' && lastOut ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">Last dispatched to: <strong>${esc(lastOut.customer||'—')}</strong></div>` : ''}
      </div>
      ${info.history.length ? `<div class="panel" style="margin-bottom:0">
        <div class="panel-title">Movement history</div>
        <table><thead><tr><th style="width:18%">Date</th><th style="width:10%">Type</th><th style="width:22%">Product</th><th style="width:18%">Location</th><th style="width:18%">Party</th><th style="width:14%">Ref</th></tr></thead>
        <tbody>${info.history.map(m=>`<tr><td style="color:var(--text-hint)">${fmtDateFull(m.date)}</td><td><span class="badge ${m.type==='IN'?'b-in':'b-out'}">${m.type}</span></td><td>${esc(m.product)}</td><td><span class="loc-badge">${esc(m.location||'—')}</span></td><td>${esc(m.type==='IN'?(m.supplier||'—'):(m.customer||'—'))}</td><td style="color:var(--text-hint)">${esc(m.ref||'—')}</td></tr>`).join('')}</tbody></table>
      </div>` : ''}`;
  }

  // ── Datalists ─────────────────────────────────────────────────────────
  function populateDataLists() {
    const set = (id, items) => { const el = document.getElementById(id); if (el) el.innerHTML = items.map(v => `<option value="${esc(v)}">`).join(''); };
    set('loc-list',      Inventory.getLocations());
    set('tr-loc-list',   Inventory.getLocations());
    set('customer-list', Inventory.getCustomers());
  }

  // ── CSV exports ───────────────────────────────────────────────────────
  function exportInventoryCSV() {
    const rows = [['Serial Number','Product','Category','Location','Status','Cost']];
    Inventory.getAllSerialRows().forEach(r => {
      rows.push([r.serial, r.product, r.category, r.location, r.status, r.cost != null ? r.cost : '']);
    });
    _dlCSV(rows, 'aio_stock.csv');
  }

  function exportHistoryCSV() {
    const { movements } = DB.getData();
    const rows = [['Date','Type','Product','Category','Location','Qty','Supplier / Customer','Received By','Reference','Serials']];
    [...movements].reverse().forEach(m => rows.push([fmtDateFull(m.date), m.type, m.product, m.category||'', m.location||'', m.serials.length, m.type==='IN'?(m.supplier||''):(m.customer||''), m.type==='IN'?(m.receivedBy||''):(m.by||''), m.ref||'', m.serials.join(' | ')]));
    _dlCSV(rows, 'aio_history.csv');
  }

  function _dlCSV(rows, name) {
    const csv = rows.map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(iso)     { return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function fmtDateFull(iso) { return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }

  return { showAlert, hideAlert, renderDashboard, renderTransitList, renderStockList, populateStockListFilters, renderDeployed, populateDeployedFilters, exportDeployedCSV, renderHistory, renderLookup, populateDataLists, exportInventoryCSV, exportHistoryCSV };
})();
