/**
 * app.js — event wiring, navigation, product row management
 */
(() => {

  // ── Product rows state ───────────────────────────────────────────────
  let productRows = [];   // [{ id, product, category, threshold, serials }]
  let _rowCounter = 0;

  function newRow() {
    return { id: ++_rowCounter, product: '', category: '', threshold: '', serials: [] };
  }

  function addProductRow() {
    productRows.push(newRow());
    renderProductRows();
    // Focus new product name field
    const last = productRows[productRows.length - 1];
    const el = document.getElementById(`row-product-${last.id}`);
    if (el) el.focus();
  }

  function removeProductRow(id) {
    if (productRows.length <= 1) return; // always keep at least one
    productRows = productRows.filter(r => r.id !== id);
    renderProductRows();
  }

  function renderProductRows() {
    const container = document.getElementById('product-rows');
    if (!container) return;
    container.innerHTML = productRows.map((row, idx) => `
      <div class="product-row-card" id="rowcard-${row.id}">
        <div class="product-row-header">
          <span class="product-row-num">Product ${idx + 1}</span>
          ${productRows.length > 1
            ? `<button class="btn-remove-row" data-rowid="${row.id}" title="Remove this product">×</button>`
            : ''}
        </div>
        <div class="form-grid g3" style="margin-bottom:10px;">
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label" for="row-product-${row.id}">Product name *</label>
            <input class="fi" id="row-product-${row.id}" data-rowid="${row.id}" data-field="product"
              value="${esc(row.product)}" placeholder="e.g. Verifone P400, Epson TM-T20" list="product-list" autocomplete="off" />
            <datalist id="product-list"></datalist>
          </div>
          <div class="form-group">
            <label class="form-label" for="row-cat-${row.id}">Category *</label>
            <select class="fi" id="row-cat-${row.id}" data-rowid="${row.id}" data-field="category">
              <option value="">Select...</option>
              ${Inventory.CATEGORIES.map(c => `<option${row.category === c ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label" for="row-threshold-${row.id}">Low stock alert threshold</label>
          <input class="fi" id="row-threshold-${row.id}" data-rowid="${row.id}" data-field="threshold"
            type="number" min="0" style="width:160px;" value="${esc(row.threshold)}" placeholder="e.g. 5 (default 3)" />
        </div>
        <div class="form-group">
          <label class="form-label">Serial numbers *</label>
          <input class="fi fi-mono" id="row-serial-field-${row.id}" data-rowid="${row.id}"
            placeholder="Type or scan serial → Enter. Paste multiple lines for bulk import." />
          <div class="hint">Press Enter or comma to add. Paste a newline-separated list to bulk import.</div>
          <div class="serial-area" id="row-serial-tags-${row.id}"></div>
          <div class="hint" id="row-serial-count-${row.id}">${row.serials.length} serials</div>
        </div>
      </div>`).join('');

    // Re-render serial tags for each row
    productRows.forEach(row => renderRowTags(row.id));

    // Wire remove buttons
    container.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', () => removeProductRow(parseInt(btn.dataset.rowid)));
    });

    // Wire text/select inputs → update state
    container.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input',  () => updateRowField(el));
      el.addEventListener('change', () => updateRowField(el));
    });

    // Wire serial entry fields
    productRows.forEach(row => wireSerialField(row.id));
  }

  function updateRowField(el) {
    const id    = parseInt(el.dataset.rowid);
    const field = el.dataset.field;
    const row   = productRows.find(r => r.id === id);
    if (row) row[field] = el.value;
  }

  function renderRowTags(rowId) {
    const row = productRows.find(r => r.id === rowId);
    if (!row) return;
    const container = document.getElementById(`row-serial-tags-${rowId}`);
    if (!container) return;
    container.innerHTML = row.serials.map(s =>
      `<span class="stag stag-in">${esc(s)}<span class="stag-x" data-serial="${esc(s)}" data-rowid="${rowId}">×</span></span>`
    ).join('');
    container.querySelectorAll('.stag-x').forEach(x => {
      x.addEventListener('click', () => {
        const r = productRows.find(r => r.id === parseInt(x.dataset.rowid));
        if (r) { r.serials = r.serials.filter(s => s !== x.dataset.serial); renderRowTags(r.id); updateRowCount(r.id); }
      });
    });
    updateRowCount(rowId);
  }

  function updateRowCount(rowId) {
    const row = productRows.find(r => r.id === rowId);
    const el  = document.getElementById(`row-serial-count-${rowId}`);
    if (el && row) el.textContent = `${row.serials.length} serial${row.serials.length !== 1 ? 's' : ''}`;
  }

  function addSerialToRow(rowId, raw) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    const row = productRows.find(r => r.id === rowId);
    if (!row) return;
    if (row.serials.includes(v)) return;
    row.serials.push(v);
    renderRowTags(rowId);
  }

  function wireSerialField(rowId) {
    const el = document.getElementById(`row-serial-field-${rowId}`);
    if (!el) return;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        el.value.split(/[,\n]+/).map(v => v.trim()).filter(Boolean).forEach(v => addSerialToRow(rowId, v));
        el.value = '';
      }
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      text.split(/[\n,\t]+/).map(v => v.trim()).filter(Boolean).forEach(v => addSerialToRow(rowId, v));
      el.value = '';
    });
  }

  function clearStockIn() {
    document.getElementById('in-supplier').value    = '';
    document.getElementById('in-loc').value         = '';
    document.getElementById('in-received-by').value = '';
    productRows = [newRow()];
    renderProductRows();
  }

  function submitStockIn() {
    const supplier    = document.getElementById('in-supplier').value.trim();
    const location    = document.getElementById('in-loc').value.trim();
    const receivedBy  = document.getElementById('in-received-by').value.trim();

    // Sync any unsaved text inputs
    productRows.forEach(row => {
      const pEl = document.getElementById(`row-product-${row.id}`);
      const cEl = document.getElementById(`row-cat-${row.id}`);
      const tEl = document.getElementById(`row-threshold-${row.id}`);
      if (pEl) row.product   = pEl.value.trim();
      if (cEl) row.category  = cEl.value;
      if (tEl) row.threshold = tEl.value;
    });

    try {
      Inventory.stockIn({ supplier, location, receivedBy, products: productRows });
      const total = productRows.reduce((a, r) => a + r.serials.length, 0);
      const prods = productRows.length;
      clearStockIn();
      UI.showAlert(`${total} unit${total !== 1 ? 's' : ''} across ${prods} product${prods !== 1 ? 's' : ''} received at ${location}`, 'success');
    } catch (err) {
      UI.showAlert(err.message, 'error');
    }
  }

  // ── Stock Out serial state ────────────────────────────────────────────
  let serialsOut = [];

  function addSerialOut(raw) {
    const v = raw.trim().toUpperCase();
    if (!v || serialsOut.includes(v)) return;
    serialsOut.push(v);
    renderOutTags();
  }
  function removeSerialOut(s) { serialsOut = serialsOut.filter(x => x !== s); renderOutTags(); }

  function renderOutTags() {
    const avail = Inventory.getAvailableSerials();
    const container = document.getElementById('out-tags');
    container.innerHTML = serialsOut.map(s => {
      const ok = avail.has(s);
      return `<span class="stag ${ok ? 'stag-out' : 'stag-err'}" title="${ok ? 'In stock' : 'NOT in stock'}">${esc(s)}${ok ? '' : ' ✗'}<span class="stag-x" data-serial="${esc(s)}">×</span></span>`;
    }).join('');
    container.querySelectorAll('.stag-x').forEach(x => x.addEventListener('click', () => removeSerialOut(x.dataset.serial)));
    const hasInvalid = serialsOut.some(s => !avail.has(s));
    document.getElementById('out-serial-count').textContent = serialsOut.length + ' serial' + (serialsOut.length !== 1 ? 's' : '') + (hasInvalid ? ' — some serials not in stock' : '');
  }

  function clearStockOut() {
    ['out-customer','out-by','out-ref'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
    serialsOut = []; renderOutTags();
  }

  function submitStockOut() {
    try {
      const customer = document.getElementById('out-customer').value.trim();
      Inventory.stockOut({ customer, by: document.getElementById('out-by').value.trim(), ref: document.getElementById('out-ref').value.trim(), serials: serialsOut });
      const qty = serialsOut.length;
      clearStockOut();
      UI.showAlert(`${qty} unit${qty !== 1 ? 's' : ''} dispatched to "${customer}"`, 'success');
    } catch (err) { UI.showAlert(err.message, 'error'); }
  }

  // ── Navigation ───────────────────────────────────────────────────────
  const VIEWS = ['dashboard','in','out','stock-list','lookup','history'];

  function showView(view) {
    VIEWS.forEach(v => { document.getElementById('v-' + v).style.display = v === view ? '' : 'none'; });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    UI.hideAlert();
    if (view === 'dashboard')  UI.renderDashboard();
    if (view === 'stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    if (view === 'history')    UI.renderHistory();
    if (view === 'in')         { UI.populateDataLists(); if (productRows.length === 0) productRows = [newRow()]; renderProductRows(); }
    if (view === 'out')        { UI.populateDataLists(); }
    if (view === 'lookup')     { setTimeout(() => document.getElementById('lookup-input').focus(), 50); }
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

  // ── Static event bindings ────────────────────────────────────────────
  function bind(id, ev, fn) { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

  bind('btn-add-product', 'click', addProductRow);
  bind('btn-submit-in',   'click', submitStockIn);
  bind('btn-clear-out',   'click', clearStockOut);
  bind('btn-submit-out',  'click', submitStockOut);
  bind('btn-export-inv',  'click', UI.exportInventoryCSV);
  bind('btn-export-hist', 'click', UI.exportHistoryCSV);
  bind('btn-lookup',      'click', () => UI.renderLookup(document.getElementById('lookup-input').value));

  bind('inv-search',       'input',  () => UI.renderStockList());
  bind('inv-cat-filter',   'change', () => UI.renderStockList());
  bind('inv-loc-filter',   'change', () => UI.renderStockList());
  bind('inv-status-filter','change', () => UI.renderStockList());

  bind('hist-search',      'input',  () => UI.renderHistory());
  bind('hist-type-filter', 'change', () => UI.renderHistory());
  bind('hist-cat-filter',  'change', () => UI.renderHistory());
  bind('hist-date-from',   'change', () => UI.renderHistory());
  bind('hist-date-to',     'change', () => UI.renderHistory());

  // Stock Out serial field
  const outField = document.getElementById('out-serial-field');
  if (outField) {
    outField.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        outField.value.split(/[,\n]+/).map(v => v.trim()).filter(Boolean).forEach(addSerialOut);
        outField.value = '';
      }
    });
    outField.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      text.split(/[\n,\t]+/).map(v => v.trim()).filter(Boolean).forEach(addSerialOut);
      outField.value = '';
    });
  }

  bind('lookup-input', 'keydown', e => { if (e.key === 'Enter') UI.renderLookup(document.getElementById('lookup-input').value); });

  // ── Helpers ───────────────────────────────────────────────────────────
  function esc(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Boot ─────────────────────────────────────────────────────────────
  productRows = [newRow()];
  showView('dashboard');

})();
