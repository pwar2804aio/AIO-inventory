/**
 * app.js — event wiring, navigation, product row management
 */
(() => {

  // ── Shared product-row builder ────────────────────────────────────────
  function buildProductRowCard(row, idx, total, showCost) {
    const productOptions = Inventory.PRODUCTS.map(p =>
      `<option value="${esc(p.name)}"${row.product === p.name ? ' selected' : ''}>${esc(p.name)}</option>`
    ).join('');

    const isOther = row.product === 'Other' || (row.product && !Inventory.PRODUCTS.find(p => p.name === row.product));
    const autoCategory = Inventory.PRODUCTS.find(p => p.name === row.product)?.category || row.category || '';
    const noSerial = !!row.noSerial;

    return `
    <div class="product-row-card" id="rowcard-${row.id}">
      <div class="product-row-header">
        <span class="product-row-num">Product ${idx + 1}</span>
        ${total > 1 ? `<button class="btn-remove-row" data-rowid="${row.id}">×</button>` : ''}
      </div>
      <div class="form-grid g3" style="margin-bottom:10px;">
        <div class="form-group" style="grid-column:span 2;">
          <label class="form-label">Product *</label>
          <select class="fi" id="${row.id}-product-select" data-rowid="${row.id}">
            <option value="">Select product...</option>
            ${productOptions}
          </select>
          <input class="fi fi-mono" id="${row.id}-product-custom" data-rowid="${row.id}"
            placeholder="Enter custom product name"
            style="margin-top:6px;display:${isOther ? 'block' : 'none'};"
            value="${isOther && row.product !== 'Other' ? esc(row.product) : ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <input class="fi" id="${row.id}-category-display" value="${esc(autoCategory)}"
            readonly style="background:var(--bg-2);color:var(--text-muted);cursor:default;"
            placeholder="Auto-filled from product" />
        </div>
      </div>
      ${showCost ? `
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label">Cost price per unit <span style="font-weight:400;color:var(--text-hint)">(applies to all units of this product)</span></label>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:var(--text-muted);font-size:13px;">$</span>
          <input class="fi" id="${row.id}-unit-cost" type="number" min="0" step="0.01"
            style="width:140px;" placeholder="0.00"
            value="${row.unitCost != null ? row.unitCost : ''}" />
        </div>
      </div>` : `
      <div class="form-group" style="margin-bottom:10px;width:180px;">
        <label class="form-label">Low stock alert at</label>
        <input class="fi" id="${row.id}-threshold" data-rowid="${row.id}" data-field="threshold"
          type="number" min="0" value="${esc(row.threshold)}" placeholder="e.g. 5 (default 3)" />
      </div>`}

      <!-- No serial toggle -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <label class="used-toggle" id="${row.id}-noserial-label">
          <input type="checkbox" id="${row.id}-noserial" ${noSerial ? 'checked' : ''} />
          <span class="used-toggle-track"><span class="used-toggle-thumb"></span></span>
          <span class="used-toggle-label" style="font-size:12px;">No serial numbers</span>
        </label>
        <span class="hint" style="margin-top:0;">Check if this product doesn't use serial numbers</span>
      </div>

      <!-- Serial numbers section (shown when noSerial is off) -->
      <div id="${row.id}-serial-section" style="display:${noSerial ? 'none' : 'block'};">
        <div class="form-group">
          <label class="form-label">Serial numbers</label>
          <input class="fi fi-mono" id="${row.id}-serial-field" data-rowid="${row.id}"
            placeholder="Type or scan → Enter. Paste multiple lines for bulk." />
          <div class="hint">Press Enter or comma to add · Paste a list to bulk import</div>
          <div class="serial-row-list" id="${row.id}-serial-list"></div>
          <div class="hint" id="${row.id}-count">0 serials</div>
        </div>
      </div>

      <!-- Quantity section (shown when noSerial is on) -->
      <div id="${row.id}-qty-section" style="display:${noSerial ? 'block' : 'none'};">
        <div class="form-group" style="max-width:200px;">
          <label class="form-label">Quantity *</label>
          <input class="fi" id="${row.id}-qty" type="number" min="1" step="1"
            value="${row.qty || ''}" placeholder="e.g. 10" />
          <div class="hint">Number of units to ${showCost ? 'receive' : 'register'}</div>
        </div>
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
    // Attach camera scan button
    if (typeof Scanner !== 'undefined') {
      Scanner.attachToInput(el, (serial) => addSerialToRow(rowId, serial, showCost));
    }
  }

  // ── Wire product dropdown — auto-fills category, reveals Other input ─────
  function wireProductSelect(rowId, rowList) {
    const sel    = document.getElementById(`${rowId}-product-select`);
    const custom = document.getElementById(`${rowId}-product-custom`);
    const catEl  = document.getElementById(`${rowId}-category-display`);
    const costEl = document.getElementById(`${rowId}-unit-cost`);
    if (!sel) return;

    const applySelection = (val) => {
      const row = rowList.find(r => r.id === rowId);
      if (!row) return;
      const isOther = val === 'Other';
      if (custom) custom.style.display = isOther ? 'block' : 'none';
      const productDef = Inventory.PRODUCTS.find(p => p.name === val);
      const autoCategory = productDef?.category || '';
      if (catEl) catEl.value = autoCategory;
      if (!isOther) {
        row.product  = val;
        row.category = autoCategory;
        // Pre-fill unit cost from existing DB cost for this product
        if (costEl) {
          const existingSerials = Object.values(Inventory.getInventoryMap())
            .find(v => v.product === val)?.inStock;
          if (existingSerials && existingSerials.size > 0) {
            const first = [...existingSerials][0];
            const existingCost = DB.getSerialCost(first);
            if (existingCost != null && costEl.value === '') costEl.value = existingCost;
          }
        }
      } else {
        row.product  = custom?.value.trim() || 'Other';
        row.category = autoCategory;
      }
    };

    sel.addEventListener('change', () => applySelection(sel.value));
    if (custom) {
      custom.addEventListener('input', () => {
        const row = rowList.find(r => r.id === rowId);
        if (row) row.product = custom.value.trim() || 'Other';
      });
    }
    if (costEl) {
      costEl.addEventListener('change', () => {
        const row = rowList.find(r => r.id === rowId);
        if (!row) return;
        const cost = costEl.value !== '' ? parseFloat(costEl.value) : null;
        row.unitCost = cost;
      });
    }
    // Apply on initial load if product already set
    if (sel.value) applySelection(sel.value);

    // Wire no-serial toggle
    const noSerialChk = document.getElementById(`${rowId}-noserial`);
    const serialSection = document.getElementById(`${rowId}-serial-section`);
    const qtySection    = document.getElementById(`${rowId}-qty-section`);
    if (noSerialChk) {
      noSerialChk.addEventListener('change', () => {
        const row = rowList.find(r => r.id === rowId);
        if (!row) return;
        row.noSerial = noSerialChk.checked;
        row.serials  = []; // clear serials when toggling
        if (serialSection) serialSection.style.display = row.noSerial ? 'none' : 'block';
        if (qtySection)    qtySection.style.display    = row.noSerial ? 'block' : 'none';
      });
    }
    const qtyEl = document.getElementById(`${rowId}-qty`);
    if (qtyEl) {
      qtyEl.addEventListener('input', () => {
        const row = rowList.find(r => r.id === rowId);
        if (row) row.qty = parseInt(qtyEl.value) || '';
      });
    }
  }

  function syncRowFields(row) {
    const sel    = document.getElementById(`${row.id}-product-select`);
    const custom = document.getElementById(`${row.id}-product-custom`);
    const catEl  = document.getElementById(`${row.id}-category-display`);
    const costEl = document.getElementById(`${row.id}-unit-cost`);
    const thrEl  = document.getElementById(`${row.id}-threshold`);
    const nsChk  = document.getElementById(`${row.id}-noserial`);
    const qtyEl  = document.getElementById(`${row.id}-qty`);
    if (sel) {
      if (sel.value === 'Other' && custom) row.product = custom.value.trim() || 'Other';
      else if (sel.value) row.product = sel.value;
    }
    if (catEl)  row.category  = catEl.value;
    if (costEl) row.unitCost  = costEl.value !== '' ? parseFloat(costEl.value) : null;
    if (thrEl)  row.threshold = thrEl.value;
    if (nsChk)  row.noSerial  = nsChk.checked;
    if (qtyEl)  row.qty       = parseInt(qtyEl.value) || '';
  }

  // ── Stock In ──────────────────────────────────────────────────────────
  let inRows = [];
  let _inCounter = 0;
  function newInRow() { return { id: 'in' + (++_inCounter), product: '', category: '', threshold: '', serials: [], serialCosts: {}, noSerial: false, qty: '' }; }

  function renderInRows() {
    const c = document.getElementById('product-rows');
    if (!c) return;
    c.innerHTML = inRows.map((r, i) => buildProductRowCard(r, i, inRows.length, true)).join('');
    inRows.forEach(r => {
      renderSerialRows(r.id, r.serials, r.serialCosts, false); // serials don't have individual costs now
      wireSerialField(r.id);
      wireProductSelect(r.id, inRows);
    });
    c.querySelectorAll('.btn-remove-row').forEach(btn => btn.addEventListener('click', () => removeInRow(btn.dataset.rowid)));
  }

  function removeInRow(id) { if (inRows.length <= 1) return; inRows = inRows.filter(r => r.id !== id); renderInRows(); }

  function clearStockIn() {
    document.getElementById('in-supplier').value    = '';
    document.getElementById('in-loc').value         = '';
    document.getElementById('in-received-by').value = '';
    const poEl = document.getElementById('in-po'); if (poEl) poEl.value = '';
    const defaultCond = document.querySelector('input[name="in-condition"][value=""]');
    if (defaultCond) defaultCond.checked = true;
    inRows = [newInRow()]; renderInRows();
  }

  function submitStockIn() {
    inRows.forEach(syncRowFields);
    try {
      const conditionEl = document.querySelector('input[name="in-condition"]:checked');
      const condition   = conditionEl ? conditionEl.value : '';
      const poNumber    = document.getElementById('in-po')?.value.trim() || '';

      // For no-serial rows, generate placeholder serial IDs
      inRows.forEach(row => {
        if (row.noSerial) {
          const qty = parseInt(row.qty) || 0;
          if (qty < 1) throw new Error(`"${row.product || 'Product'}" has no serial numbers — enter a quantity.`);
          const ts = Date.now();
          row.serials = Array.from({length: qty}, (_, i) =>
            `NS-${(row.product||'ITEM').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,8)}-${ts}-${i+1}`
          );
          row.noSerialQty = qty;
        } else if (!row.serials || row.serials.length === 0) {
          throw new Error(`"${row.product || 'Product'}" requires serial numbers or check "No serial numbers".`);
        }
      });

      Inventory.stockIn({
        supplier:   document.getElementById('in-supplier').value.trim(),
        location:   document.getElementById('in-loc').value.trim(),
        receivedBy: document.getElementById('in-received-by').value.trim(),
        condition,
        poNumber,
        products:   inRows,
      });
      // Apply unit cost — PO items have their cost locked in inventory.js already
      // For non-PO items, propagate cost to all serials of same product
      if (!poNumber) {
        inRows.forEach(row => {
          if (row.unitCost != null) {
            row.serials.forEach(s => DB.setSerialCost(s, row.unitCost));
            if (!row.noSerial) DB.setProductCost(row.product, row.unitCost, Inventory.getInventoryMap());
          }
        });
      }
      const total = inRows.reduce((a, r) => a + r.serials.length, 0);
      const loc   = document.getElementById('in-loc').value.trim();
      clearStockIn();
      UI.showAlert(`${total} unit${total!==1?'s':''} received at ${loc}`, 'success');
    } catch (err) { UI.showAlert(err.message, 'error'); }
  }

  // ── In Transit ────────────────────────────────────────────────────────
  let trRows = [];
  let _trCounter = 0;
  function newTrRow() { return { id: 'tr' + (++_trCounter), product: '', category: '', serials: [], serialCosts: {}, noSerial: false, qty: '' }; }

  function renderTrRows() {
    const c = document.getElementById('transit-product-rows');
    if (!c) return;
    c.innerHTML = trRows.map((r, i) => buildProductRowCard(r, i, trRows.length, true)).join('');
    trRows.forEach(r => {
      renderSerialRows(r.id, r.serials, r.serialCosts, false);
      wireSerialField(r.id);
      wireProductSelect(r.id, trRows);
    });
    c.querySelectorAll('.btn-remove-row').forEach(btn => btn.addEventListener('click', () => removeTrRow(btn.dataset.rowid)));
  }

  function removeTrRow(id) { if (trRows.length <= 1) return; trRows = trRows.filter(r => r.id !== id); renderTrRows(); }

  function clearTransitForm() {
    ['tr-supplier','tr-loc','tr-expected','tr-po'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    trRows = [newTrRow()]; renderTrRows();
  }

  function submitTransit() {
    trRows.forEach(syncRowFields);
    try {
      // For no-serial rows, generate placeholder serial IDs
      trRows.forEach(row => {
        if (row.noSerial) {
          const qty = parseInt(row.qty) || 0;
          if (qty < 1) throw new Error(`"${row.product || 'Product'}" has no serial numbers — enter a quantity.`);
          const ts = Date.now();
          row.serials = Array.from({length: qty}, (_, i) =>
            `NS-${(row.product||'ITEM').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,8)}-${ts}-${i+1}`
          );
          row.noSerialQty = qty;
        } else if (!row.serials || row.serials.length === 0) {
          throw new Error(`"${row.product || 'Product'}" requires serial numbers or check "No serial numbers".`);
        }
      });

      Inventory.createShipment({
        supplier:   document.getElementById('tr-supplier').value.trim(),
        location:   document.getElementById('tr-loc').value.trim(),
        expectedBy: document.getElementById('tr-expected').value,
        poNumber:   document.getElementById('tr-po')?.value.trim() || '',
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
  let outRows = [];
  let _outCounter = 0;

  function newOutRow() {
    return { id: 'out' + (++_outCounter), product: '', location: '', serials: [], serialCosts: {}, useSerials: true };
  }

  function buildOutRowCard(row, idx, total) {
    const map = Inventory.getInventoryMap();

    // Build product options from current stock only
    const stockedProducts = [...new Set(Object.values(map).map(v => v.product))].sort();
    const productOptions = stockedProducts.map(p =>
      `<option value="${esc(p)}"${row.product === p ? ' selected' : ''}>${esc(p)}</option>`
    ).join('');

    // Location options for selected product
    const locationsForProduct = row.product
      ? Object.values(map).filter(v => v.product === row.product && v.inStock.size > 0).map(v => v.location)
      : [];
    const locationOptions = locationsForProduct.map(l =>
      `<option value="${esc(l)}"${row.location === l ? ' selected' : ''}>${esc(l)} (${map[row.product + '||' + l]?.inStock.size || 0} in stock)</option>`
    ).join('');

    const availCount = row.product && row.location
      ? (map[row.product + '||' + row.location]?.inStock.size || 0)
      : null;

    // Detect if this product only has NS- (no-serial) stock
    const isNoSerial = row.product && row.location
      ? [...(map[row.product + '||' + row.location]?.inStock || [])].every(s => s.startsWith('NS-'))
      : false;

    return `
    <div class="product-row-card" id="out-rowcard-${row.id}">
      <div class="product-row-header">
        <span class="product-row-num">Product ${idx + 1}</span>
        ${total > 1 ? `<button class="btn-remove-row" data-outrowid="${row.id}">×</button>` : ''}
      </div>
      <div class="form-grid g3" style="margin-bottom:12px;">
        <div class="form-group" style="grid-column:span 2;">
          <label class="form-label">Product *</label>
          <select class="fi" id="${row.id}-out-product">
            <option value="">Select product from stock...</option>
            ${productOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Location *</label>
          <select class="fi" id="${row.id}-out-location" ${!row.product ? 'disabled' : ''}>
            <option value="">Select location...</option>
            ${locationOptions}
          </select>
        </div>
      </div>

      ${availCount !== null ? `<div class="hint" style="margin-bottom:10px;">${availCount} unit${availCount!==1?'s':''} available at this location</div>` : ''}

      ${row.product && row.location ? (isNoSerial ? `
      <!-- Qty picker for no-serial products -->
      <div class="form-group" style="max-width:200px;">
        <label class="form-label">Quantity to dispatch *</label>
        <input class="fi" id="${row.id}-out-qty" type="number" min="1" max="${availCount||999}" step="1"
          value="${row.qty || ''}" placeholder="e.g. 5" />
        <div class="hint">Max available: ${availCount}</div>
      </div>
      ` : `
      <!-- Serial number entry for serialised products -->
      <div id="${row.id}-out-serials-section">
        <div class="form-group">
          <label class="form-label">Serial numbers to dispatch *</label>
          <input class="fi fi-mono" id="${row.id}-out-serial-field"
            placeholder="Type or scan serial then Enter · validated against stock" />
          <div class="hint">Press Enter to add · scanned serials auto-add · unavailable shown in red</div>
          <div class="serial-area" id="${row.id}-out-tags"></div>
          <div class="hint" id="${row.id}-out-count">0 serials</div>
        </div>
      </div>
      `) : ''}
    </div>`;
  }

  function renderOutRows() {
    const c = document.getElementById('out-product-rows');
    if (!c) return;
    c.innerHTML = outRows.map((r, i) => buildOutRowCard(r, i, outRows.length)).join('');

    outRows.forEach(row => {
      // Re-render existing serial tags
      _renderOutTags(row.id);
      _wireOutRow(row.id);
    });
    c.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', () => {
        if (outRows.length <= 1) return;
        outRows = outRows.filter(r => r.id !== btn.dataset.outrowid);
        renderOutRows();
      });
    });
  }

  function _wireOutRow(rowId) {
    const productSel  = document.getElementById(`${rowId}-out-product`);
    const locationSel = document.getElementById(`${rowId}-out-location`);
    const serialField = document.getElementById(`${rowId}-out-serial-field`);
    const qtyField    = document.getElementById(`${rowId}-out-qty`);

    if (productSel) {
      productSel.addEventListener('change', () => {
        const row = outRows.find(r => r.id === rowId);
        if (!row) return;
        row.product  = productSel.value;
        row.location = '';
        row.serials  = [];
        row.qty      = '';
        renderOutRows();
      });
    }

    if (locationSel) {
      locationSel.addEventListener('change', () => {
        const row = outRows.find(r => r.id === rowId);
        if (!row) return;
        row.location = locationSel.value;
        row.serials  = [];
        row.qty      = '';
        renderOutRows();
      });
    }

    if (qtyField) {
      qtyField.addEventListener('input', () => {
        const row = outRows.find(r => r.id === rowId);
        if (row) row.qty = parseInt(qtyField.value) || '';
      });
    }

    if (serialField) {
      serialField.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          serialField.value.split(/[,\n]+/).map(v => v.trim()).filter(Boolean).forEach(v => _addOutSerial(rowId, v));
          serialField.value = '';
        }
      });
      serialField.addEventListener('paste', e => {
        e.preventDefault();
        (e.clipboardData||window.clipboardData).getData('text').split(/[\n,\t]+/).map(v=>v.trim()).filter(Boolean).forEach(v => _addOutSerial(rowId, v));
        serialField.value = '';
      });
      if (typeof Scanner !== 'undefined') {
        Scanner.attachToInput(serialField, (serial) => _addOutSerial(rowId, serial));
      }
    }
  }

  function _addOutSerial(rowId, raw) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    const row = outRows.find(r => r.id === rowId);
    if (!row || row.serials.includes(v)) return;
    row.serials.push(v);
    _renderOutTags(rowId);
  }

  function _renderOutTags(rowId) {
    const row   = outRows.find(r => r.id === rowId);
    const c     = document.getElementById(`${rowId}-out-tags`);
    const countEl = document.getElementById(`${rowId}-out-count`);
    if (!row || !c) return;
    const avail = Inventory.getAvailableSerials();
    c.innerHTML = row.serials.map(s => {
      const ok = avail.has(s);
      return `<span class="stag ${ok?'stag-out':'stag-err'}">${esc(s)}${ok?'':' ✗'}<span class="stag-x" data-rowid="${rowId}" data-serial="${esc(s)}">×</span></span>`;
    }).join('');
    c.querySelectorAll('.stag-x').forEach(x => {
      x.addEventListener('click', () => {
        const r = outRows.find(r => r.id === x.dataset.rowid);
        if (r) { r.serials = r.serials.filter(s => s !== x.dataset.serial); _renderOutTags(rowId); }
      });
    });
    const invalid = row.serials.filter(s => !avail.has(s)).length;
    if (countEl) countEl.textContent = row.serials.length + ' serial' + (row.serials.length!==1?'s':'') + (invalid ? ` — ${invalid} not in stock` : '');
  }

  function clearStockOut() {
    ['out-customer','out-by','out-ref'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
    outRows = [newOutRow()];
    renderOutRows();
    autoFillUser();
  }

  function submitStockOut() {
    const customer = document.getElementById('out-customer').value.trim();
    const by       = document.getElementById('out-by').value.trim();
    const ref      = document.getElementById('out-ref').value.trim();

    if (!customer) { UI.showAlert('Customer / account is required.', 'error'); return; }

    const map = Inventory.getInventoryMap();

    // Sync qty fields and validate
    for (const row of outRows) {
      const qtyEl = document.getElementById(`${row.id}-out-qty`);
      if (qtyEl) row.qty = parseInt(qtyEl.value) || '';

      if (!row.product)  { UI.showAlert('Select a product for each row.', 'error'); return; }
      if (!row.location) { UI.showAlert(`Select a location for "${row.product}".`, 'error'); return; }

      // Determine if this row is no-serial (all NS- stock)
      const inStock = [...(map[row.product + '||' + row.location]?.inStock || [])];
      const isNoSerial = inStock.length > 0 && inStock.every(s => s.startsWith('NS-'));

      if (isNoSerial) {
        if (!row.qty || row.qty < 1) { UI.showAlert(`Enter a quantity to dispatch for "${row.product}".`, 'error'); return; }
        if (row.qty > inStock.length) { UI.showAlert(`Only ${inStock.length} unit${inStock.length!==1?'s':''} of "${row.product}" available.`, 'error'); return; }
        // Select the NS- serials to dispatch
        row.serials = inStock.slice(0, row.qty);
      } else {
        if (row.serials.length === 0) { UI.showAlert(`Add at least one serial for "${row.product}".`, 'error'); return; }
      }
    }

    try {
      let totalUnits = 0;
      outRows.forEach(row => {
        Inventory.stockOut({ customer, by, ref, serials: row.serials });
        totalUnits += row.serials.length;
      });
      clearStockOut();
      UI.renderDashboard();
      UI.showAlert(`${totalUnits} unit${totalUnits!==1?'s':''} dispatched to "${customer}"`, 'success');
    } catch(err) { UI.showAlert(err.message, 'error'); }
  }

  // ── Navigation ────────────────────────────────────────────────────────
  const VIEWS = ['dashboard','transit','in','out','stock-list','deployed','servicing','rma','reports','lookup','history'];

  function showView(view) {
    VIEWS.forEach(v => { document.getElementById('v-' + v).style.display = v === view ? '' : 'none'; });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.nav-dropdown-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    // Keep dropdown toggle highlighted when a child view is active
    document.querySelectorAll('.nav-dropdown').forEach(dd => {
      const hasActive = dd.querySelector('.nav-dropdown-item.active');
      dd.querySelector('.nav-dropdown-toggle')?.classList.toggle('active', !!hasActive);
    });
    UI.hideAlert();
    if (view === 'dashboard')  UI.renderDashboard();
    if (view === 'transit')    { UI.populateDataLists(); if (!trRows.length) trRows=[newTrRow()]; renderTrRows(); UI.renderTransitList(); }
    if (view === 'stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    if (view === 'deployed')   { UI.populateDeployedFilters(); UI.renderDeployed(); }
    if (view === 'servicing')  UI.renderServicing();
    if (view === 'rma')        UI.renderRMA();
    if (view === 'reports')    Reports.render();
    if (view === 'history')    { UI.populateCategoryFilters(); UI.renderHistory(); }
    if (view === 'in')         { UI.populateDataLists(); if (!inRows.length) inRows=[newInRow()]; renderInRows(); }
    if (view === 'out')        { UI.populateDataLists(); if (!outRows.length) outRows=[newOutRow()]; renderOutRows(); }
    if (view === 'lookup')     setTimeout(() => document.getElementById('lookup-input').focus(), 50);
  }

  // Nav buttons (top-level)
  document.querySelectorAll('.nav-btn:not(.nav-dropdown-toggle)').forEach(btn => btn.addEventListener('click', () => showViewTracked(btn.dataset.view)));

  // Dropdown toggle
  document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = toggle.closest('.nav-dropdown');
      const isOpen = dd.classList.contains('open');
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
      if (!isOpen) dd.classList.add('open');
    });
  });

  // Dropdown items
  document.querySelectorAll('.nav-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
      showViewTracked(item.dataset.view);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
  });

  // ── Bindings ──────────────────────────────────────────────────────────
  function bind(id, ev, fn) { const el=document.getElementById(id); if(el) el.addEventListener(ev, fn); }

  bind('btn-add-product',       'click', () => { inRows.push(newInRow()); renderInRows(); });
  bind('btn-add-transit-product','click',() => { trRows.push(newTrRow()); renderTrRows(); });
  bind('btn-add-out-product',   'click', () => { outRows.push(newOutRow()); renderOutRows(); });
  bind('btn-submit-in',         'click', submitStockIn);
  bind('btn-submit-transit',    'click', submitTransit);
  bind('btn-submit-out',        'click', submitStockOut);
  bind('btn-export-inv',        'click', UI.exportInventoryCSV);
  bind('btn-export-deployed',   'click', UI.exportDeployedCSV);
  bind('btn-export-hist',       'click', UI.exportHistoryCSV);

  bind('btn-rpt-run',      'click', Reports.render);
  bind('btn-rpt-export',   'click', Reports.exportAll);

  bind('dep-search',         'input',  () => UI.renderDeployed());
  bind('dep-cat-filter',     'change', () => UI.renderDeployed());
  bind('dep-customer-filter','change', () => UI.renderDeployed());
  bind('btn-lookup',            'click', () => UI.renderLookup(document.getElementById('lookup-input').value));

  bind('inv-search',       'input',  () => UI.renderStockList());
  bind('inv-cat-filter',   'change', () => UI.renderStockList());
  bind('inv-loc-filter',   'change', () => UI.renderStockList());
  bind('inv-status-filter','change', () => UI.renderStockList());

  bind('svc-search',      'input',  () => UI.renderServicing());
  bind('svc-flag-filter', 'change', () => UI.renderServicing());
  bind('rma-search',        'input',  () => UI.renderRMA());
  bind('rma-status-filter', 'change', () => UI.renderRMA());

  bind('hist-search',      'input',  () => UI.renderHistory());
  bind('hist-type-filter', 'change', () => UI.renderHistory());
  bind('hist-cat-filter',  'change', () => UI.renderHistory());
  bind('hist-date-from',   'change', () => UI.renderHistory());
  bind('hist-date-to',     'change', () => UI.renderHistory());

  const outField = document.getElementById('out-serial-field');
  if (outField) {
    outField.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===',') { e.preventDefault(); outField.value.split(/[,\n]+/).map(v=>v.trim()).filter(Boolean).forEach(addSerialOut); outField.value=''; }});
    outField.addEventListener('paste', e => { e.preventDefault(); (e.clipboardData||window.clipboardData).getData('text').split(/[\n,\t]+/).map(v=>v.trim()).filter(Boolean).forEach(addSerialOut); outField.value=''; });
    if (typeof Scanner !== 'undefined') Scanner.attachToInput(outField, addSerialOut);
  }

  const lookupField = document.getElementById('lookup-input');
  if (lookupField && typeof Scanner !== 'undefined') {
    Scanner.attachToInput(lookupField, (serial) => {
      lookupField.value = serial;
      UI.renderLookup(serial);
    });
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

  // ── Auto-fill logged-in user into received-by / dispatched-by ─────────
  function autoFillUser() {
    const name = Auth.getName();
    if (!name) return;
    const fields = ['in-received-by', 'out-by', 'tr-received-by'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = name;
    });
  }

  // ── Track current view for real-time refresh ──────────────────────────
  function showViewTracked(view) {
    _currentView = view;
    showView(view);
    autoFillUser();
  }

  // ── Boot: gate everything behind Firebase Auth ────────────────────────
  document.getElementById('alert-box').textContent = '⏳ Loading...';
  document.getElementById('alert-box').className   = 'alert alert-success show';

  inRows = [newInRow()];
  trRows = [newTrRow()];
  outRows = [newOutRow()];

  Auth.onReady((isLoggedIn) => {
    document.getElementById('alert-box').classList.remove('show');

    if (!isLoggedIn) {
      // Show login screen — replaces entire page
      AuthUI.showLoginScreen();
      // When auth state changes to logged in, reload
      return;
    }

    // User is logged in — inject user bar into header
    AuthUI.injectUserBar();

    // Wait for DB then render
    DB.onReady(() => {
      // Apply view-only restrictions if not editor/admin
      AuthUI.applyRoleRestrictions();
      showViewTracked('dashboard');
    });
  });

})();
