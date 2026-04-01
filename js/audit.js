// audit.js — Stock Count v57
// 3-phase: Build count list → Count → Variance report
// Serialised products: scan serials. NS products: enter physical qty.
// Deployed / in-transit: not on site, entirely excluded.

const Audit = (() => {

  // ── State ─────────────────────────────────────────────────────────────
  // Phase 1: count list items: [{ product, category, location, isNS, systemCount, systemSerials[] }]
  // Phase 2: per-product scanned: { [product||loc]: { matched:Set, unexpected:[] } }
  // Phase 2: per-product NS count: { [product||loc]: number|null }
  let _countList  = [];   // items user has added to count
  let _scanned    = {};   // phase 2 scan results
  let _nsCounts   = {};   // phase 2 NS physical counts
  let _lostSet    = new Set();
  let _phase      = 1;    // 1=setup, 2=counting, 3=report
  let _report     = null;

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  const fmt$ = n => n > 0 ? '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  const _key = item => item.product + '||' + (item.location || '');

  // ── init ──────────────────────────────────────────────────────────────
  function init() {
    if (_phase === 2) return; // don't reset if counting
    if (_phase === 3) return;
    _phase = 1;
    _populateLocFilter();
    _populateProductPicker();
    _renderCountList();
    _renderHistory();
    _wireSetupButtons();
    _checkPausedAudit();
  }

  function _checkPausedAudit() {
    const paused = DB.getPausedAudit();
    const banner  = document.getElementById('audit-paused-banner');
    const summary = document.getElementById('audit-paused-summary');
    if (!banner) return;
    if (!paused) { banner.style.display = 'none'; return; }

    // Count how many serials are missing across all items
    const missingCount = _getMissingFromPaused(paused).length;
    const scannedCount = Object.values(paused.scanned || {}).reduce((a, v) => a + (v.matched?.length || 0) + (v.unexpected?.length || 0), 0);
    banner.style.display = '';
    if (summary) summary.textContent = `${paused.countList?.length || 0} products · ${scannedCount} scanned · ${missingCount} missing — paused ${new Date(paused.pausedAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}`;

    // Wire buttons
    const exportBtn  = document.getElementById('btn-export-paused-missing');
    const resumeBtn  = document.getElementById('btn-resume-audit');
    const discardBtn = document.getElementById('btn-discard-paused');

    if (exportBtn && !exportBtn._wired) {
      exportBtn._wired = true;
      exportBtn.addEventListener('click', () => _exportPausedMissing(paused));
    }
    if (resumeBtn && !resumeBtn._wired) {
      resumeBtn._wired = true;
      resumeBtn.addEventListener('click', () => _resumeAudit(paused));
    }
    if (discardBtn && !discardBtn._wired) {
      discardBtn._wired = true;
      discardBtn.addEventListener('click', () => {
        if (!confirm('Discard the paused count? This cannot be undone.')) return;
        DB.clearPausedAudit();
        banner.style.display = 'none';
      });
    }
  }

  function _getMissingFromPaused(paused) {
    const missing = [];
    (paused.countList || []).forEach(item => {
      if (item.isNS) return;
      const key     = item.product + '||' + (item.location || '');
      const scanned = new Set((paused.scanned?.[key]?.matched || []).map(s => s.toUpperCase()));
      (item.systemSerials || []).forEach(s => {
        if (!scanned.has(s.toUpperCase())) missing.push({ serial: s, product: item.product, location: item.location });
      });
    });
    return missing;
  }

  function _exportPausedMissing(paused) {
    const missing = _getMissingFromPaused(paused);
    const rows = [['Serial Number', 'Product', 'Location', 'Status']];
    missing.forEach(m => rows.push([m.serial, m.product, m.location || '', 'Not scanned']));
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `missing-serials-${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  function _resumeAudit(paused) {
    // Restore state from saved paused audit
    _countList    = paused.countList || [];
    _scanned      = {};
    _nsCounts     = paused.nsCounts || {};
    _lostSet      = new Set(paused.lostSet || []);
    _phase        = 2;

    // Restore scanned sets (arrays → Sets)
    Object.entries(paused.scanned || {}).forEach(([k, v]) => {
      _scanned[k] = { matched: new Set(v.matched || []), unexpected: v.unexpected || [] };
    });

    DB.clearPausedAudit();
    document.getElementById('audit-paused-banner').style.display = 'none';
    document.getElementById('audit-setup-panel').style.display  = 'none';
    document.getElementById('audit-active-panel').style.display = '';

    _buildSerialLookup();
    _renderProductPanels();

    const input  = document.getElementById('audit-serial-input');
    const submit = document.getElementById('btn-audit-submit');
    if (input) { input.disabled = false; input.value = ''; }
    if (!input?._wired) {
      if (input) { input._wired = true; input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _submitSerial(); } }); }
      if (submit) submit.addEventListener('click', _submitSerial);
    }
    const finBtn = document.getElementById('btn-finish-audit');
    if (finBtn) { finBtn.disabled = false; finBtn.textContent = 'Complete Count'; }
    if (finBtn && !finBtn._wired) { finBtn._wired = true; finBtn.addEventListener('click', _completeCount); }
    const cancelBtn = document.getElementById('btn-cancel-audit');
    if (cancelBtn && !cancelBtn._wired) { cancelBtn._wired = true; cancelBtn.addEventListener('click', _cancel); }

    const pauseBtn = document.getElementById('btn-pause-audit');
    if (pauseBtn && !pauseBtn._wired) { pauseBtn._wired = true; pauseBtn.addEventListener('click', _pause); }
    const pauseBtn = document.getElementById('btn-pause-audit');
    if (pauseBtn && !pauseBtn._wired) { pauseBtn._wired = true; pauseBtn.addEventListener('click', _pause); }
    if (input) input.focus();
  }

  function _populateLocFilter() {
    const sel = document.getElementById('audit-loc-filter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All locations</option>' +
      Inventory.getLocations().map(l => `<option value="${_esc(l)}"${l===cur?' selected':''}>${_esc(l)}</option>`).join('');
    if (!sel._locWired) {
      sel._locWired = true;
      sel.addEventListener('change', () => _populateProductPicker());
    }
  }

  function _populateProductPicker() {
    const sel  = document.getElementById('audit-product-picker');
    const locF = document.getElementById('audit-loc-filter')?.value || '';
    if (!sel) return;
    const inStock = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
    // Build product+location combos
    const combos = {};
    inStock.forEach(r => {
      if (locF && r.location !== locF) return;
      const k = r.product + '||' + (r.location||'');
      if (!combos[k]) combos[k] = { product: r.product, location: r.location||'', category: r.category, ns: 0, serial: 0 };
      if (r.serial.startsWith('NS-')) combos[k].ns++;
      else combos[k].serial++;
    });
    // Exclude already-added
    const alreadyAdded = new Set(_countList.map(i => _key(i)));
    sel.innerHTML = '<option value="">Select product to add...</option>' +
      Object.values(combos)
        .filter(c => !alreadyAdded.has(c.product + '||' + c.location))
        .sort((a,b) => a.product.localeCompare(b.product))
        .map(c => {
          const type = c.ns > 0 && c.serial === 0 ? '📦 NS' : c.serial > 0 && c.ns === 0 ? '🔢' : '🔢+📦';
          const qty  = c.ns > 0 && c.serial === 0 ? c.ns : c.serial + (c.ns > 0 ? `+${c.ns}NS` : '');
          return `<option value="${_esc(c.product + '||' + c.location)}">${_esc(c.product)}${c.location?' @ '+c.location:''} · ${type} · ${qty}</option>`;
        }).join('');
  }

  function _wireSetupButtons() {
    const addBtn = document.getElementById('btn-add-to-count');
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', _addProduct);
    }
    const addAllBtn = document.getElementById('btn-add-all-products');
    if (addAllBtn && !addAllBtn._wired) {
      addAllBtn._wired = true;
      addAllBtn.addEventListener('click', _addAllProducts);
    }
    const startBtn = document.getElementById('btn-start-count');
    if (startBtn && !startBtn._wired) {
      startBtn._wired = true;
      startBtn.addEventListener('click', _startCounting);
    }
  }

  function _addProduct() {
    const sel = document.getElementById('audit-product-picker');
    if (!sel?.value) return;
    const [product, location] = sel.value.split('||');
    _addToCountList(product, location || '');
  }

  function _addAllProducts() {
    const locF    = document.getElementById('audit-loc-filter')?.value || '';
    const inStock = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
    const combos  = {};
    inStock.forEach(r => {
      if (locF && r.location !== locF) return;
      const k = r.product + '||' + (r.location||'');
      if (!combos[k]) combos[k] = { product: r.product, location: r.location||'' };
    });
    const alreadyAdded = new Set(_countList.map(i => _key(i)));
    Object.values(combos).forEach(c => {
      if (!alreadyAdded.has(c.product + '||' + c.location))
        _addToCountList(c.product, c.location, false);
    });
    _renderCountList();
    _populateProductPicker();
  }

  function _addToCountList(product, location, doRender = true) {
    const inStock = Inventory.getAllSerialRows().filter(r =>
      r.status === 'in-stock' && r.product === product &&
      (!location || r.location === location)
    );
    if (!inStock.length) return;
    const isNS     = inStock.every(r => r.serial.startsWith('NS-'));
    const category = inStock[0].category;
    const serials  = inStock.filter(r => !r.serial.startsWith('NS-')).map(r => r.serial);
    const nsCount  = inStock.filter(r => r.serial.startsWith('NS-')).length;

    _countList.push({ product, location, category, isNS: nsCount > 0 && serials.length === 0,
      hasBoth: nsCount > 0 && serials.length > 0,
      systemSerials: serials, systemNsCount: nsCount, systemCount: inStock.length });

    if (doRender) { _renderCountList(); _populateProductPicker(); }
  }

  function _renderCountList() {
    const body    = document.getElementById('audit-count-list-body');
    const badge   = document.getElementById('audit-count-list-badge');
    const startBtn = document.getElementById('btn-start-count');
    if (!body) return;

    if (badge) badge.textContent = _countList.length ? `(${_countList.length} products)` : '';
    if (startBtn) startBtn.style.display = _countList.length ? '' : 'none';

    if (!_countList.length) {
      body.innerHTML = '<div class="empty" style="padding:.75rem 0">No products added yet — select a product above and click Add</div>';
      return;
    }

    body.innerHTML = `<table class="product-stock-table">
      <thead><tr>
        <th style="width:30%">Product</th>
        <th style="width:15%">Category</th>
        <th style="width:18%">Location</th>
        <th style="width:12%">Type</th>
        <th style="width:10%">System qty</th>
        <th style="width:15%"></th>
      </tr></thead>
      <tbody>
        ${_countList.map((item, idx) => {
          const type = item.isNS ? '<span class="cat-badge">📦 No-serial</span>'
                     : item.hasBoth ? '<span class="cat-badge">🔢+📦 Mixed</span>'
                     : '<span class="cat-badge">🔢 Serialised</span>';
          return `<tr>
            <td style="font-weight:500">${_esc(item.product)}</td>
            <td><span class="cat-badge">${_esc(item.category||'—')}</span></td>
            <td>${item.location?`<span class="loc-badge">${_esc(item.location)}</span>`:'<span style="color:var(--text-hint)">All</span>'}</td>
            <td>${type}</td>
            <td style="font-weight:600;color:var(--success-text)">${item.systemCount}</td>
            <td style="text-align:right"><button class="btn btn-ghost btn-xs audit-remove-item" data-idx="${idx}" style="color:#9c2a00;">✕ Remove</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

    body.querySelectorAll('.audit-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        _countList.splice(parseInt(btn.dataset.idx), 1);
        _renderCountList();
        _populateProductPicker();
      });
    });
  }

  function _renderHistory() {
    const el = document.getElementById('audit-history-body');
    if (!el) return;
    const records = DB.getAuditRecords().slice().reverse();
    if (!records.length) { el.innerHTML = '<div class="empty" style="padding:.75rem 0">No counts recorded yet</div>'; return; }
    el.innerHTML = `<table class="product-stock-table">
      <thead><tr>
        <th style="width:15%">Date</th><th style="width:20%">Scope</th>
        <th style="width:9%">Products</th><th style="width:9%">Expected</th>
        <th style="width:9%">Matched</th><th style="width:9%">Missing</th>
        <th style="width:9%">Lost</th><th style="width:9%">NS var.</th>
        <th style="width:11%">Value at risk</th>
      </tr></thead>
      <tbody>${records.map(r=>`<tr>
        <td style="color:var(--text-muted);font-size:12px">${fmtDate(r.date)}</td>
        <td style="font-size:12px">${_esc(r.scope)}</td>
        <td>${r.productCount||'—'}</td><td>${r.expected}</td>
        <td style="color:#1a7a3c;font-weight:600">${r.matched}</td>
        <td style="color:${r.missing>0?'#9c6000':'var(--text-muted)'};font-weight:600">${r.missing}</td>
        <td style="color:${(r.lost||0)>0?'#9c2a00':'var(--text-muted)'};font-weight:600">${r.lost||0}</td>
        <td style="color:${(r.nsVariance||0)!==0?'#9c6000':'var(--text-muted)'};font-weight:600">${r.nsVariance!=null?(r.nsVariance>0?'+':'')+r.nsVariance:'—'}</td>
        <td style="font-size:12px;font-weight:600;color:var(--aio-purple)">${fmt$(r.missingValue||0)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ── Phase 2: Start counting ───────────────────────────────────────────
  function _startCounting() {
    if (!_countList.length) return;
    _phase   = 2;
    _scanned = {};
    _nsCounts = {};
    _lostSet  = new Set();

    // Init scan state per item
    _countList.forEach(item => {
      _scanned[_key(item)] = { matched: new Set(), unexpected: [] };
    });

    // Build a serial→item lookup for smart assignment
    _serialLookup = {};
    _countList.forEach(item => {
      item.systemSerials.forEach(s => { _serialLookup[s.toUpperCase()] = item; });
    });

    document.getElementById('audit-setup-panel').style.display  = 'none';
    document.getElementById('audit-active-panel').style.display  = '';
    document.getElementById('audit-report-panel').style.display  = 'none';

    const scopeLabel = _countList.length === 1
      ? _countList[0].product + (_countList[0].location ? ' @ ' + _countList[0].location : '')
      : `${_countList.length} products`;
    document.getElementById('audit-scope-label').textContent   = scopeLabel;
    document.getElementById('audit-progress-title').textContent = 'Count in progress';

    _renderProductPanels();

    const input = document.getElementById('audit-serial-input');
    const submit = document.getElementById('btn-audit-submit');
    if (input) { input.disabled = false; input.value = ''; }
    if (!input._wired) {
      input._wired = true;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _submitSerial(); } });
      submit.addEventListener('click', _submitSerial);
    }

    const finBtn = document.getElementById('btn-finish-audit');
    if (finBtn) { finBtn.textContent = 'Complete Count'; finBtn.disabled = false; }
    if (finBtn && !finBtn._wired) { finBtn._wired = true; finBtn.addEventListener('click', _completeCount); }

    const cancelBtn = document.getElementById('btn-cancel-audit');
    if (cancelBtn && !cancelBtn._wired) { cancelBtn._wired = true; cancelBtn.addEventListener('click', _cancel); }

    const camBtn = document.getElementById('btn-audit-camera');
    if (camBtn && !camBtn._wired) {
      camBtn._wired = true;
      camBtn.addEventListener('click', () => {
        if (typeof Scanner !== 'undefined') Scanner.start(s => { input.value = s; _submitSerial(); });
      });
    }

    if (input) input.focus();
  }

  let _serialLookup = {};

  function _buildSerialLookup() {
    _serialLookup = {};
    _countList.forEach(item => {
      (item.systemSerials || []).forEach(s => {
        _serialLookup[s.toUpperCase()] = item;
      });
    });
  }

  function _renderProductPanels() {
    const container = document.getElementById('audit-product-panels');
    if (!container) return;

    container.innerHTML = _countList.map((item, idx) => {
      const k        = _key(item);
      const typeLabel = item.isNS ? '📦 No-serial (enter qty)'
                      : item.hasBoth ? '🔢+📦 Mixed'
                      : '🔢 Scan serials';
      return `<div class="panel audit-product-panel" style="margin-bottom:1rem;" id="audit-panel-${idx}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div>
            <span style="font-weight:600;font-size:14px">${_esc(item.product)}</span>
            ${item.location?`<span class="loc-badge" style="margin-left:8px;">${_esc(item.location)}</span>`:''}
            <span class="cat-badge" style="margin-left:6px;">${_esc(item.category||'—')}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${typeLabel}</span>
          </div>
          <div class="audit-panel-status" id="audit-panel-status-${idx}" style="font-size:12px;font-weight:600;color:var(--text-muted);">
            System: ${item.systemCount}
          </div>
        </div>
        ${item.isNS ? `
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="font-size:13px;color:var(--text-muted);">System count: <strong>${item.systemNsCount}</strong></div>
            <div style="display:flex;align-items:center;gap:8px;">
              <label style="font-size:13px;font-weight:500;">Physical count:</label>
              <input type="number" min="0" class="fi audit-ns-qty" style="width:80px;padding:4px 8px;font-size:14px;font-weight:600;"
                data-key="${_esc(k)}" data-system="${item.systemNsCount}" placeholder="0" />
            </div>
            <div class="audit-ns-variance-display" id="audit-ns-var-${idx}" style="font-size:14px;font-weight:700;"></div>
          </div>
        ` : item.hasBoth ? `
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
            <div style="flex:1;min-width:200px;">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">SERIALISED (${item.systemSerials.length})</div>
              <div class="audit-panel-scanned" id="audit-scanned-${idx}" style="font-size:12px;color:var(--text-muted);">None scanned yet</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">NO-SERIAL COUNT (system: ${item.systemNsCount})</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="number" min="0" class="fi audit-ns-qty" style="width:80px;padding:4px 8px;"
                  data-key="${_esc(k)}" data-system="${item.systemNsCount}" placeholder="0" />
                <div class="audit-ns-variance-display" id="audit-ns-var-${idx}"></div>
              </div>
            </div>
          </div>
        ` : `
          <div class="audit-panel-scanned" id="audit-scanned-${idx}" style="font-size:12px;color:var(--text-muted);">
            None scanned yet — use the scan input above
          </div>
        `}
      </div>`;
    }).join('');

    // Wire NS qty inputs
    container.querySelectorAll('.audit-ns-qty').forEach(inp => {
      inp.addEventListener('input', () => {
        const k      = inp.dataset.key;
        const system = parseInt(inp.dataset.system, 10);
        const phys   = inp.value === '' ? null : parseInt(inp.value, 10);
        _nsCounts[k] = phys;
        // Find the panel idx
        const panelIdx = _countList.findIndex(i => _key(i) === k);
        const varEl = document.getElementById(`audit-ns-var-${panelIdx}`);
        if (varEl) {
          if (phys === null || isNaN(phys)) { varEl.textContent = ''; return; }
          const diff = phys - system;
          varEl.textContent = (diff > 0 ? '+' : '') + diff;
          varEl.style.color = diff === 0 ? '#1a7a3c' : diff > 0 ? '#1a5080' : '#9c6000';
        }
        _updatePanelStatus(panelIdx);
      });
    });
  }

  // ── submit a serial (auto-assigns to correct product) ─────────────────
  function _submitSerial() {
    if (_phase !== 2) return;
    const input    = document.getElementById('audit-serial-input');
    const raw      = (input?.value || '').trim();
    if (!raw) return;
    input.value = '';
    const key      = raw.toUpperCase();
    const feedback = document.getElementById('audit-scan-feedback');

    if (raw.toUpperCase().startsWith('NS-')) {
      feedback.style.color = '#9c6000';
      feedback.textContent = `⚠ No-serial item — enter the physical count in the panel below`;
      setTimeout(() => { feedback.textContent = ''; }, 3000);
      return;
    }

    // Check if already scanned in any panel
    const alreadyIn = Object.values(_scanned).find(s => s.matched.has(key) || s.unexpected.find(u => u.toUpperCase() === key));
    if (alreadyIn) {
      feedback.style.color = 'var(--text-muted)';
      feedback.textContent = `⚠ ${raw} already scanned`;
      setTimeout(() => { feedback.textContent = ''; }, 2000);
      return;
    }

    const item = _serialLookup[key];
    if (item) {
      const k = _key(item);
      _scanned[k].matched.add(key);
      const idx = _countList.indexOf(item);
      feedback.style.color = '#1a7a3c';
      feedback.textContent = `✅ ${raw} — ${item.product}`;
      _updateSerialPanel(idx, item);
      _updatePanelStatus(idx);
    } else {
      // Unexpected — doesn't match any product in count list
      // Try to find which product panel it might belong to (best-effort: check all in-stock)
      const allRow = Inventory.getAllSerialRows().find(r => r.serial.toUpperCase() === key && r.status === 'in-stock');
      if (allRow) {
        feedback.style.color = '#9c6000';
        feedback.textContent = `⚠ ${raw} — ${allRow.product} is in stock but not in your count list`;
      } else {
        // Truly unknown — assign to first serialised product as unexpected
        const firstSerial = _countList.find(i => !i.isNS);
        if (firstSerial) {
          _scanned[_key(firstSerial)].unexpected.push(raw);
          const idx = _countList.indexOf(firstSerial);
          _updateSerialPanel(idx, firstSerial);
        }
        feedback.style.color = '#9c2a00';
        feedback.textContent = `❓ ${raw} — not found in system`;
      }
    }

    if (input) input.focus();
  }

  function _updateSerialPanel(idx, item) {
    const el = document.getElementById(`audit-scanned-${idx}`);
    if (!el) return;
    const k          = _key(item);
    const st         = _scanned[k];
    const matchCount = st.matched.size;
    const unexpCount = st.unexpected.length;
    const missingCount = item.systemSerials.length - matchCount;

    el.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="color:#1a7a3c;font-weight:600">✅ ${matchCount} scanned</span>
        <span style="color:${missingCount>0?'#9c6000':'var(--text-muted)'};font-weight:600">⚠ ${missingCount} not yet scanned</span>
        ${unexpCount>0?`<span style="color:#9c2a00;font-weight:600">❓ ${unexpCount} unexpected</span>`:''}
      </div>`;
  }

  function _updatePanelStatus(idx) {
    const item = _countList[idx];
    const el   = document.getElementById(`audit-panel-status-${idx}`);
    if (!el || !item) return;
    const k  = _key(item);
    const st = _scanned[k];

    if (item.isNS) {
      const phys = _nsCounts[k];
      if (phys == null) { el.textContent = `System: ${item.systemCount}`; el.style.color = 'var(--text-muted)'; return; }
      const diff = phys - item.systemNsCount;
      el.textContent = `System: ${item.systemNsCount} · Counted: ${phys} · ${diff>=0?(diff===0?'✅ Match':'↑ +'+diff):'↓ '+diff}`;
      el.style.color = diff === 0 ? '#1a7a3c' : '#9c6000';
    } else {
      const matched  = st.matched.size;
      const total    = item.systemSerials.length;
      const missing  = total - matched;
      const unexp    = st.unexpected.length;
      el.textContent = `${matched}/${total} scanned${missing>0?' · ⚠ '+missing+' missing':''}${unexp>0?' · ❓ '+unexp+' unexpected':''}`;
      el.style.color = matched === total && unexp === 0 ? '#1a7a3c' : '#9c6000';
    }
  }

  // ── Phase 3: Complete count ───────────────────────────────────────────
  function _completeCount() {
    if (_phase !== 2) return;
    _phase = 3;

    document.getElementById('audit-serial-input').disabled = true;
    document.getElementById('btn-audit-submit').disabled   = true;
    document.getElementById('btn-finish-audit').disabled   = true;
    document.querySelectorAll('.audit-ns-qty').forEach(i => i.disabled = true);

    // Build report
    let totalExpected = 0, totalMatched = 0, totalMissing = 0, totalUnexpected = 0, totalNsVariance = 0, nsGroupsEntered = 0;
    let missingValue  = 0;
    const allMissingSerials = [], allUnexpectedSerials = [];

    const productReports = _countList.map(item => {
      const k   = _key(item);
      const st  = _scanned[k];
      const unitCost = item.systemCount > 0
        ? Inventory.getAllSerialRows().filter(r => r.product === item.product && r.status === 'in-stock' && r.cost != null).reduce((a,r)=>a+r.cost,0) / Math.max(1, item.systemCount)
        : 0;

      if (item.isNS) {
        const phys     = _nsCounts[k];
        const diff     = (phys != null && !isNaN(phys)) ? phys - item.systemNsCount : null;
        if (diff !== null) { totalNsVariance += diff; nsGroupsEntered++; }
        const short    = diff !== null && diff < 0 ? Math.abs(diff) * unitCost : 0;
        totalExpected += item.systemNsCount;
        if (diff !== null && diff < 0) { totalMissing += Math.abs(diff); missingValue += short; }
        return { item, type:'ns', phys, diff, short };
      } else {
        const missing  = item.systemSerials.filter(s => !st.matched.has(s.toUpperCase()));
        const matched  = [...st.matched];
        const unexp    = st.unexpected;
        const mVal     = missing.length * unitCost;
        totalExpected += item.systemSerials.length;
        totalMatched  += matched.length;
        totalMissing  += missing.length;
        totalUnexpected += unexp.length;
        missingValue   += mVal;
        missing.forEach(s => allMissingSerials.push({ serial:s, item }));
        unexp.forEach(s => allUnexpectedSerials.push({ serial:s, item }));
        if (item.hasBoth) {
          const phys = _nsCounts[k];
          const diff = (phys != null && !isNaN(phys)) ? phys - item.systemNsCount : null;
          if (diff !== null) { totalNsVariance += diff; nsGroupsEntered++; }
          return { item, type:'mixed', matched, missing, unexp, mVal, phys, nsDiff: diff };
        }
        return { item, type:'serial', matched, missing, unexp, mVal };
      }
    });

    _report = { productReports, totalExpected, totalMatched, totalMissing, totalUnexpected,
                totalNsVariance, nsGroupsEntered, missingValue, allMissingSerials, allUnexpectedSerials };

    // Save to DB
    DB.addAuditRecord({
      id: Date.now(), date: new Date().toISOString(),
      scope: _countList.map(i => i.product + (i.location?' @ '+i.location:'')).join(', '),
      productCount: _countList.length,
      locF: '', catF: '', prodF: '',
      expected: totalExpected, matched: totalMatched, missing: totalMissing,
      unexpected: totalUnexpected, lost: 0, missingValue,
      nsVariance: nsGroupsEntered > 0 ? totalNsVariance : null,
      missingSerials: allMissingSerials.map(r=>r.serial),
      unexpectedSerials: allUnexpectedSerials.map(r=>r.serial),
    });

    _renderReport();

    document.getElementById('audit-active-panel').style.display = 'none';
    document.getElementById('audit-report-panel').style.display = '';
    _wireReportButtons();
  }

  function _renderReport() {
    const { productReports, totalExpected, totalMatched, totalMissing, totalUnexpected,
            totalNsVariance, nsGroupsEntered, missingValue } = _report;

    // Summary cards
    document.getElementById('audit-report-summary').innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="svc-stat-card" style="background:#eaf7ee;border-color:#b8e0c4;color:#1a6b38;flex:1;min-width:110px;">
          <div class="svc-stat-count">${totalMatched}<span style="font-size:14px;font-weight:400;margin-left:4px;">/ ${totalExpected}</span></div>
          <div class="svc-stat-label">✅ Serials matched</div>
          <div class="svc-stat-value">${totalExpected>0?Math.round(totalMatched/totalExpected*100):100}% found</div>
        </div>
        <div class="svc-stat-card" style="background:#fffbf0;border-color:#f0d860;color:#9c6000;flex:1;min-width:110px;">
          <div class="svc-stat-count">${totalMissing}</div>
          <div class="svc-stat-label">⚠ Serials missing</div>
          <div class="svc-stat-value">${fmt$(missingValue)}</div>
        </div>
        <div class="svc-stat-card" style="background:#fef0ea;border-color:#f5c6b0;color:#9c2a00;flex:1;min-width:110px;">
          <div class="svc-stat-count">${totalUnexpected}</div>
          <div class="svc-stat-label">❓ Unexpected serials</div>
          <div class="svc-stat-value">Not in system</div>
        </div>
        ${nsGroupsEntered > 0 ? `<div class="svc-stat-card" style="background:${totalNsVariance===0?'#eaf7ee':'#fffbf0'};border-color:${totalNsVariance===0?'#b8e0c4':'#f0d860'};color:${totalNsVariance===0?'#1a6b38':'#9c6000'};flex:1;min-width:110px;">
          <div class="svc-stat-count">${totalNsVariance>0?'+':''}${totalNsVariance}</div>
          <div class="svc-stat-label">📦 NS total variance</div>
          <div class="svc-stat-value">${nsGroupsEntered} group${nsGroupsEntered!==1?'s':''} counted</div>
        </div>` : ''}
      </div>
      ${totalMissing > 0 ? `<div style="margin-bottom:12px;padding:10px 14px;background:#fffbf0;border:1.5px solid #f0d860;border-radius:8px;font-size:13px;color:#7a5000;">
        <strong>⚠ ${totalMissing} missing serial${totalMissing!==1?'s':''}</strong> detected — use <strong>Write off</strong> on items below to permanently remove them from inventory and record as lost stock.
      </div>` : ''}`;

    // Per-product report panels
    const reportsHtml = productReports.map((pr, idx) => {
      const item = pr.item;
      if (pr.type === 'ns') {
        const diffStr = pr.diff === null ? 'Not counted' : pr.diff === 0 ? '✅ Correct' : (pr.diff > 0 ? `↑ Over by ${pr.diff}` : `↓ Short by ${Math.abs(pr.diff)}`);
        const rc = pr.diff === null ? '' : pr.diff === 0 ? 'audit-row-match' : 'audit-row-missing';
        return `<div class="panel" style="margin-bottom:1rem;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">${_esc(item.product)}${item.location?` <span class="loc-badge">${_esc(item.location)}</span>`:''}</div>
          <table class="product-stock-table"><thead><tr>
            <th>System</th><th>Counted</th><th>Variance</th><th>Value short</th><th>Result</th>
          </tr></thead><tbody><tr class="${rc}">
            <td style="font-weight:600">${item.systemNsCount}</td>
            <td style="font-weight:600">${pr.phys != null ? pr.phys : '—'}</td>
            <td style="font-weight:700;color:${pr.diff===null?'var(--text-hint)':pr.diff===0?'#1a7a3c':pr.diff>0?'#1a5080':'#9c2a00'}">${pr.diff!=null?(pr.diff>0?'+':'')+pr.diff:'—'}</td>
            <td style="font-size:12px">${pr.short>0?fmt$(pr.short):'—'}</td>
            <td><span class="audit-badge ${pr.diff===null?'audit-badge-missing':pr.diff===0?'audit-badge-match':'audit-badge-missing'}">${diffStr}</span></td>
          </tr></tbody></table>
        </div>`;
      }

      // Serialised or mixed
      const allRows = [
        ...pr.missing.map(s => ({ serial:s, cat:'missing' })),
        ...(pr.unexp||[]).map(s => ({ serial:s, cat:'unexpected' })),
        ...pr.matched.map(s => ({ serial:s, cat:'matched' })),
      ];

      const tableRows = allRows.map(r => {
        const rc    = r.cat==='matched'?'audit-row-match':r.cat==='missing'?'audit-row-missing':'audit-row-unexpected';
        const badge = r.cat==='matched'    ? '<span class="audit-badge audit-badge-match">✅ Matched</span>'
                    : r.cat==='missing'    ? '<span class="audit-badge audit-badge-missing">⚠ Missing</span>'
                    : '<span class="audit-badge audit-badge-unexpected">❓ Unexpected</span>';
        const lostBtn = r.cat==='missing'
          ? `<button class="btn btn-ghost btn-xs audit-mark-lost" data-serial="${_esc(r.serial)}" style="color:#9c2a00;border-color:#f5c6b0;white-space:nowrap;">Write off</button>` : '';
        const rowId = `audit-row-${r.serial.replace(/[^a-z0-9]/gi,'_')}`;
        const info  = Inventory.getAllSerialRows().find(row => row.serial.toUpperCase() === r.serial.toUpperCase()) || {};
        return `<tr class="${rc}" id="${rowId}">
          <td>${badge}</td>
          <td style="font-family:var(--mono);font-size:11px;font-weight:500">${_esc(r.serial)}</td>
          <td>${lostBtn}</td>
        </tr>`;
      }).join('');

      const nsSection = (pr.type === 'mixed' && item.systemNsCount > 0) ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">NO-SERIAL ITEMS</div>
          <div style="display:flex;gap:16px;font-size:13px;">
            <span>System: <strong>${item.systemNsCount}</strong></span>
            <span>Counted: <strong>${pr.phys!=null?pr.phys:'—'}</strong></span>
            ${pr.nsDiff!=null?`<span style="font-weight:700;color:${pr.nsDiff===0?'#1a7a3c':pr.nsDiff>0?'#1a5080':'#9c6000'}">${pr.nsDiff>0?'+':''}${pr.nsDiff} variance</span>`:''}
          </div>
        </div>` : '';

      return `<div class="panel" style="margin-bottom:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-weight:600;font-size:14px;">${_esc(item.product)}${item.location?` <span class="loc-badge">${_esc(item.location)}</span>`:''}</div>
          <div style="font-size:12px;color:${pr.missing.length===0&&(pr.unexp||[]).length===0?'#1a7a3c':'#9c6000'};font-weight:600">
            ${pr.matched.length}/${item.systemSerials.length} matched
            ${pr.missing.length>0?' · ⚠ '+pr.missing.length+' missing':''}
            ${(pr.unexp||[]).length>0?' · ❓ '+(pr.unexp||[]).length+' unexpected':''}
          </div>
        </div>
        ${allRows.length ? `<div class="table-wrap"><table>
          <thead><tr><th style="width:18%">Result</th><th style="width:62%">Serial</th><th style="width:20%"></th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table></div>` : '<div class="empty" style="padding:.5rem">Nothing to show</div>'}
        ${nsSection}
        ${pr.missing.length > 1 ? `<div style="margin-top:8px;"><button class="btn btn-ghost btn-xs audit-write-off-product" data-idx="${idx}" style="color:#9c2a00;border-color:#f5c6b0;">Write off all ${pr.missing.length} missing</button></div>` : ''}
      </div>`;
    }).join('');

    document.getElementById('audit-report-products').innerHTML = reportsHtml;

    // Wire write-off buttons
    document.querySelectorAll('.audit-mark-lost').forEach(btn => {
      btn.addEventListener('click', () => _writeOff([btn.dataset.serial], btn));
    });
    document.querySelectorAll('.audit-write-off-product').forEach(btn => {
      btn.addEventListener('click', () => {
        const pr = _report.productReports[parseInt(btn.dataset.idx)];
        if (!pr || !pr.missing?.length) return;
        const remaining = pr.missing.filter(s => !_lostSet.has(s.toUpperCase()));
        if (!remaining.length) return;
        if (!confirm(`Write off all ${remaining.length} missing serials for "${pr.item.product}" as lost?\nThis removes them from inventory permanently.`)) return;
        _writeOff(remaining);
        btn.remove();
      });
    });
  }

  function _wireReportButtons() {
    const newBtn = document.getElementById('btn-new-count');
    if (newBtn && !newBtn._wired) { newBtn._wired = true; newBtn.addEventListener('click', _reset); }
    const exportBtn = document.getElementById('btn-audit-export-report');
    if (exportBtn && !exportBtn._wired) { exportBtn._wired = true; exportBtn.addEventListener('click', _exportCSV); }
  }

  // ── write-off ─────────────────────────────────────────────────────────
  function _writeOff(serials, singleBtn) {
    const conf = singleBtn
      ? confirm(`Write off "${serials[0]}" as lost stock?\nThis removes it from inventory permanently.`)
      : true; // already confirmed by caller
    if (!conf) return;
    const now = new Date().toISOString();
    serials.forEach(serial => {
      const key  = serial.toUpperCase();
      if (_lostSet.has(key)) return;
      _lostSet.add(key);
      const info = Inventory.getAllSerialRows().find(r => r.serial.toUpperCase() === key) || {};
      DB.addMovement({
        id: Date.now() + Math.random(), type: 'OUT',
        product: info.product||'Unknown', category: info.category||'', location: info.location||'',
        serials: [serial], customer: 'Lost Stock — Count Write-off',
        by: '', ref: `Count: ${_countList.map(i=>i.product).join(', ')}`,
        date: now, isLost: true,
      });
      // Update UI
      if (singleBtn) {
        singleBtn.textContent = '✓ Written off'; singleBtn.disabled = true; singleBtn.style.color = '#888';
        const rowEl = document.getElementById(`audit-row-${serial.replace(/[^a-z0-9]/gi,'_')}`);
        if (rowEl) { rowEl.classList.remove('audit-row-missing'); const b=rowEl.querySelector('.audit-badge'); if(b){b.className='audit-badge';b.style.cssText='background:#f5d8d8;color:#9c2a00;';b.textContent='🗑 Written off';} }
      }
    });
    // Patch DB record
    const records = DB.getAuditRecords();
    if (records.length) { records[records.length-1].lost = _lostSet.size; DB.save(); }
  }

  // ── pause ─────────────────────────────────────────────────────────────
  function _pause() {
    if (!confirm('Pause this count?\n\nYour progress will be saved and you can resume or export the missing serial list from the audit page.')) return;

    // Serialise Sets to arrays for storage
    const scannedSerializable = {};
    Object.entries(_scanned).forEach(([k, v]) => {
      scannedSerializable[k] = { matched: [...v.matched], unexpected: v.unexpected };
    });

    // Calculate missing at pause time for summary
    const missingSerials = [];
    _countList.forEach(item => {
      if (item.isNS) return;
      const key     = item.product + '||' + (item.location || '');
      const scanned = new Set(scannedSerializable[key]?.matched?.map(s => s.toUpperCase()) || []);
      (item.systemSerials || []).forEach(s => {
        if (!scanned.has(s.toUpperCase())) missingSerials.push({ serial: s, product: item.product, location: item.location });
      });
    });

    DB.savePausedAudit({
      countList:  _countList,
      scanned:    scannedSerializable,
      nsCounts:   _nsCounts,
      lostSet:    [..._lostSet],
      missing:    missingSerials,
      pausedAt:   new Date().toISOString(),
    });

    // Auto-download missing serials CSV
    if (missingSerials.length > 0) {
      const rows = [['Serial Number', 'Product', 'Location', 'Status']];
      missingSerials.forEach(m => rows.push([m.serial, m.product, m.location || '', 'Not scanned']));
      const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a    = Object.assign(document.createElement('a'), {
        href:     URL.createObjectURL(blob),
        download: `missing-serials-${new Date().toISOString().slice(0,10)}.csv`,
      });
      a.click(); URL.revokeObjectURL(a.href);
    }

    _reset();
    // Show resume banner
    _checkPausedAudit();
  }

  // ── cancel/reset ──────────────────────────────────────────────────────
  function _cancel() {
    if (!confirm('Cancel this count? Progress will be lost.')) return;
    _reset();
  }

  function _reset() {
    _countList = []; _scanned = {}; _nsCounts = {}; _lostSet = new Set();
    _serialLookup = {}; _phase = 1; _report = null;
    document.getElementById('audit-setup-panel').style.display  = '';
    document.getElementById('audit-active-panel').style.display = 'none';
    document.getElementById('audit-report-panel').style.display = 'none';
    const input = document.getElementById('audit-serial-input');
    if (input) { input.disabled = false; input.value = ''; }
    const finBtn = document.getElementById('btn-finish-audit');
    if (finBtn) { finBtn.disabled = false; finBtn.textContent = 'Complete Count'; }
    _populateLocFilter();
    _populateProductPicker();
    _renderCountList();
    _renderHistory();
  }

  // ── export CSV ────────────────────────────────────────────────────────
  function _exportCSV() {
    if (!_report) return;
    const rows = [['Product','Location','Type','Serial / Group','System Qty','Physical Qty','Variance','Result','Written Off']];
    _report.productReports.forEach(pr => {
      const item = pr.item;
      if (pr.type === 'ns') {
        rows.push([item.product, item.location||'', 'No-serial', item.product, item.systemNsCount, pr.phys!=null?pr.phys:'', pr.diff!=null?pr.diff:'', pr.diff===0?'Correct':pr.diff>0?'Over':'Short', '']);
      } else {
        (pr.missing||[]).forEach(s => rows.push([item.product, item.location||'', 'Serialised', s, 1, 0, -1, 'Missing', _lostSet.has(s.toUpperCase())?'Yes':'No']));
        (pr.unexp||[]).forEach(s => rows.push([item.product, item.location||'', 'Serialised', s, 0, 1, 1, 'Unexpected', '']));
        (pr.matched||[]).forEach(s => rows.push([item.product, item.location||'', 'Serialised', s, 1, 1, 0, 'Matched', 'No']));
        if (pr.type === 'mixed') {
          rows.push([item.product, item.location||'', 'No-serial', item.product+' (NS)', item.systemNsCount, pr.phys!=null?pr.phys:'', pr.nsDiff!=null?pr.nsDiff:'', pr.nsDiff===0?'Correct':pr.nsDiff>0?'Over':'Short', '']);
        }
      }
    });
    const csv  = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const a    = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`stock-count-${new Date().toISOString().slice(0,10)}.csv`});
    a.click(); URL.revokeObjectURL(a.href);
  }

  return { init };

})();
