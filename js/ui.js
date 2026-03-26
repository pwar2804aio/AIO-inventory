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
    const recent = [...movements].reverse().slice(0, 10);
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
            <div class="shipment-card-title">${esc(s.supplier || 'Shipment')} → <span class="loc-badge">${esc(s.location || '?')}</span>${s.poNumber ? ` <span class="po-lock-badge">🔒 ${esc(s.poNumber)}</span>` : ''}</div>
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
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No deployed stock found</div></td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => `<tr>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category || '—')}</span></td>
        <td><strong>${esc(r.customer || '—')}</strong></td>
        <td style="font-size:11px;color:var(--text-muted)">${esc(r.by || '—')}</td>
        <td style="font-size:11px;color:var(--text-hint)">${fmtDateFull(r.date)}</td>
        <td style="font-size:12px">${r.cost != null ? '£' + r.cost.toLocaleString('en-GB', {minimumFractionDigits:2,maximumFractionDigits:2}) : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td><button class="btn btn-ghost btn-sm recall-btn" data-serial="${esc(r.serial)}" data-product="${esc(r.product)}" data-location="${esc(r.location||'')}">🔧 Recall</button></td>
      </tr>`).join('');

      // Wire recall buttons
      tbody.querySelectorAll('.recall-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          showRecallModal(btn.dataset.serial, btn.dataset.product, btn.dataset.location);
        });
      });
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
    const isAdmin = typeof Auth !== 'undefined' && Auth.isAdmin();

    let rows = Inventory.getAllSerialRows().filter(r => {
      const ms = !search || r.serial.toLowerCase().includes(search) || r.product.toLowerCase().includes(search) || r.location.toLowerCase().includes(search);
      const mc = !catF   || r.category === catF;
      const ml = !locF   || r.location === locF;
      // Status filter handles both stock status and condition/used flags
      let mst = true;
      if (statusF) {
        if (statusF === 'cond-used') {
          mst = r.used === true;
        } else if (statusF.startsWith('cond-')) {
          mst = r.condition === statusF.replace('cond-', '');
        } else {
          mst = r.status === statusF;
        }
      }
      return ms && mc && ml && mst;
    });

    const totalCost   = rows.filter(r => r.cost != null).reduce((a, r) => a + r.cost, 0);
    const costedCount = rows.filter(r => r.cost != null).length;

    // Update table header to show/hide admin column
    const thead = document.querySelector('#v-stock-list table thead tr');
    if (thead) {
      const existingAdminTh = thead.querySelector('.th-admin');
      if (isAdmin && !existingAdminTh) {
        const th = document.createElement('th');
        th.className = 'th-admin';
        th.style.width = '70px';
        thead.appendChild(th);
      } else if (!isAdmin && existingAdminTh) {
        existingAdminTh.remove();
      }
    }

    const tbody = document.getElementById('inv-body');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}"><div class="empty">No items found</div></td></tr>`;
    } else {
      tbody.innerHTML = rows.map(r => {
        const isPOLocked = !!r.poNumber;
        return `<tr data-serial="${esc(r.serial)}">
          <td style="font-family:var(--mono);font-size:11px;font-weight:500">${
            r.serial.startsWith('NS-')
              ? `<span style="font-family:var(--font);color:var(--text-hint);font-style:italic;font-size:11px;">No serial</span>`
              : esc(r.serial)
          }</td>
          <td style="font-weight:500">${esc(r.product)}</td>
          <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
          <td><span class="loc-badge">${esc(r.location||'—')}</span></td>
          <td>
            <span class="badge ${r.status==='in-stock'?'b-ok':'b-transit'}">${r.status==='in-stock'?'In stock':'In transit'}</span>
            ${r.used ? '<span class="badge b-used" style="margin-left:4px;">USED</span>' : ''}
            ${r.condition ? `<span class="badge b-condition b-cond-${r.condition}" style="margin-left:4px;">${_conditionLabel(r.condition)}</span>` : ''}
          </td>
          <td class="${isPOLocked ? 'cost-cell-locked' : 'cost-cell'}"
            data-product="${esc(r.product)}" data-serial="${esc(r.serial)}"
            style="cursor:${isPOLocked ? 'default' : 'pointer'};"
            ${isPOLocked ? '' : `title="Click to edit — updates all ${esc(r.product)} units"`}>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${r.cost != null
                ? `<span class="cost-val">$${r.cost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>`
                : `<span style="color:var(--text-hint);font-size:11px">${isPOLocked ? '—' : '+ Add cost'}</span>`}
              ${isPOLocked ? `<span class="po-lock-badge" title="Price locked to PO: ${esc(r.poNumber)}">🔒 ${esc(r.poNumber)}</span>` : ''}
            </div>
          </td>
          ${isAdmin ? `<td style="white-space:nowrap;text-align:right;">
            <button class="btn-icon-edit" data-serial="${esc(r.serial)}" data-product="${esc(r.product)}" title="Edit serial number">✎</button>
            <button class="btn-icon-del"  data-serial="${esc(r.serial)}" data-product="${esc(r.product)}" title="Delete this item" style="margin-left:4px;">✕</button>
          </td>` : ''}
        </tr>`;
      }).join('');

      // Cost cell inline editor
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

      // Admin: edit serial
      tbody.querySelectorAll('.btn-icon-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const oldSerial = btn.dataset.serial;
          const product   = btn.dataset.product;
          _showEditSerialModal(oldSerial, product);
        });
      });

      // Admin: delete serial
      tbody.querySelectorAll('.btn-icon-del').forEach(btn => {
        btn.addEventListener('click', () => {
          const serial  = btn.dataset.serial;
          const product = btn.dataset.product;
          if (!confirm(`Delete serial "${serial}" (${product})?\n\nThis will remove it from stock permanently.`)) return;
          DB.deleteSerial(serial);
          renderStockList();
          showAlert(`Serial ${serial} deleted`, 'success');
        });
      });
    }

    const footer = document.getElementById('inv-footer');
    footer.textContent = rows.length
      ? `${rows.length} serial${rows.length!==1?'s':''} shown${costedCount > 0 ? ` · Total cost: $${totalCost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} (${costedCount} priced)` : ' · Click any cost cell to add/edit price'}`
      : '';
  }

  // ── Populate category dropdowns from CATEGORIES constant ─────────────
  function populateCategoryFilters() {
    const cats = CATEGORIES;
    ['inv-cat-filter','dep-cat-filter','hist-cat-filter'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">All categories</option>' +
        cats.map(c => `<option value="${esc(c)}"${c===cur?' selected':''}>${esc(c)}</option>`).join('');
    });
  }

  function populateStockListFilters() {
    populateCategoryFilters();
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
    // PO number autocomplete — both forms share the same PO list
    const poNums = DB.getPONumbers();
    set('po-list',    poNums);
    set('po-list-in', poNums);
  }

  // ── CSV exports ───────────────────────────────────────────────────────
  function exportInventoryCSV() {
    const rows = [['Serial Number','Product','Category','Location','Status','Cost','PO Number']];
    Inventory.getAllSerialRows().forEach(r => {
      rows.push([r.serial, r.product, r.category, r.location, r.status, r.cost != null ? r.cost : '', r.poNumber || '']);
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

  // ── Admin: edit serial modal ──────────────────────────────────────────
  function _showEditSerialModal(oldSerial, product) {
    const existing = document.getElementById('edit-serial-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'edit-serial-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="width:420px;">
        <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
          <span>Edit serial number</span>
          <button class="btn-remove-row" id="edit-serial-close">×</button>
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <label class="form-label">Product</label>
          <div style="font-size:13px;font-weight:500;color:var(--text);padding:6px 0;">${esc(product)}</div>
        </div>
        <div class="form-group" style="margin-bottom:6px;">
          <label class="form-label">Current serial</label>
          <div style="font-family:var(--mono);font-size:13px;color:var(--text-muted);padding:6px 0;">${esc(oldSerial)}</div>
        </div>
        <div class="form-group" style="margin-bottom:1.25rem;">
          <label class="form-label">New serial number *</label>
          <input class="fi fi-mono" id="edit-serial-input" value="${esc(oldSerial)}" placeholder="Enter correct serial number" />
        </div>
        <div id="edit-serial-error" style="display:none;color:var(--danger-text);font-size:12px;margin-bottom:10px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="edit-serial-cancel">Cancel</button>
          <button class="btn btn-primary" id="edit-serial-save">Save</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const input  = document.getElementById('edit-serial-input');
    const errEl  = document.getElementById('edit-serial-error');
    const close  = () => modal.remove();

    document.getElementById('edit-serial-close').addEventListener('click', close);
    document.getElementById('edit-serial-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    setTimeout(() => { input.focus(); input.select(); }, 50);

    document.getElementById('edit-serial-save').addEventListener('click', () => {
      const newSerial = input.value.trim().toUpperCase();
      errEl.style.display = 'none';

      if (!newSerial) { errEl.textContent = 'Serial number is required.'; errEl.style.display = 'block'; return; }
      if (newSerial === oldSerial) { close(); return; }

      // Check new serial doesn't already exist
      const allSerials = Inventory.getAllSerialRows().map(r => r.serial.toUpperCase());
      if (allSerials.includes(newSerial)) {
        errEl.textContent = `Serial "${newSerial}" already exists in stock.`;
        errEl.style.display = 'block';
        return;
      }

      DB.renameSerial(oldSerial, newSerial);
      close();
      renderStockList();
      showAlert(`Serial updated: ${oldSerial} → ${newSerial}`, 'success');
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('edit-serial-save').click();
      if (e.key === 'Escape') close();
    });
  }

  // ── Condition flag helpers ─────────────────────────────────────────────
  function _conditionLabel(c) {
    return { 'used': 'USED', 'faulty': '⚠ FAULTY', 'needs-testing': '🔬 TESTING', 'rma': '⛔ RMA', 'fail-tl': '🗑 TL' }[c] || c.toUpperCase();
  }

  // ── Servicing view ─────────────────────────────────────────────────────
  function renderServicing() {
    const search  = (document.getElementById('svc-search')?.value || '').toLowerCase();
    const flagF   = document.getElementById('svc-flag-filter')?.value || '';
    const isAdmin = typeof Auth !== 'undefined' && Auth.isAdmin();
    const canEdit = typeof Auth !== 'undefined' && Auth.canEdit();

    // Only show needs-testing, faulty, rma — NOT used
    const rows = Inventory.getAllSerialRows().filter(r => {
      if (!r.condition) return false; // only faulty, needs-testing, rma show in servicing
      const mf = !flagF  || r.condition === flagF;
      const ms = !search || r.serial.toLowerCase().includes(search)
                         || r.product.toLowerCase().includes(search)
                         || (r.location||'').toLowerCase().includes(search);
      return mf && ms;
    });

    const tbody = document.getElementById('svc-body');
    const footer = document.getElementById('svc-footer');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No items in servicing</div></td></tr>';
      if (footer) footer.textContent = '';
      return;
    }

    tbody.innerHTML = rows.map(r => `<tr>
      <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
      <td style="font-weight:500">${esc(r.product)}</td>
      <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
      <td><span class="loc-badge">${esc(r.location||'—')}</span></td>
      <td><span class="badge b-condition b-cond-${r.condition}">${_conditionLabel(r.condition)}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${r.testedBy ? esc(r.testedBy) : '<span style="color:var(--text-hint)">—</span>'}</td>
      <td style="font-size:11px;color:var(--text-hint)">${r.testedAt ? fmtDate(r.testedAt) : '—'}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.testNotes)}">${r.testNotes ? esc(r.testNotes) : '<span style="color:var(--text-hint)">—</span>'}</td>
      <td style="text-align:right;">
        ${canEdit ? `<button class="btn btn-primary btn-xs svc-test-btn"
          data-serial="${esc(r.serial)}"
          data-product="${esc(r.product)}"
          data-condition="${esc(r.condition)}">
          Log outcome
        </button>` : ''}
      </td>
    </tr>`).join('');

    if (footer) footer.textContent = `${rows.length} item${rows.length!==1?'s':''} in servicing`;

    // Wire test outcome buttons
    tbody.querySelectorAll('.svc-test-btn').forEach(btn => {
      btn.addEventListener('click', () => _showTestOutcomeModal(btn.dataset.serial, btn.dataset.product, btn.dataset.condition));
    });
  }

  // ── Test outcome modal ─────────────────────────────────────────────────
  async function _showTestOutcomeModal(serial, product, currentCondition) {
    const existing = document.getElementById('svc-modal');
    if (existing) existing.remove();

    // Load users for the "tested by" dropdown
    let users = [];
    try { users = await UserManager.listUsers(); } catch(e) {}
    const currentUser = typeof Auth !== 'undefined' ? Auth.getName() : '';
    const today = new Date().toISOString().slice(0,10);

    const modal = document.createElement('div');
    modal.id = 'svc-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="width:480px;">
        <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
          <span>Log test outcome</span>
          <button class="btn-remove-row" id="svc-modal-close">×</button>
        </div>

        <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;margin-bottom:1.25rem;">
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:3px;">Item</div>
          <div style="font-weight:600;font-size:13px;">${esc(product)}</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(serial)}</div>
          <div style="margin-top:6px;"><span class="badge b-condition b-cond-${currentCondition}">${_conditionLabel(currentCondition)}</span></div>
        </div>

        <div class="form-grid g2" style="margin-bottom:1rem;">
          <div class="form-group">
            <label class="form-label">Tested by *</label>
            <select class="fi" id="svc-tested-by">
              ${users.length
                ? users.map(u => `<option value="${esc(u.name)}"${u.name===currentUser?' selected':''}>${esc(u.name)}</option>`).join('')
                : `<option value="${esc(currentUser)}">${esc(currentUser)}</option>`}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Test date *</label>
            <input class="fi" type="date" id="svc-tested-date" value="${today}" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom:1.25rem;">
          <label class="form-label">Outcome notes</label>
          <textarea class="fi" id="svc-test-notes" rows="3"
            placeholder="Describe what was tested and any findings..."
            style="resize:vertical;font-size:13px;"></textarea>
        </div>

        <div class="form-group" style="margin-bottom:1.5rem;">
          <label class="form-label">Test result *</label>
          <div class="condition-flags">
            <label class="condition-flag-btn">
              <input type="radio" name="svc-outcome" value="pass" checked />
              <span style="color:var(--success-text);">✓ Pass — clear flag</span>
            </label>
            <label class="condition-flag-btn">
              <input type="radio" name="svc-outcome" value="rma" />
              <span style="color:var(--danger-text);">⛔ Fail - RMA</span>
            </label>
            <label class="condition-flag-btn">
              <input type="radio" name="svc-outcome" value="fail-tl" />
              <span style="color:var(--danger-text);">🗑 Fail - TL</span>
            </label>
          </div>
        </div>

        <div id="svc-modal-error" style="display:none;color:var(--danger-text);font-size:12px;margin-bottom:10px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="svc-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="svc-modal-save">Save outcome</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('svc-modal-close').addEventListener('click', close);
    document.getElementById('svc-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('svc-modal-save').addEventListener('click', () => {
      const testedBy   = document.getElementById('svc-tested-by').value.trim();
      const testedDate = document.getElementById('svc-tested-date').value;
      const notes      = document.getElementById('svc-test-notes').value.trim();
      const outcome    = document.querySelector('input[name="svc-outcome"]:checked')?.value;
      const errEl      = document.getElementById('svc-modal-error');

      if (!testedBy)   { errEl.textContent = 'Please select who tested this item.'; errEl.style.display='block'; return; }
      if (!testedDate) { errEl.textContent = 'Please enter the test date.'; errEl.style.display='block'; return; }

      const newCondition = outcome === 'rma' ? 'rma' : outcome === 'fail-tl' ? 'fail-tl' : '';  // db.js preserves USED
      DB.updateSerialCondition(serial, newCondition, testedBy, testedDate, notes);

      close();
      renderServicing();
      if (outcome === 'rma') {
        showAlert(`${serial} marked as RMA`, 'success');
      } else if (outcome === 'fail-tl') {
        showAlert(`${serial} marked as Total Loss`, 'success');
      } else {
        showAlert(`${serial} passed testing — flag cleared`, 'success');
      }
    });
  }

  // ── RMA view ───────────────────────────────────────────────────────────
  function renderRMA() {
    const search  = (document.getElementById('rma-search')?.value || '').toLowerCase();
    const statusF = document.getElementById('rma-status-filter')?.value || '';

    // Build full RMA list — serials that were ever flagged as RMA
    const { movements } = DB.getData();
    const serialInMovement = {};
    movements.forEach(mv => {
      if (mv.type === 'IN') mv.serials.forEach(s => { serialInMovement[s.toUpperCase()] = mv; });
    });

    // All serials currently flagged rma and still in stock = "To Return"
    const inStockRMA = Inventory.getAllSerialRows().filter(r => r.condition === 'rma');

    // Serials that were ever rma but are no longer in stock = "Returned"
    const availableSet = Inventory.getAvailableSerials();
    const returnedRMA = [];
    Object.entries(serialInMovement).forEach(([serial, mv]) => {
      if (mv.condition === 'rma' && !availableSet.has(serial)) {
        // Find the OUT movement for this serial
        const outMv = [...movements].reverse().find(m => m.type === 'OUT' && m.serials.some(s => s.toUpperCase() === serial));
        returnedRMA.push({
          serial,
          product:   mv.product,
          category:  mv.category || '',
          location:  mv.location || '',
          testedBy:  mv.testedBy  || '',
          testedAt:  mv.testedAt  || '',
          testNotes: mv.testNotes || '',
          returnedDate: outMv?.date || '',
          returnedBy:   outMv?.by  || '',
          returnedTo:   outMv?.customer || '',
        });
      }
    });

    // Combine based on filter
    let rows = [];
    if (!statusF || statusF === 'to-return') {
      inStockRMA.forEach(r => rows.push({ ...r, rmaStatus: 'to-return' }));
    }
    if (!statusF || statusF === 'returned') {
      returnedRMA.forEach(r => rows.push({ ...r, rmaStatus: 'returned' }));
    }

    // Apply search
    if (search) {
      rows = rows.filter(r =>
        r.serial.toLowerCase().includes(search) ||
        r.product.toLowerCase().includes(search) ||
        (r.location||'').toLowerCase().includes(search)
      );
    }

    const tbody  = document.getElementById('rma-body');
    const footer = document.getElementById('rma-footer');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty">No RMA items found</div></td></tr>';
      if (footer) footer.textContent = '';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const isReturned = r.rmaStatus === 'returned';
      return `<tr style="${isReturned ? 'opacity:0.65;' : ''}">
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
        <td><span class="loc-badge">${esc(r.location||'—')}</span></td>
        <td>
          ${isReturned
            ? '<span class="badge b-ok" style="font-size:9px;">✓ Returned</span>'
            : '<span class="badge b-cond-rma b-condition" style="font-size:9px;">⛔ To Return</span>'}
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${r.testedBy ? esc(r.testedBy) : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:11px;color:var(--text-hint)">${r.testedAt ? fmtDate(r.testedAt) : '—'}</td>
        <td style="font-size:11px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.testNotes||'')}">${r.testNotes ? esc(r.testNotes) : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:11px;color:var(--text-hint);">${isReturned
          ? (r.returnedDate ? fmtDate(r.returnedDate) : '—') + (r.returnedTo ? `<br><span style="color:var(--text-muted)">${esc(r.returnedTo)}</span>` : '')
          : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${r.cost != null ? '£' + Number(r.cost).toFixed(2) : '<span style="color:var(--text-hint)">—</span>'}</td>
      </tr>`;
    }).join('');

    const toReturnCount = rows.filter(r => r.rmaStatus === 'to-return').length;
    const returnedCount = rows.filter(r => r.rmaStatus === 'returned').length;
    if (footer) {
      footer.innerHTML = toReturnCount > 0
        ? `<span style="color:var(--danger-text);font-weight:600;">${toReturnCount} awaiting return</span>${returnedCount > 0 ? ` · ${returnedCount} returned` : ''} · Use <strong>Stock Out</strong> to mark as returned`
        : `<span style="color:var(--success-text);font-weight:600;">${returnedCount} returned</span>`;
    }
  }

  // ── Total Loss view ────────────────────────────────────────────────────
  function renderTotalLoss() {
    const search  = (document.getElementById('tl-search')?.value || '').toLowerCase();
    const statusF = document.getElementById('tl-status-filter')?.value || '';

    const { movements } = DB.getData();
    const serialInMovement = {};
    movements.forEach(mv => {
      if (mv.type === 'IN') mv.serials.forEach(s => { serialInMovement[s.toUpperCase()] = mv; });
    });

    // Items with fail-tl still in stock = "To Write Off"
    const inStockTL = Inventory.getAllSerialRows().filter(r => r.condition === 'fail-tl');

    // Items with fail-tl that have been booked out = "Written Off"
    const availableSet = Inventory.getAvailableSerials();
    const writtenOff = [];
    Object.entries(serialInMovement).forEach(([serial, mv]) => {
      if (mv.condition === 'fail-tl' && !availableSet.has(serial)) {
        const outMv = [...movements].reverse().find(m => m.type === 'OUT' && m.serials.some(s => s.toUpperCase() === serial));
        writtenOff.push({
          serial,
          product:   mv.product,
          category:  mv.category || '',
          location:  mv.location || '',
          testedBy:  mv.testedBy  || '',
          testedAt:  mv.testedAt  || '',
          testNotes: mv.testNotes || '',
          writtenOffDate: outMv?.date || '',
          writtenOffBy:   outMv?.by   || '',
          writtenOffTo:   outMv?.customer || '',
        });
      }
    });

    let rows = [];
    if (!statusF || statusF === 'to-writeoff') inStockTL.forEach(r => rows.push({ ...r, tlStatus: 'to-writeoff' }));
    if (!statusF || statusF === 'written-off') writtenOff.forEach(r => rows.push({ ...r, tlStatus: 'written-off' }));

    if (search) {
      rows = rows.filter(r =>
        r.serial.toLowerCase().includes(search) ||
        r.product.toLowerCase().includes(search) ||
        (r.location||'').toLowerCase().includes(search)
      );
    }

    const tbody  = document.getElementById('tl-body');
    const footer = document.getElementById('tl-footer');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty">No Total Loss items found</div></td></tr>';
      if (footer) footer.textContent = '';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const isWrittenOff = r.tlStatus === 'written-off';
      return `<tr style="${isWrittenOff ? 'opacity:0.65;' : ''}">
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
        <td><span class="loc-badge">${esc(r.location||'—')}</span></td>
        <td>
          ${isWrittenOff
            ? '<span class="badge b-ok" style="font-size:9px;">✓ Written Off</span>'
            : '<span class="badge b-cond-fail-tl b-condition" style="font-size:9px;">🗑 To Write Off</span>'}
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${r.testedBy ? esc(r.testedBy) : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:11px;color:var(--text-hint)">${r.testedAt ? fmtDate(r.testedAt) : '—'}</td>
        <td style="font-size:11px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.testNotes||'')}">${r.testNotes ? esc(r.testNotes) : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:11px;color:var(--text-hint);">${isWrittenOff
          ? (r.writtenOffDate ? fmtDate(r.writtenOffDate) : '—') + (r.writtenOffTo ? `<br><span style="color:var(--text-muted)">${esc(r.writtenOffTo)}</span>` : '')
          : '<span style="color:var(--text-hint)">—</span>'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${r.cost != null ? '£' + Number(r.cost).toFixed(2) : '<span style="color:var(--text-hint)">—</span>'}</td>
      </tr>`;
    }).join('');

    const toWriteOffCount = rows.filter(r => r.tlStatus === 'to-writeoff').length;
    const writtenOffCount = rows.filter(r => r.tlStatus === 'written-off').length;
    if (footer) {
      footer.innerHTML = toWriteOffCount > 0
        ? `<span style="color:var(--danger-text);font-weight:600;">${toWriteOffCount} awaiting write-off</span>${writtenOffCount > 0 ? ` · ${writtenOffCount} written off` : ''} · Use <strong>Stock Out</strong> to book out`
        : `<span style="color:var(--success-text);font-weight:600;">${writtenOffCount} written off</span>`;
    }
  }

  // ── Stock RMA/TL Dispatched view ────────────────────────────────────────
  function renderRmaTlDispatched() {
    const search = (document.getElementById('rmatldisp-search')?.value || '').toLowerCase();
    const typeF  = document.getElementById('rmatldisp-type-filter')?.value || '';

    let rows = Inventory.getRmaTlDispatchedRows();

    if (typeF) rows = rows.filter(r => r.rmaTlType === typeF);
    if (search) {
      rows = rows.filter(r =>
        r.serial.toLowerCase().includes(search) ||
        r.product.toLowerCase().includes(search) ||
        (r.customer||'').toLowerCase().includes(search) ||
        (r.category||'').toLowerCase().includes(search)
      );
    }

    const tbody  = document.getElementById('rmatldisp-body');
    const footer = document.getElementById('rmatldisp-footer');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No RMA / Total Loss dispatches found</div></td></tr>';
      if (footer) footer.textContent = '';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const isTL = r.rmaTlType === 'fail-tl';
      const typeBadge = isTL
        ? '<span class="badge b-cond-fail-tl b-condition" style="font-size:9px;">🗑 TL</span>'
        : '<span class="badge b-cond-rma b-condition" style="font-size:9px;">⛔ RMA</span>';
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${esc(r.serial)}</td>
        <td style="font-weight:500">${esc(r.product)}</td>
        <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
        <td>${typeBadge}</td>
        <td style="font-size:12px;">${esc(r.customer||'—')}</td>
        <td style="font-size:12px;color:var(--text-muted)">${esc(r.by||'—')}</td>
        <td style="font-size:11px;color:var(--text-hint)">${r.date ? fmtDate(r.date) : '—'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${r.cost != null ? '£' + Number(r.cost).toFixed(2) : '<span style="color:var(--text-hint)">—</span>'}</td>
      </tr>`;
    }).join('');

    if (footer) {
      const rmaCount = rows.filter(r => r.rmaTlType !== 'fail-tl').length;
      const tlCount  = rows.filter(r => r.rmaTlType === 'fail-tl').length;
      footer.textContent = `${rows.length} dispatched — ${rmaCount} RMA · ${tlCount} Total Loss`;
    }
  }

  // ── Recall to Servicing modal ─────────────────────────────────────────
  function showRecallModal(serial, product, currentLocation) {
    const existing = document.getElementById('recall-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'recall-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="width:440px;">
        <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
          <span>Recall to Servicing</span>
          <button class="btn-remove-row" id="recall-modal-close">×</button>
        </div>
        <div style="margin-bottom:1rem;font-size:13px;color:var(--text-muted);">
          Returning <strong style="color:var(--text);">${esc(serial)}</strong> (${esc(product)}) from deployment back into stock for servicing.
        </div>
        <div class="form-group" style="margin-bottom:1rem;">
          <label class="form-label">Return to location *</label>
          <input class="fi" id="recall-location" placeholder="e.g. SF Warehouse" autocomplete="off" />
        </div>
        <div class="form-group" style="margin-bottom:1rem;">
          <label class="form-label">Recalled by</label>
          <input class="fi" id="recall-by" placeholder="e.g. Peter Roberts" />
        </div>
        <div class="form-group" style="margin-bottom:1.5rem;">
          <label class="form-label">Condition on return</label>
          <div class="condition-flags">
            <label class="condition-flag-btn">
              <input type="radio" name="recall-condition" value="needs-testing" checked />
              <span>🔬 Needs Testing</span>
            </label>
            <label class="condition-flag-btn">
              <input type="radio" name="recall-condition" value="faulty" />
              <span>⚠ Faulty</span>
            </label>
          </div>
        </div>
        <div id="recall-modal-error" style="display:none;color:var(--danger-text);font-size:12px;margin-bottom:10px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-ghost" id="recall-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="recall-modal-confirm">Recall to Servicing</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Init SmartSelect on the location field and pre-fill with current location
    SmartSelect('recall-location', Inventory.getLocations, DB.addCustomLocation);
    const recallLocInput  = document.getElementById('recall-location');
    const recallLocSelect = recallLocInput?.parentNode?.querySelector('.ss-select');
    if (currentLocation && recallLocSelect) {
      const opt = Array.from(recallLocSelect.options).find(o => o.value === currentLocation);
      if (opt) { recallLocSelect.value = currentLocation; }
      recallLocInput.value = currentLocation;
    }

    const close = () => modal.remove();
    document.getElementById('recall-modal-close').addEventListener('click', close);
    document.getElementById('recall-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('recall-modal-confirm').addEventListener('click', () => {
      const location  = document.getElementById('recall-location').value.trim();
      const recalledBy = document.getElementById('recall-by').value.trim();
      const condition = document.querySelector('input[name="recall-condition"]:checked')?.value || 'needs-testing';
      const errEl     = document.getElementById('recall-modal-error');

      if (!location) { errEl.textContent = 'Location is required.'; errEl.style.display = 'block'; return; }

      try {
        Inventory.recallToServicing(serial, location, condition, recalledBy);
        close();
        renderDeployed();
        showAlert(`${serial} recalled to Servicing at ${location}`, 'success');
      } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    });
  }

  // ── SmartSelect ────────────────────────────────────────────────────────
  // Replaces a plain <input> with a styled dropdown of known values + "Add new"
  function SmartSelect(inputId, getOptions, saveNew) {
    const input = document.getElementById(inputId);
    if (!input || input._ssInit) return;
    input._ssInit = true;

    const wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.display = 'none';

    const select = document.createElement('select');
    select.className = 'fi ss-select';
    wrap.appendChild(select);

    const addRow = document.createElement('div');
    addRow.className = 'ss-add-row';
    addRow.innerHTML = `
      <input class="fi ss-new-input" placeholder="Type new value..." autocomplete="off" />
      <button class="btn btn-primary btn-sm ss-confirm-btn">Add</button>
      <button class="btn btn-ghost btn-sm ss-cancel-btn">✕</button>`;
    wrap.appendChild(addRow);
    hideAddRow();

    function hideAddRow() { addRow.style.display = 'none'; }
    function showAddRow() {
      addRow.style.display = 'flex';
      addRow.querySelector('.ss-new-input').value = '';
      addRow.querySelector('.ss-new-input').focus();
    }

    function refresh(selectVal) {
      const opts = getOptions();
      const cur  = selectVal !== undefined ? selectVal : (input.value || '');
      select.innerHTML =
        `<option value="">— Select —</option>` +
        opts.map(o => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('') +
        `<option value="__add__">＋ Add new...</option>`;
      if (cur && opts.includes(cur)) {
        select.value = cur;
        input.value  = cur;
      }
    }

    refresh();

    select.addEventListener('change', () => {
      if (select.value === '__add__') {
        showAddRow();
      } else {
        hideAddRow();
        input.value = select.value;
      }
    });

    addRow.querySelector('.ss-confirm-btn').addEventListener('click', () => {
      const val = addRow.querySelector('.ss-new-input').value.trim();
      if (!val) return;
      saveNew(val);
      hideAddRow();
      refresh(val);
      input.value = val;
    });

    addRow.querySelector('.ss-cancel-btn').addEventListener('click', () => {
      hideAddRow();
      refresh(input.value);
    });

    addRow.querySelector('.ss-new-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') addRow.querySelector('.ss-confirm-btn').click();
      if (e.key === 'Escape') addRow.querySelector('.ss-cancel-btn').click();
    });

    return { refresh: () => refresh() };
  }

  // Init all smart selects — called once after DB is ready
  function initSmartSelects() {
    SmartSelect('in-supplier',  Inventory.getSuppliers,  DB.addCustomSupplier);
    SmartSelect('tr-supplier',  Inventory.getSuppliers,  DB.addCustomSupplier);
    SmartSelect('in-loc',       Inventory.getLocations,  DB.addCustomLocation);
    SmartSelect('tr-loc',       Inventory.getLocations,  DB.addCustomLocation);
  }

  // Refresh all smart selects (called after stock in/transit so new values appear)
  function refreshSmartSelects() {
    ['in-supplier','tr-supplier','in-loc','tr-loc'].forEach(id => {
      const input = document.getElementById(id);
      if (input && input._ssInit) {
        const wrap = input.parentNode;
        const select = wrap.querySelector('.ss-select');
        if (select) {
          const opts = id.includes('supplier') ? Inventory.getSuppliers() : Inventory.getLocations();
          const cur = input.value;
          select.innerHTML =
            `<option value="">— Select —</option>` +
            opts.map(o => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('') +
            `<option value="__add__">＋ Add new...</option>`;
          if (cur) select.value = cur;
        }
      }
    });
  }

    return { showAlert, hideAlert, renderDashboard, renderTransitList, renderStockList, populateStockListFilters, populateCategoryFilters, renderDeployed, populateDeployedFilters, exportDeployedCSV, renderHistory, renderLookup, renderServicing, renderRMA, renderTotalLoss, renderRmaTlDispatched, populateDataLists, exportInventoryCSV, exportHistoryCSV, initSmartSelects, refreshSmartSelects };
})();
