/**
 * app.js — event wiring, navigation, product row management
 */
(() => {

  // ── Shared product-row builder ────────────────────────────────────────
  // Used by both Stock In and In Transit forms
  function buildProductRowCard(row, idx, total, removeFn, showCost) {
    return `
    <div class="product-row-card" id="rowcard-${row.id}">
      <div class="product-row-header">
        <span class="product-row-num">Product ${idx + 1}</span>
        ${total > 1 ? `<button class="btn-remove-row" data-rowid="${row.id}">×</button>` : ''}
      </div>
      <div class="form-grid g3" style="margin-bottom:10px;">
        <div class="form-group" style="grid-column:span 2;">
          <label class="form-label">Product name *</label>
          <input class="fi" id="${row.id}-product" data-rowid="${row.id}" data-field="product"
            value="${esc(row.product)}" placeholder="e.g. Sunmi M3, Verifone P400" list="product-list" autocomplete="off" />
          <datalist id="product-list"></datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Category *</label>
          <select class="fi" id="${row.id}-category" data-rowid="${row.id}" data-field="category">
            <option value="">Select...</option>
            ${CATEGORIES.map(c => `<option${row.category===c?' selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      ${showCost ? '' : `<div class="form-group" style="margin-bottom:10px;width:180px;">
        <label class="form-label">Low stock alert at</label>
        <input class="fi" id="${row.id}-threshold" data-rowid="${row.id}" data-field="threshold"
          type="number" min="0" value="${esc(row.threshold)}" placeholder="e.g. 5 (default 3)" />
      </div>`}
      <div class="form-group">
        <label class="form-label">Serial numbers *</label>
        <input class="fi fi-mono" id="${row.id}-serial-field" data-rowid="${row.id}"
          placeholder="Type or scan → Enter. Paste multiple lines for bulk." />
        <div class="hint">Enter or comma to add one · Paste a list to bulk import${showCost ? ' · Add cost per unit below' : ''}</div>
        <div class="serial-row-list" id="${row.id}-serial-list"></div>
        <div class="hint" id="${row.id}-count">0 serials</div>
      </div>
    </div>`;
  }

  // ── Serial row renderer (with cost field) ─────────────────────────────
  function renderSerialRows(rowId, serials, serialCosts, showCost) {
    const container = document.getElementById(`${rowId}-serial-list`);
    if (!container) return;
    if (showCost) {
      container.innerHTML = serials.map(s => `
        <div class="serial-row-item">
          <span class="serial-row-tag">${esc(s)}</span>
          <input class="serial-cost-input" type="number" min="0" step="0.01"
            placeholder="Cost $" value="${serialCosts[s] != null ? serialCosts[s] : ''}"
            data-rowid="${rowId}" data-serial="${esc(s)}" />
          <button class="serial-row-x" data-rowid="${rowId}" data-serial="${esc(s)}">×</button>
        </div>`).join('');
      container.querySelectorAll('.serial-cost-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const r = _findRow(inp.dataset.rowid);
          if (r) r.serialCosts[inp.dataset.serial] = inp.value ? parseFloat(inp.value) : null;
        });
      });
    } else {
      container.innerHTML = serials.map(s => `
        <div class="serial-row-item">
          <span class="serial-row-tag">${esc(s)}</span>
          <button class="serial-row-x" data-rowid="${rowId}" data-serial="${esc(s)}">×</button>
        </div>`).join('');
    }
    container.querySelectorAll('.serial-row-x').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = _findRow(btn.dataset.rowid);
        if (r) { r.serials = r.serials.filter(s => s !== btn.dataset.serial); delete r.serialCosts[btn.dataset.serial]; renderSerialRows(r.id, r.serials, r.serialCosts, showCost); updateCount(r.id); }
      });
    });
    updateCount(rowId);
  }

  function updateCount(rowId) {
    const r  = _findRow(rowId);
    const el = document.getElementById(`${rowId}-count`);
    if (el && r) el.textContent = `${r.serials.length} serial${r.serials.length!==1?'s':''}`;
  }

  function addSerialToRow(rowId, raw, showCost) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    const r = _findRow(rowId);
    if (!r || r.serials.includes(v)) return;
    r.serials.push(v);
    renderSerialRows(r.id, r.serials, r.serialCosts, showCost);
  }

  function wireSerialField(rowId, showCost) {
    const el = document.getElementById(`${rowId}-serial-field`);
    if (!el) return;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        el.value.split(/[,\n]+/).map(v=>v.trim()).filter(Boolean).forEach(v => addSerialToRow(rowId, v, showCost));
        el.value = '';
      }
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData||window.clipboardData).getData('text');
      text.split(/[\n,\t]+/).map(v=>v.trim()).filter(Boolean).forEach(v => addSerialToRow(rowId, v, showCost));
      el.value = '';
    });
  }

  function syncRowFields(row) {
    ['product','category','threshold'].forEach(f => {
      const el = document.getElementById(`${row.id}-${f}`);
      if (el) row[f] = el.value.trim ? el.value.trim() : el.value;
    });
  }

  // ── Stock In ──────────────────────────────────────────────────────────
  let inRows = [];
  let _inCounter = 0;
  function newInRow() { return { id: 'in' + (++_inCounter), product: '', category: '', threshold: '', serials: [], serialCosts: {} }; }

  function renderInRows() {
    const c = document.getElementById('product-rows');
    if (!c) return;
    c.innerHTML = inRows.map((r, i) => buildProductRowCard(r, i, inRows.length, removeInRow, true)).join('');
    inRows.forEach(r => { renderSerialRows(r.id, r.serials, r.serialCosts, true); wireSerialField(r.id, true); });
    c.querySelectorAll('.btn-remove-row').forEach(btn => btn.addEventListener('click', () => removeInRow(btn.dataset.rowid)));
    c.querySelectorAll('[data-field]').forEach(el => el.addEventListener('change', () => { const r = _findRow(el.dataset.rowid); if(r) r[el.dataset.field] = el.value; }));
  }

  function removeInRow(id) { if (inRows.length <= 1) return; inRows = inRows.filter(r => r.id !== id); renderInRows(); }

  function clearStockIn() {
    document.getElementById('in-supplier').value    = '';
    document.getElementById('in-loc').value         = '';
    document.getElementById('in-received-by').value = '';
    inRows = [newInRow()]; renderInRows();
  }

  function submitStockIn() {
    inRows.forEach(syncRowFields);
    try {
      Inventory.stockIn({
        supplier:   document.getElementById('in-supplier').value.trim(),
        location:   document.getElementById('in-loc').value.trim(),
        receivedBy: document.getElementById('in-received-by').value.trim(),
        products:   inRows,
      });
      const total = inRows.reduce((a, r) => a + r.serials.length, 0);
      const loc   = document.getElementById('in-loc').value.trim();
      clearStockIn();
      UI.showAlert(`${total} unit${total!==1?'s':''} received at ${loc}`, 'success');
    } catch (err) { UI.showAlert(err.message, 'error'); }
  }

  // ── In Transit ────────────────────────────────────────────────────────
  let trRows = [];
  let _trCounter = 0;
  function newTrRow() { return { id: 'tr' + (++_trCounter), product: '', category: '', serials: [], serialCosts: {} }; }

  function renderTrRows() {
    const c = document.getElementById('transit-product-rows');
    if (!c) return;
    c.innerHTML = trRows.map((r, i) => buildProductRowCard(r, i, trRows.length, removeTrRow, true)).join('');
    trRows.forEach(r => { renderSerialRows(r.id, r.serials, r.serialCosts, true); wireSerialField(r.id, true); });
    c.querySelectorAll('.btn-remove-row').forEach(btn => btn.addEventListener('click', () => removeTrRow(btn.dataset.rowid)));
    c.querySelectorAll('[data-field]').forEach(el => el.addEventListener('change', () => { const r = _findRow(el.dataset.rowid); if(r) r[el.dataset.field] = el.value; }));
  }

  function removeTrRow(id) { if (trRows.length <= 1) return; trRows = trRows.filter(r => r.id !== id); renderTrRows(); }

  function clearTransitForm() {
    ['tr-supplier','tr-loc','tr-expected'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    trRows = [newTrRow()]; renderTrRows();
  }

  function submitTransit() {
    trRows.forEach(syncRowFields);
    try {
      Inventory.createShipment({
        supplier:   document.getElementById('tr-supplier').value.trim(),
        location:   document.getElementById('tr-loc').value.trim(),
        expectedBy: document.getElementById('tr-expected').value,
        products:   trRows,
      });
      const total = trRows.reduce((a, r) => a + r.serials.length, 0);
      clearTransitForm();
      UI.renderTransitList();
      UI.renderDashboard();
      UI.showAlert(`${total} unit${total!==1?'s':''} registered as in transit`, 'success');
    } catch (err) { UI.showAlert(err.message, 'error'); }
  }

  // ── Stock Out ─────────────────────────────────────────────────────────
  let serialsOut = [];
  function addSerialOut(raw) {
    const v = raw.trim().toUpperCase();
    if (!v || serialsOut.includes(v)) return;
    serialsOut.push(v); renderOutTags();
  }
  function removeSerialOut(s) { serialsOut = serialsOut.filter(x => x !== s); renderOutTags(); }
  function renderOutTags() {
    const avail = Inventory.getAvailableSerials();
    const c = document.getElementById('out-tags');
    c.innerHTML = serialsOut.map(s => {
      const ok = avail.has(s);
      return `<span class="stag ${ok?'stag-out':'stag-err'}">${esc(s)}${ok?'':' ✗'}<span class="stag-x" data-serial="${esc(s)}">×</span></span>`;
    }).join('');
    c.querySelectorAll('.stag-x').forEach(x => x.addEventListener('click', () => removeSerialOut(x.dataset.serial)));
    const hasInvalid = serialsOut.some(s => !avail.has(s));
    document.getElementById('out-serial-count').textContent = serialsOut.length + ' serial' + (serialsOut.length!==1?'s':'') + (hasInvalid ? ' — some not in stock' : '');
  }
  function clearStockOut() {
    ['out-customer','out-by','out-ref'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
    serialsOut=[]; renderOutTags();
  }
  function submitStockOut() {
    try {
      const customer = document.getElementById('out-customer').value.trim();
      Inventory.stockOut({ customer, by: document.getElementById('out-by').value.trim(), ref: document.getElementById('out-ref').value.trim(), serials: serialsOut });
      const qty = serialsOut.length;
      clearStockOut();
      UI.showAlert(`${qty} unit${qty!==1?'s':''} dispatched to "${customer}"`, 'success');
    } catch(err) { UI.showAlert(err.message, 'error'); }
  }

  // ── Navigation ────────────────────────────────────────────────────────
  const VIEWS = ['dashboard','transit','in','out','stock-list','deployed','reports','lookup','history'];

  function showView(view) {
    VIEWS.forEach(v => { document.getElementById('v-' + v).style.display = v === view ? '' : 'none'; });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    UI.hideAlert();
    if (view === 'dashboard')  UI.renderDashboard();
    if (view === 'transit')    { UI.populateDataLists(); if (!trRows.length) trRows=[newTrRow()]; renderTrRows(); UI.renderTransitList(); }
    if (view === 'stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    if (view === 'deployed')   { UI.populateDeployedFilters(); UI.renderDeployed(); }
    if (view === 'reports')    Reports.renderAll();
    if (view === 'history')    UI.renderHistory();
    if (view === 'in')         { UI.populateDataLists(); if (!inRows.length) inRows=[newInRow()]; renderInRows(); }
    if (view === 'out')        UI.populateDataLists();
    if (view === 'lookup')     setTimeout(() => document.getElementById('lookup-input').focus(), 50);
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

  // ── Bindings ──────────────────────────────────────────────────────────
  function bind(id, ev, fn) { const el=document.getElementById(id); if(el) el.addEventListener(ev, fn); }

  bind('btn-add-product',       'click', () => { inRows.push(newInRow()); renderInRows(); });
  bind('btn-add-transit-product','click',() => { trRows.push(newTrRow()); renderTrRows(); });
  bind('btn-submit-in',         'click', submitStockIn);
  bind('btn-submit-transit',    'click', submitTransit);
  bind('btn-clear-out',         'click', clearStockOut);
  bind('btn-submit-out',        'click', submitStockOut);
  bind('btn-export-inv',        'click', UI.exportInventoryCSV);
  bind('btn-export-deployed',   'click', UI.exportDeployedCSV);
  bind('btn-export-hist',       'click', UI.exportHistoryCSV);

  bind('dep-search',         'input',  () => UI.renderDeployed());
  bind('dep-cat-filter',     'change', () => UI.renderDeployed());
  bind('dep-customer-filter','change', () => UI.renderDeployed());
  bind('btn-lookup',            'click', () => UI.renderLookup(document.getElementById('lookup-input').value));

  bind('inv-search',       'input',  () => UI.renderStockList());
  bind('inv-cat-filter',   'change', () => UI.renderStockList());
  bind('inv-loc-filter',   'change', () => UI.renderStockList());
  bind('inv-status-filter','change', () => UI.renderStockList());

  bind('hist-search',      'input',  () => UI.renderHistory());
  bind('hist-type-filter', 'change', () => UI.renderHistory());
  bind('hist-cat-filter',  'change', () => UI.renderHistory());
  bind('hist-date-from',   'change', () => UI.renderHistory());
  bind('hist-date-to',     'change', () => UI.renderHistory());

  const outField = document.getElementById('out-serial-field');
  if (outField) {
    outField.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===',') { e.preventDefault(); outField.value.split(/[,\n]+/).map(v=>v.trim()).filter(Boolean).forEach(addSerialOut); outField.value=''; }});
    outField.addEventListener('paste', e => { e.preventDefault(); (e.clipboardData||window.clipboardData).getData('text').split(/[\n,\t]+/).map(v=>v.trim()).filter(Boolean).forEach(addSerialOut); outField.value=''; });
  }
  bind('rpt-run',         'click', Reports.renderAll);
  bind('rpt-clear-dates', 'click', () => {
    document.getElementById('rpt-date-from').value = '';
    document.getElementById('rpt-date-to').value   = '';
    Reports.renderAll();
  });
  // Export buttons on each report section
  document.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', () => Reports.exportReport(btn.dataset.export));
  });

  bind('lookup-input','keydown', e => { if(e.key==='Enter') UI.renderLookup(document.getElementById('lookup-input').value); });

  // ── Helpers ───────────────────────────────────────────────────────────
  function _findRow(id) { return [...inRows, ...trRows].find(r => r.id === id); }
  function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Boot ─────────────────────────────────────────────────────────────
  inRows = [newInRow()];
  trRows = [newTrRow()];
  showView('dashboard');

})();
