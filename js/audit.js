// audit.js — Stock Audit / Variance Report v55+
// Serial items: scan one by one. No-serial items: enter physical count per product group.
// Deployed / in-transit = not on site, entirely excluded.

const Audit = (() => {

  let _state = null;

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const fmt$ = n => n > 0
    ? '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  // ── init ──────────────────────────────────────────────────────────────
  function init() {
    _populateFilters();
    _renderHistory();
    const startBtn = document.getElementById('btn-start-audit');
    if (startBtn && !startBtn._auditWired) {
      startBtn._auditWired = true;
      startBtn.addEventListener('click', start);
    }
  }

  function _populateFilters() {
    const inStock = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
    const locSel  = document.getElementById('audit-loc-filter');
    if (locSel) {
      const cur = locSel.value;
      locSel.innerHTML = '<option value="">All locations</option>' +
        Inventory.getLocations().map(l => `<option value="${_esc(l)}"${l===cur?' selected':''}>${_esc(l)}</option>`).join('');
    }
    const catSel = document.getElementById('audit-cat-filter');
    if (catSel) {
      const cur = catSel.value;
      catSel.innerHTML = '<option value="">All categories</option>' +
        Inventory.CATEGORIES.map(c => `<option value="${_esc(c)}"${c===cur?' selected':''}>${_esc(c)}</option>`).join('');
    }
    const prodSel = document.getElementById('audit-product-filter');
    if (prodSel) {
      const products = [...new Set(inStock.map(r => r.product))].sort();
      const cur = prodSel.value;
      prodSel.innerHTML = '<option value="">All products</option>' +
        products.map(p => `<option value="${_esc(p)}"${p===cur?' selected':''}>${_esc(p)}</option>`).join('');
    }
  }

  // ── audit history ─────────────────────────────────────────────────────
  function _renderHistory() {
    const el = document.getElementById('audit-history-body');
    if (!el) return;
    const records = DB.getAuditRecords().slice().reverse();
    if (!records.length) {
      el.innerHTML = '<div class="empty" style="padding:.75rem 0">No audits recorded yet</div>';
      return;
    }
    el.innerHTML = `<table class="product-stock-table">
      <thead><tr>
        <th style="width:16%">Date</th><th style="width:20%">Scope</th>
        <th style="width:9%">Expected</th><th style="width:9%">Matched</th>
        <th style="width:9%">Missing</th><th style="width:9%">Lost</th>
        <th style="width:9%">Unexpected</th><th style="width:9%">NS variance</th>
        <th style="width:10%">Value at risk</th>
      </tr></thead>
      <tbody>${records.map(r => `<tr>
        <td style="color:var(--text-muted);font-size:12px">${fmtDate(r.date)}</td>
        <td style="font-weight:500;font-size:12px">${_esc(r.scope)}</td>
        <td>${r.expected}</td>
        <td style="color:#1a7a3c;font-weight:600">${r.matched}</td>
        <td style="color:${r.missing>0?'#9c6000':'var(--text-muted)'};font-weight:600">${r.missing}</td>
        <td style="color:${(r.lost||0)>0?'#9c2a00':'var(--text-muted)'};font-weight:600">${r.lost||0}</td>
        <td style="color:${r.unexpected>0?'#9c2a00':'var(--text-muted)'};font-weight:600">${r.unexpected}</td>
        <td style="color:${(r.nsVariance||0)!==0?'#9c6000':'var(--text-muted)'};font-weight:600">${r.nsVariance!=null?(r.nsVariance>0?'+':'')+r.nsVariance:'—'}</td>
        <td style="font-size:12px;font-weight:600;color:var(--aio-purple)">${fmt$(r.missingValue||0)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ── start ─────────────────────────────────────────────────────────────
  function start() {
    const locF  = document.getElementById('audit-loc-filter')?.value  || '';
    const catF  = document.getElementById('audit-cat-filter')?.value  || '';
    const prodF = document.getElementById('audit-product-filter')?.value || '';

    const inStock = Inventory.getAllSerialRows().filter(r => {
      if (r.status !== 'in-stock') return false;
      if (locF  && r.location !== locF)  return false;
      if (catF  && r.category !== catF)  return false;
      if (prodF && r.product  !== prodF) return false;
      return true;
    });

    // Split: serialised (real serials) vs no-serial (NS- prefix)
    const serialRows   = inStock.filter(r => !r.serial.startsWith('NS-'));
    const nsRows       = inStock.filter(r =>  r.serial.startsWith('NS-'));

    // Build expected maps
    const expectedMap = {};
    serialRows.forEach(r => { expectedMap[r.serial.toUpperCase()] = r; });

    // Group NS items by product+location for quantity counting
    const nsGroups = {};
    nsRows.forEach(r => {
      const k = r.product + '||' + (r.location || '');
      if (!nsGroups[k]) nsGroups[k] = { product: r.product, location: r.location, category: r.category, systemCount: 0, cost: 0, serials: [] };
      nsGroups[k].systemCount++;
      if (r.cost != null) nsGroups[k].cost += r.cost;
      nsGroups[k].serials.push(r.serial);
    });

    const parts = [];
    if (prodF) parts.push(prodF); else if (catF) parts.push(catF); else parts.push('All products');
    if (locF) parts.push(`@ ${locF}`);
    const scopeLabel = parts.join(' ');

    _state = {
      expectedMap,   // serial items
      nsGroups,      // no-serial groups
      nsCounts: {},  // user-entered counts keyed by product||location
      scanned: {},
      lostSet: new Set(),
      scopeLabel, locF, catF, prodF,
      finished: false, _report: null,
    };

    document.getElementById('audit-setup-panel').style.display  = 'none';
    document.getElementById('audit-active-panel').style.display  = '';
    document.getElementById('audit-scope-label').textContent     = scopeLabel;
    document.getElementById('audit-progress-title').textContent  = `Auditing: ${scopeLabel}`;
    _updateCounts();

    // Render NS count panel + serial scan panel
    _renderActivePanel();

    // Wire serial input
    const input  = document.getElementById('audit-serial-input');
    const submit = document.getElementById('btn-audit-submit');
    input.disabled = false; submit.disabled = false; input.value = '';
    if (!input._auditWired) {
      input._auditWired = true;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _submit(); } });
      submit.addEventListener('click', _submit);
    }

    const finBtn = document.getElementById('btn-finish-audit');
    finBtn.textContent = 'Finish Audit'; finBtn.disabled = false;
    if (!finBtn._auditWired) { finBtn._auditWired = true; finBtn.addEventListener('click', finish); }
    const cancelBtn = document.getElementById('btn-cancel-audit');
    if (!cancelBtn._auditWired) { cancelBtn._auditWired = true; cancelBtn.addEventListener('click', cancel); }
    const exportBtn = document.getElementById('btn-audit-export');
    exportBtn.style.display = 'none';
    if (!exportBtn._auditWired) { exportBtn._auditWired = true; exportBtn.addEventListener('click', _exportCSV); }
    const camBtn = document.getElementById('btn-audit-camera');
    if (camBtn && !camBtn._auditWired) {
      camBtn._auditWired = true;
      camBtn.addEventListener('click', () => {
        if (typeof Scanner !== 'undefined') Scanner.start(s => { input.value = s; _submit(); });
      });
    }
    input.focus();
  }

  // ── render active panel (NS table + serial scan) ──────────────────────
  function _renderActivePanel() {
    const resultsEl = document.getElementById('audit-results-body');
    const nsKeys    = Object.keys(_state.nsGroups);

    let nsHtml = '';
    if (nsKeys.length > 0) {
      nsHtml = `
        <div style="margin-bottom:16px;padding:12px 16px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:10px;">
          <div class="panel-title" style="margin-bottom:10px;">📦 No-serial items — enter physical count</div>
          <table class="product-stock-table">
            <thead><tr>
              <th style="width:30%">Product</th>
              <th style="width:16%">Category</th>
              <th style="width:16%">Location</th>
              <th style="width:12%">System count</th>
              <th style="width:14%">Physical count</th>
              <th style="width:12%">Variance</th>
            </tr></thead>
            <tbody id="audit-ns-body">
              ${nsKeys.map(k => {
                const g = _state.nsGroups[k];
                return `<tr id="audit-ns-row-${_esc(k.replace(/[^a-z0-9]/gi,'_'))}">
                  <td style="font-weight:500">${_esc(g.product)}</td>
                  <td><span class="cat-badge">${_esc(g.category||'—')}</span></td>
                  <td>${g.location?`<span class="loc-badge">${_esc(g.location)}</span>`:'—'}</td>
                  <td style="font-weight:600;color:var(--success-text)">${g.systemCount}</td>
                  <td><input type="number" min="0" class="fi audit-ns-input" style="width:70px;padding:4px 8px;font-size:13px;"
                    data-nskey="${_esc(k)}" placeholder="0" /></td>
                  <td class="audit-ns-variance" id="audit-ns-var-${_esc(k.replace(/[^a-z0-9]/gi,'_'))}">—</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    resultsEl.innerHTML = nsHtml +
      '<div class="empty" style="padding:1rem">No serials scanned yet — start scanning above</div>';

    // Wire NS inputs
    resultsEl.querySelectorAll('.audit-ns-input').forEach(inp => {
      inp.addEventListener('input', () => _updateNsVariance(inp.dataset.nskey, inp.value));
    });
  }

  function _updateNsVariance(key, val) {
    const g    = _state.nsGroups[key];
    if (!g) return;
    const phys = val === '' ? null : parseInt(val, 10);
    _state.nsCounts[key] = phys;

    const varId  = 'audit-ns-var-' + key.replace(/[^a-z0-9]/gi,'_');
    const varEl  = document.getElementById(varId);
    if (!varEl) return;
    if (phys === null || isNaN(phys)) { varEl.textContent = '—'; varEl.style.color = ''; return; }
    const diff = phys - g.systemCount;
    varEl.textContent = (diff > 0 ? '+' : '') + diff;
    varEl.style.color = diff === 0 ? '#1a7a3c' : diff > 0 ? '#1a5080' : '#9c6000';
    varEl.style.fontWeight = diff !== 0 ? '700' : '400';
  }

  // ── submit serial ─────────────────────────────────────────────────────
  function _submit() {
    if (!_state || _state.finished) return;
    const input    = document.getElementById('audit-serial-input');
    const raw      = (input?.value || '').trim();
    if (!raw) return;
    input.value = '';
    const key      = raw.toUpperCase();
    const feedback = document.getElementById('audit-scan-feedback');

    if (raw.toUpperCase().startsWith('NS-')) {
      feedback.style.color = '#9c6000';
      feedback.textContent = `⚠ ${raw} — no-serial item, use the count table above`;
      setTimeout(() => { feedback.textContent = ''; }, 3000);
      return;
    }

    if (_state.scanned[key]) {
      feedback.style.color = 'var(--text-muted)';
      feedback.textContent = `⚠ ${raw} already scanned`;
      setTimeout(() => { if (feedback.textContent.includes(raw)) feedback.textContent = ''; }, 2000);
      return;
    }

    if (_state.expectedMap[key]) {
      _state.scanned[key] = { serial: raw, category: 'matched' };
      feedback.style.color = '#1a7a3c';
      feedback.textContent = `✅ ${raw} — ${_state.expectedMap[key].product}`;
    } else {
      _state.scanned[key] = { serial: raw, category: 'unexpected' };
      feedback.style.color = '#9c2a00';
      feedback.textContent = `❓ ${raw} — not found in stock`;
    }

    _updateCounts();
    _renderSerialTable();
    input.focus();
  }

  function _updateCounts() {
    if (!_state) return;
    const scanned    = Object.values(_state.scanned);
    const matched    = scanned.filter(s => s.category === 'matched').length;
    const unexpected = scanned.filter(s => s.category === 'unexpected').length;
    const total      = Object.keys(_state.expectedMap).length;
    const pct        = total > 0 ? Math.round(matched / total * 100) : 0;
    document.getElementById('audit-count-matched').textContent   = matched;
    document.getElementById('audit-count-missing').textContent   = total - matched;
    document.getElementById('audit-count-unexpected').textContent = unexpected;
    document.getElementById('audit-progress-fill').style.width   = pct + '%';
  }

  function _renderSerialTable() {
    // Replace the "No serials scanned" placeholder but keep NS table
    const resultsEl = document.getElementById('audit-results-body');
    // Find existing NS panel or empty div
    const nsPanel = resultsEl.querySelector('div[style*="No-serial"]') ||
                    resultsEl.firstElementChild;

    const rows = Object.values(_state.scanned).reverse();
    const tableHtml = `<div class="table-wrap" id="audit-serial-table"><table>
      <thead><tr>
        <th style="width:20%">Serial</th><th style="width:32%">Product</th>
        <th style="width:16%">Category</th><th style="width:16%">Location</th><th style="width:16%">Result</th>
      </tr></thead>
      <tbody>${rows.map(s => {
        const info = _state.expectedMap[s.serial.toUpperCase()] || {};
        const rc   = s.category === 'matched' ? 'audit-row-match' : 'audit-row-unexpected';
        const badge = s.category === 'matched'
          ? '<span class="audit-badge audit-badge-match">✅ In stock</span>'
          : '<span class="audit-badge audit-badge-unexpected">❓ Not in system</span>';
        return `<tr class="${rc}">
          <td style="font-family:var(--mono);font-size:11px">${_esc(s.serial)}</td>
          <td style="font-weight:500">${_esc(info.product||'—')}</td>
          <td>${info.category?`<span class="cat-badge">${_esc(info.category)}</span>`:'—'}</td>
          <td>${info.location?`<span class="loc-badge">${_esc(info.location)}</span>`:'—'}</td>
          <td>${badge}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    // Replace or append serial table
    const existing = document.getElementById('audit-serial-table');
    const emptyDiv = resultsEl.querySelector('.empty');
    if (existing) {
      existing.outerHTML = tableHtml;
    } else if (emptyDiv) {
      emptyDiv.outerHTML = tableHtml;
    } else {
      resultsEl.insertAdjacentHTML('beforeend', tableHtml);
    }
  }

  // ── finish: variance report + save ────────────────────────────────────
  function finish() {
    if (!_state) return;
    _state.finished = true;
    document.getElementById('audit-serial-input').disabled  = true;
    document.getElementById('btn-audit-submit').disabled    = true;
    document.getElementById('btn-finish-audit').textContent = '✓ Done';
    document.getElementById('btn-finish-audit').disabled    = true;
    document.getElementById('btn-audit-export').style.display = '';
    document.getElementById('audit-scan-feedback').textContent = '';
    document.getElementById('audit-progress-title').textContent = 'Variance Report';

    // Also lock NS inputs
    document.querySelectorAll('.audit-ns-input').forEach(inp => inp.disabled = true);

    const scannedKeys = new Set(Object.keys(_state.scanned));
    const missingRows = Object.entries(_state.expectedMap)
      .filter(([k]) => !scannedKeys.has(k))
      .map(([, r]) => ({ serial: r.serial, category: 'missing', info: r }));
    const matchedRows = Object.values(_state.scanned)
      .filter(s => s.category === 'matched')
      .map(s => ({ serial: s.serial, category: 'matched', info: _state.expectedMap[s.serial.toUpperCase()] || {} }));
    const unexpectedRows = Object.values(_state.scanned)
      .filter(s => s.category === 'unexpected')
      .map(s => ({ serial: s.serial, category: 'unexpected', info: {} }));

    // NS variance summary
    const nsVariance = Object.entries(_state.nsCounts).reduce((total, [k, phys]) => {
      if (phys === null || isNaN(phys)) return total;
      return total + (phys - (_state.nsGroups[k]?.systemCount || 0));
    }, 0);
    const nsEntered = Object.keys(_state.nsCounts).filter(k => _state.nsCounts[k] !== null).length;

    _state._report = [...missingRows, ...unexpectedRows, ...matchedRows];

    const total        = Object.keys(_state.expectedMap).length;
    const matchPct     = total > 0 ? Math.round(matchedRows.length / total * 100) : 100;
    const missingValue = missingRows.reduce((a, r) => a + (r.info.cost || 0), 0);

    DB.addAuditRecord({
      id: Date.now(), date: new Date().toISOString(), scope: _state.scopeLabel,
      locF: _state.locF, catF: _state.catF, prodF: _state.prodF,
      expected: total, matched: matchedRows.length,
      missing: missingRows.length, unexpected: unexpectedRows.length,
      lost: 0, missingValue,
      nsVariance: nsEntered > 0 ? nsVariance : null,
      missingSerials: missingRows.map(r => r.serial),
      unexpectedSerials: unexpectedRows.map(r => r.serial),
    });

    _renderReport(missingRows, matchedRows, unexpectedRows, total, matchPct, missingValue, nsVariance, nsEntered);
  }

  function _renderReport(missingRows, matchedRows, unexpectedRows, total, matchPct, missingValue, nsVariance, nsEntered) {
    // NS variance summary cards
    const nsGroupKeys = Object.keys(_state.nsGroups);
    let nsReportHtml = '';
    if (nsGroupKeys.length > 0) {
      const nsRows = nsGroupKeys.map(k => {
        const g    = _state.nsGroups[k];
        const phys = _state.nsCounts[k];
        const diff = (phys != null && !isNaN(phys)) ? phys - g.systemCount : null;
        const rc   = diff === null ? '' : diff === 0 ? 'audit-row-match' : 'audit-row-missing';
        const badge = diff === null
          ? '<span class="audit-badge audit-badge-missing">⚠ Not counted</span>'
          : diff === 0
            ? '<span class="audit-badge audit-badge-match">✅ Correct</span>'
            : `<span class="audit-badge audit-badge-missing">${diff>0?'↑ Over':'↓ Short'} ${Math.abs(diff)}</span>`;
        const unitCost = g.systemCount > 0 ? g.cost / g.systemCount : 0;
        const lossVal  = diff !== null && diff < 0 ? fmt$(Math.abs(diff) * unitCost) : '—';
        return `<tr class="${rc}">
          <td style="font-weight:500">${_esc(g.product)}</td>
          <td>${g.category?`<span class="cat-badge">${_esc(g.category)}</span>`:'—'}</td>
          <td>${g.location?`<span class="loc-badge">${_esc(g.location)}</span>`:'—'}</td>
          <td style="font-weight:600">${g.systemCount}</td>
          <td style="font-weight:600;color:${diff===null?'var(--text-hint)':diff===0?'#1a7a3c':diff>0?'#1a5080':'#9c6000'}">${phys != null && !isNaN(phys) ? phys : '—'}</td>
          <td style="font-weight:700;color:${diff===null?'var(--text-hint)':diff===0?'#1a7a3c':diff>0?'#1a5080':'#9c2a00'}">${diff===null?'—':(diff>0?'+':'')+diff}</td>
          <td style="font-size:12px">${lossVal}</td>
          <td>${badge}</td>
        </tr>`;
      }).join('');

      nsReportHtml = `
        <div style="margin-bottom:16px;">
          <div class="panel-title" style="margin-bottom:8px;">📦 No-serial items variance</div>
          <div class="table-wrap"><table class="product-stock-table">
            <thead><tr>
              <th style="width:22%">Product</th><th style="width:13%">Category</th>
              <th style="width:13%">Location</th><th style="width:9%">System</th>
              <th style="width:9%">Counted</th><th style="width:8%">Variance</th>
              <th style="width:12%">Value short</th><th style="width:14%">Result</th>
            </tr></thead>
            <tbody>${nsRows}</tbody>
          </table></div>
        </div>`;
    }

    const summaryHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="svc-stat-card" style="background:#eaf7ee;border-color:#b8e0c4;color:#1a6b38;flex:1;min-width:110px;">
          <div class="svc-stat-count">${matchedRows.length}<span style="font-size:13px;font-weight:400;margin-left:4px;">/ ${total}</span></div>
          <div class="svc-stat-label">✅ Serials matched</div>
          <div class="svc-stat-value">${matchPct}% found</div>
        </div>
        <div class="svc-stat-card" style="background:#fffbf0;border-color:#f0d860;color:#9c6000;flex:1;min-width:110px;">
          <div class="svc-stat-count">${missingRows.length}</div>
          <div class="svc-stat-label">⚠ Serials missing</div>
          <div class="svc-stat-value">${fmt$(missingValue)}</div>
        </div>
        <div class="svc-stat-card" style="background:#fef0ea;border-color:#f5c6b0;color:#9c2a00;flex:1;min-width:110px;">
          <div class="svc-stat-count">${unexpectedRows.length}</div>
          <div class="svc-stat-label">❓ Unexpected</div>
          <div class="svc-stat-value">Not in system</div>
        </div>
        ${nsGroupKeys.length > 0 ? `<div class="svc-stat-card" style="background:${nsVariance===0?'#eaf7ee':Math.abs(nsVariance||0)>0?'#fffbf0':'#f5f5f5'};border-color:${nsVariance===0?'#b8e0c4':'#f0d860'};color:${nsVariance===0?'#1a6b38':'#9c6000'};flex:1;min-width:110px;">
          <div class="svc-stat-count">${nsEntered > 0 ? (nsVariance > 0 ? '+' : '') + nsVariance : '—'}</div>
          <div class="svc-stat-label">📦 NS variance</div>
          <div class="svc-stat-value">${nsEntered}/${nsGroupKeys.length} groups counted</div>
        </div>` : ''}
      </div>
      ${missingRows.length > 0 ? `<div style="margin-bottom:12px;padding:10px 14px;background:#fffbf0;border:1.5px solid #f0d860;border-radius:8px;font-size:13px;color:#7a5000;">
        <strong>⚠ ${missingRows.length} missing serial${missingRows.length!==1?'s':''}</strong> — use <strong>Write off</strong> to permanently remove items that cannot be located.
      </div>` : ''}`;

    const tableRows = _state._report.map(r => {
      const rc    = r.category === 'matched' ? 'audit-row-match' : r.category === 'missing' ? 'audit-row-missing' : 'audit-row-unexpected';
      const badge = r.category === 'matched'    ? '<span class="audit-badge audit-badge-match">✅ Matched</span>'
                  : r.category === 'missing'    ? '<span class="audit-badge audit-badge-missing">⚠ Missing</span>'
                  : '<span class="audit-badge audit-badge-unexpected">❓ Unexpected</span>';
      const cost  = r.info.cost != null ? '$' + r.info.cost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
      const lostBtn = r.category === 'missing'
        ? `<button class="btn btn-ghost btn-xs audit-mark-lost" data-serial="${_esc(r.serial)}" style="color:#9c2a00;border-color:#f5c6b0;white-space:nowrap;">Write off</button>` : '';
      return `<tr class="${rc}" id="audit-row-${r.serial.replace(/[^a-z0-9]/gi,'_')}">
        <td>${badge}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${_esc(r.serial)}</td>
        <td style="font-weight:500">${_esc(r.info.product||'—')}</td>
        <td>${r.info.category?`<span class="cat-badge">${_esc(r.info.category)}</span>`:'—'}</td>
        <td>${r.info.location?`<span class="loc-badge">${_esc(r.info.location)}</span>`:'—'}</td>
        <td style="font-size:12px">${cost}</td>
        <td>${lostBtn}</td>
      </tr>`;
    }).join('');

    const serialSectionHtml = _state._report.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div class="panel-title" style="margin-bottom:8px;">🔢 Serialised items variance</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="width:11%">Result</th><th style="width:18%">Serial</th>
            <th style="width:23%">Product</th><th style="width:13%">Category</th>
            <th style="width:13%">Location</th><th style="width:11%">Cost</th><th style="width:11%"></th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table></div>
      </div>` : '';

    document.getElementById('audit-results-body').innerHTML = summaryHtml + nsReportHtml + serialSectionHtml +
      `<div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost btn-sm" id="btn-new-audit">↩ New audit</button>
        ${missingRows.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-write-off-all" style="color:#9c2a00;border-color:#f5c6b0;">Write off all missing serials</button>` : ''}
      </div>`;

    document.getElementById('btn-new-audit')?.addEventListener('click', cancel);
    document.getElementById('btn-write-off-all')?.addEventListener('click', _writeOffAll);
    document.getElementById('audit-results-body').querySelectorAll('.audit-mark-lost').forEach(btn => {
      btn.addEventListener('click', () => _markLost(btn.dataset.serial, btn));
    });
  }

  // ── write-off ─────────────────────────────────────────────────────────
  function _markLost(serial, btn) {
    if (!confirm(`Write off "${serial}" as lost stock?\nThis removes it from inventory permanently.`)) return;
    _doWriteOff([serial]);
    if (btn) { btn.textContent = '✓ Written off'; btn.disabled = true; btn.style.color = '#888'; }
    const rowEl = document.getElementById(`audit-row-${serial.replace(/[^a-z0-9]/gi,'_')}`);
    if (rowEl) {
      rowEl.classList.remove('audit-row-missing');
      const badgeEl = rowEl.querySelector('.audit-badge');
      if (badgeEl) { badgeEl.className='audit-badge'; badgeEl.style.cssText='background:#f5d8d8;color:#9c2a00;'; badgeEl.textContent='🗑 Written off'; }
    }
    _patchLatestAuditRecord();
  }

  function _writeOffAll() {
    const missing = _state._report.filter(r => r.category === 'missing' && !_state.lostSet.has(r.serial.toUpperCase()));
    if (!missing.length) return;
    if (!confirm(`Write off ALL ${missing.length} missing serial${missing.length!==1?'s':''} as lost?\nThis removes them from inventory permanently.`)) return;
    _doWriteOff(missing.map(r => r.serial));
    missing.forEach(r => {
      const btn   = document.querySelector(`[data-serial="${r.serial}"]`);
      const rowEl = document.getElementById(`audit-row-${r.serial.replace(/[^a-z0-9]/gi,'_')}`);
      if (btn) { btn.textContent='✓ Written off'; btn.disabled=true; btn.style.color='#888'; }
      if (rowEl) {
        rowEl.classList.remove('audit-row-missing');
        const b = rowEl.querySelector('.audit-badge');
        if (b) { b.className='audit-badge'; b.style.cssText='background:#f5d8d8;color:#9c2a00;'; b.textContent='🗑 Written off'; }
      }
    });
    document.getElementById('btn-write-off-all')?.remove();
    _patchLatestAuditRecord();
  }

  function _doWriteOff(serials) {
    const now = new Date().toISOString();
    serials.forEach(serial => {
      const key  = serial.toUpperCase();
      const info = _state.expectedMap[key] || {};
      _state.lostSet.add(key);
      DB.addMovement({
        id: Date.now() + Math.random(), type: 'OUT',
        product: info.product||'Unknown', category: info.category||'',
        location: info.location||'', serials: [serial],
        customer: 'Lost Stock — Audit Write-off', by: '', ref: `Audit: ${_state.scopeLabel}`,
        date: now, isLost: true,
      });
    });
  }

  function _patchLatestAuditRecord() {
    const records = DB.getAuditRecords();
    if (!records.length) return;
    records[records.length - 1].lost = _state.lostSet.size;
    DB.save();
  }

  // ── cancel ────────────────────────────────────────────────────────────
  function cancel() {
    _state = null;
    document.getElementById('audit-setup-panel').style.display    = '';
    document.getElementById('audit-active-panel').style.display   = 'none';
    document.getElementById('audit-results-body').innerHTML       = '';
    document.getElementById('audit-scan-feedback').textContent    = '';
    document.getElementById('btn-finish-audit').textContent       = 'Finish Audit';
    document.getElementById('btn-finish-audit').disabled          = false;
    document.getElementById('audit-serial-input').disabled        = false;
    document.getElementById('btn-audit-submit').disabled          = false;
    document.getElementById('audit-progress-fill').style.width    = '0%';
    document.getElementById('audit-count-matched').textContent    = '0';
    document.getElementById('audit-count-missing').textContent    = '0';
    document.getElementById('audit-count-unexpected').textContent = '0';
    document.getElementById('btn-audit-export').style.display     = 'none';
    _populateFilters();
    _renderHistory();
  }

  // ── export CSV ────────────────────────────────────────────────────────
  function _exportCSV() {
    if (!_state) return;
    const rows = [['Type','Result','Serial / Product','Category','Location','System Qty','Physical Qty','Variance','Cost','Written Off']];
    // NS groups
    Object.entries(_state.nsGroups).forEach(([k, g]) => {
      const phys = _state.nsCounts[k];
      const diff = (phys != null && !isNaN(phys)) ? phys - g.systemCount : '';
      rows.push(['No-serial', diff===''?'Not counted':diff===0?'Correct':diff>0?'Over':'Short',
        g.product, g.category||'', g.location||'', g.systemCount, phys!=null?phys:'', diff, '', '']);
    });
    // Serial items
    (_state._report||[]).forEach(r => {
      const label = r.category==='matched'?'Matched':r.category==='missing'?'Missing':'Unexpected';
      const writtenOff = _state.lostSet.has(r.serial.toUpperCase()) ? 'Yes' : 'No';
      rows.push(['Serialised', label, r.serial, r.info.category||'', r.info.location||'', 1, r.category==='matched'?1:0,
        r.category==='matched'?0:r.category==='missing'?-1:1, r.info.cost!=null?r.info.cost:'', writtenOff]);
    });
    const csv  = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const a    = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`stock-audit-${new Date().toISOString().slice(0,10)}.csv`});
    a.click(); URL.revokeObjectURL(a.href);
  }

  return { init };

})();
