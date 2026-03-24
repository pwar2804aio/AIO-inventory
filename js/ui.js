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
    const map      = Inventory.getInventoryMap();
    const lowItems = Inventory.getLowStockItems();
    const { movements } = DB.getData();

    document.getElementById('stats-row').innerHTML = `
      <div class="stat"><div class="stat-label">In stock</div><div class="stat-val green">${stats.inStock}</div></div>
      <div class="stat"><div class="stat-label">Total received</div><div class="stat-val">${stats.totalIn}</div></div>
      <div class="stat"><div class="stat-label">Dispatched</div><div class="stat-val red">${stats.totalOut}</div></div>
      <div class="stat"><div class="stat-label">Product lines</div><div class="stat-val">${stats.productLines}</div></div>
      <div class="stat"><div class="stat-label">Locations</div><div class="stat-val">${stats.locations}</div></div>
      <div class="stat"><div class="stat-label">Low stock</div><div class="stat-val amber">${stats.lowCount}</div></div>`;

    const lowBox = document.getElementById('low-alert-box');
    if (lowItems.length > 0) {
      lowBox.style.display = 'block';
      lowBox.textContent = `⚠ Low stock: ${lowItems.map(v => `${v.product} (${v.inStock.size})`).join(', ')}`;
    } else { lowBox.style.display = 'none'; }

    const recent = [...movements].reverse().slice(0, 8);
    document.getElementById('dash-recent').innerHTML = recent.length
      ? `<table><thead><tr><th style="width:38%">Product</th><th style="width:13%">Type</th><th style="width:28%">Location</th><th style="width:21%">Date</th></tr></thead><tbody>
         ${recent.map(m => `<tr><td style="font-weight:500">${esc(m.product)}</td><td><span class="badge ${m.type==='IN'?'b-in':'b-out'}">${m.type}</span></td><td><span class="loc-badge">${esc(m.location||'—')}</span></td><td style="color:var(--text-hint)">${fmtDate(m.date)}</td></tr>`).join('')}
         </tbody></table>`
      : '<div class="empty">No movements yet</div>';

    document.getElementById('dash-low').innerHTML = lowItems.length
      ? `<table><thead><tr><th style="width:45%">Product</th><th style="width:30%">Location</th><th>Stock</th></tr></thead><tbody>
         ${lowItems.map(v => `<tr><td>${esc(v.product)}</td><td><span class="loc-badge">${esc(v.location||'—')}</span></td><td><span class="badge ${v.inStock.size===0?'b-zero':'b-low'}">${v.inStock.size}</span></td></tr>`).join('')}
         </tbody></table>`
      : '<div class="empty" style="padding:1rem">All products well stocked</div>';

    const locMap = {};
    Object.values(map).forEach(v => { const l = v.location || 'Unassigned'; locMap[l] = (locMap[l] || 0) + v.inStock.size; });
    document.getElementById('dash-locations').innerHTML = Object.keys(locMap).length
      ? `<div class="loc-grid">${Object.entries(locMap).map(([loc, qty]) => `<div class="loc-card"><div class="loc-card-label">${esc(loc)}</div><div class="loc-card-val">${qty} <span class="loc-card-sub">units</span></div></div>`).join('')}</div>`
      : '<div class="empty">No location data yet</div>';
  }

  // ── All Stock List ────────────────────────────────────────────────────
  function renderStockList() {
    const search  = (document.getElementById('inv-search').value || '').toLowerCase();
    const catF    = document.getElementById('inv-cat-filter').value;
    const locF    = document.getElementById('inv-loc-filter').value;
    const statusF = document.getElementById('inv-status-filter').value;
    const map     = Inventory.getInventoryMap();

    let rows = Object.values(map).filter(v => {
      const ms = !search || v.product.toLowerCase().includes(search) || v.location.toLowerCase().includes(search) || v.category.toLowerCase().includes(search) || [...v.inStock].some(s => s.toLowerCase().includes(search));
      const mc = !catF   || v.category === catF;
      const ml = !locF   || v.location === locF;
      const key = v.product + '||' + v.location;
      const thr = DB.getThreshold(key);
      const mst = !statusF
        || (statusF === 'in'   && v.inStock.size > thr)
        || (statusF === 'low'  && v.inStock.size > 0 && v.inStock.size <= thr)
        || (statusF === 'zero' && v.inStock.size === 0);
      return ms && mc && ml && mst;
    });

    const tbody = document.getElementById('inv-body');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No items found</div></td></tr>'; return; }

    tbody.innerHTML = rows.map(v => {
      const key       = v.product + '||' + v.location;
      const threshold = DB.getThreshold(key);
      const cls       = v.inStock.size === 0 ? 'b-zero' : v.inStock.size <= threshold ? 'b-low' : 'b-ok';
      const serials   = [...v.inStock].sort();
      const preview   = serials.slice(0, 3).join(', ') + (serials.length > 3 ? ` <button class="expand-link" data-key="${esc(key)}" data-product="${esc(v.product)}">+${serials.length - 3} more</button>` : '');
      return `<tr>
        <td style="font-weight:500">${esc(v.product)}</td>
        <td><span class="cat-badge">${esc(v.category||'—')}</span></td>
        <td><span class="loc-badge">${esc(v.location||'—')}</span></td>
        <td><span class="badge ${cls}">${v.inStock.size}</span></td>
        <td style="color:var(--text-muted)">${v.totalIn}</td>
        <td style="color:var(--text-muted)">${v.totalOut}</td>
        <td style="color:var(--text-hint)">${threshold}</td>
        <td class="serial-mono">${preview || '—'}</td>
      </tr>`;
    }).join('');

    // Wire expand buttons
    tbody.querySelectorAll('.expand-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const key     = btn.dataset.key;
        const product = btn.dataset.product;
        const parts   = key.split('||');
        const loc     = parts[1] || '';
        const mapItem = Inventory.getInventoryMap()[key];
        if (!mapItem) return;
        const serials = [...mapItem.inStock].sort();
        const panel   = document.createElement('div');
        panel.className = 'panel';
        panel.style.marginTop = '1rem';
        panel.innerHTML = `<div class="panel-title">${esc(product)} — all ${serials.length} serials in stock <span style="font-weight:400;text-transform:none">${loc ? '@ ' + loc : ''}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">${serials.map(s => `<span class="stag stag-in">${esc(s)}</span>`).join('')}</div>`;
        const existing = document.getElementById('serial-drilldown');
        if (existing) existing.replaceWith(panel);
        else document.getElementById('v-stock-list').appendChild(panel);
        panel.id = 'serial-drilldown';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  function populateStockListFilters() {
    const locs = Inventory.getLocations();
    const sel  = document.getElementById('inv-loc-filter');
    const cur  = sel.value;
    sel.innerHTML = '<option value="">All locations</option>' + locs.map(l => `<option value="${esc(l)}"${l===cur?' selected':''}>${esc(l)}</option>`).join('');
  }

  // ── History ───────────────────────────────────────────────────────────
  function renderHistory() {
    const search  = (document.getElementById('hist-search').value || '').toLowerCase();
    const typeF   = document.getElementById('hist-type-filter').value;
    const catF    = document.getElementById('hist-cat-filter').value;
    const dateFrom = document.getElementById('hist-date-from').value;
    const dateTo   = document.getElementById('hist-date-to').value;
    const { movements } = DB.getData();

    let rows = [...movements].reverse().filter(m => {
      const mt = !typeF  || m.type === typeF;
      const mc = !catF   || m.category === catF;
      const ms = !search
        || m.product.toLowerCase().includes(search)
        || (m.customer  || '').toLowerCase().includes(search)
        || (m.supplier  || '').toLowerCase().includes(search)
        || (m.ref       || '').toLowerCase().includes(search)
        || (m.location  || '').toLowerCase().includes(search)
        || (m.receivedBy|| '').toLowerCase().includes(search)
        || m.serials.some(s => s.toLowerCase().includes(search));
      const mdf = !dateFrom || m.date.slice(0, 10) >= dateFrom;
      const mdt = !dateTo   || m.date.slice(0, 10) <= dateTo;
      return mt && mc && ms && mdf && mdt;
    });

    // Summary strip
    const totalIn  = rows.filter(m => m.type === 'IN').reduce((a, m) => a + m.serials.length, 0);
    const totalOut = rows.filter(m => m.type === 'OUT').reduce((a, m) => a + m.serials.length, 0);
    document.getElementById('hist-summary').textContent = rows.length
      ? `${rows.length} movement${rows.length !== 1 ? 's' : ''} · ${totalIn} received · ${totalOut} dispatched`
      : '';

    const tbody = document.getElementById('hist-body');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty">No movements found</div></td></tr>'; return; }

    tbody.innerHTML = rows.map(m => {
      const party   = m.type === 'IN' ? (m.supplier || '—') : (m.customer || '—');
      const serialStr = m.serials.join(', ');
      const preview = m.serials.slice(0, 3).join(', ') + (m.serials.length > 3 ? ` +${m.serials.length - 3}` : '');
      return `<tr title="Serials: ${esc(serialStr)}">
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
    if (info.history.length === 0) {
      res.innerHTML = `<div class="lookup-not-found">Serial <code>${esc(info.serial)}</code> not found in any movement record.</div>`;
      return;
    }
    const statusBadge = info.status === 'in-stock'
      ? '<span class="badge b-ok">In stock</span>'
      : '<span class="badge b-out">Dispatched</span>';
    const lastOut = info.history.filter(m => m.type === 'OUT').slice(-1)[0];
    res.innerHTML = `
      <div class="lookup-status-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-family:var(--mono);font-size:15px;font-weight:600">${esc(info.serial)}</span>${statusBadge}
        </div>
        ${info.status === 'in-stock'
          ? `<div class="lookup-meta">
               <div><div class="lookup-meta-label">Product</div>${esc(info.currentProduct||'—')}</div>
               <div><div class="lookup-meta-label">Location</div><span class="loc-badge">${esc(info.currentLocation||'—')}</span></div>
               <div><div class="lookup-meta-label">Category</div>${esc(info.currentCategory||'—')}</div>
             </div>`
          : `<div style="font-size:12px;color:var(--text-muted)">Last dispatched to: <strong>${esc(lastOut?.customer||'—')}</strong></div>`}
      </div>
      <div class="panel" style="margin-bottom:0">
        <div class="panel-title">Full movement history</div>
        <table>
          <thead><tr><th style="width:18%">Date</th><th style="width:10%">Type</th><th style="width:22%">Product</th><th style="width:18%">Location</th><th style="width:18%">Party</th><th style="width:14%">Reference</th></tr></thead>
          <tbody>${info.history.map(m => `<tr>
            <td style="color:var(--text-hint)">${fmtDateFull(m.date)}</td>
            <td><span class="badge ${m.type==='IN'?'b-in':'b-out'}">${m.type}</span></td>
            <td>${esc(m.product)}</td>
            <td><span class="loc-badge">${esc(m.location||'—')}</span></td>
            <td>${esc(m.type==='IN'?(m.supplier||'—'):(m.customer||'—'))}</td>
            <td style="color:var(--text-hint)">${esc(m.ref||'—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Datalists ─────────────────────────────────────────────────────────
  function populateDataLists() {
    const set = (id, items) => { const el = document.getElementById(id); if (el) el.innerHTML = items.map(v => `<option value="${esc(v)}">`).join(''); };
    set('loc-list',      Inventory.getLocations());
    set('customer-list', Inventory.getCustomers());
  }

  // ── CSV ───────────────────────────────────────────────────────────────
  function exportInventoryCSV() {
    const map  = Inventory.getInventoryMap();
    const rows = [['Product','Category','Location','In Stock','Total In','Total Out','Low Stock Threshold','Available Serials']];
    Object.values(map).forEach(v => {
      const key = v.product + '||' + v.location;
      rows.push([v.product, v.category, v.location, v.inStock.size, v.totalIn, v.totalOut, DB.getThreshold(key), [...v.inStock].join(' | ')]);
    });
    _dlCSV(rows, 'aio_inventory.csv');
  }

  function exportHistoryCSV() {
    const { movements } = DB.getData();
    const rows = [['Date','Type','Product','Category','Location','Qty','Supplier / Customer','Received By / By','Reference','Serials']];
    [...movements].reverse().forEach(m => rows.push([
      fmtDateFull(m.date), m.type, m.product, m.category||'', m.location||'', m.serials.length,
      m.type==='IN'?(m.supplier||''):(m.customer||''), m.type==='IN'?(m.receivedBy||''):(m.by||''), m.ref||'', m.serials.join(' | ')
    ]));
    _dlCSV(rows, 'aio_history.csv');
  }

  function _dlCSV(rows, name) {
    const csv  = rows.map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(',')).join('\n');
    const a    = document.createElement('a');
    a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(iso)     { return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function fmtDateFull(iso) { return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }

  return { showAlert, hideAlert, renderDashboard, renderStockList, populateStockListFilters, renderHistory, renderLookup, populateDataLists, exportInventoryCSV, exportHistoryCSV };
})();
