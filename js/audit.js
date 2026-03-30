// audit.js — Stock Audit / Variance Report
// Compares physically scanned serials against system records.
// Deployed, in-transit = NOT missing. Only in-stock = expected to find.

const Audit = (() => {

  // ── State ────────────────────────────────────────────────────────────
  let _state = null; // null = not started

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── init: populate filters, wire buttons ────────────────────────────
  function init() {
    _populateFilters();

    // Only wire once
    const startBtn = document.getElementById('btn-start-audit');
    if (startBtn && !startBtn._auditWired) {
      startBtn._auditWired = true;
      startBtn.addEventListener('click', start);
    }
  }

  function _populateFilters() {
    // Location
    const locSel = document.getElementById('audit-loc-filter');
    if (locSel) {
      const locs = Inventory.getLocations();
      const cur  = locSel.value;
      locSel.innerHTML = '<option value="">All locations</option>' +
        locs.map(l => `<option value="${_esc(l)}"${l===cur?' selected':''}>${_esc(l)}</option>`).join('');
    }

    // Category
    const catSel = document.getElementById('audit-cat-filter');
    if (catSel) {
      const cats = Inventory.CATEGORIES;
      const cur  = catSel.value;
      catSel.innerHTML = '<option value="">All categories</option>' +
        cats.map(c => `<option value="${_esc(c)}"${c===cur?' selected':''}>${_esc(c)}</option>`).join('');
    }

    // Product
    const prodSel = document.getElementById('audit-product-filter');
    if (prodSel) {
      const allRows = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
      const products = [...new Set(allRows.map(r => r.product))].sort();
      const cur      = prodSel.value;
      prodSel.innerHTML = '<option value="">All products</option>' +
        products.map(p => `<option value="${_esc(p)}"${p===cur?' selected':''}>${_esc(p)}</option>`).join('');
    }
  }

  // ── start: determine scope, reset state ─────────────────────────────
  function start() {
    const locF  = document.getElementById('audit-loc-filter')?.value  || '';
    const catF  = document.getElementById('audit-cat-filter')?.value  || '';
    const prodF = document.getElementById('audit-product-filter')?.value || '';

    // Build expected set: all in-stock serials matching scope
    const allRows = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
    const scoped  = allRows.filter(r => {
      if (locF  && r.location !== locF)  return false;
      if (catF  && r.category !== catF)  return false;
      if (prodF && r.product  !== prodF) return false;
      return true;
    });

    // Build lookup sets
    const expectedMap = {}; // serial.upper -> row
    scoped.forEach(r => { expectedMap[r.serial.toUpperCase()] = r; });

    // Build deployed set
    const deployedMap = {};
    Inventory.getDeployedSerialRows().forEach(r => { deployedMap[r.serial.toUpperCase()] = r; });

    // Build in-transit set
    const inTransitMap = {};
    Inventory.getAllSerialRows().filter(r => r.status === 'in-transit').forEach(r => {
      inTransitMap[r.serial.toUpperCase()] = r;
    });

    const scopeLabel = [
      prodF || catF || 'All products',
      locF  ? `@ ${locF}` : '(all locations)',
    ].join(' ');

    _state = {
      expected:    expectedMap,   // what we expect to find in-stock
      deployed:    deployedMap,   // deployed — not missing
      inTransit:   inTransitMap,  // in-transit — not missing
      scanned:     {},            // serial.upper -> category result
      locF, catF, prodF,
      scopeLabel,
      finished:    false,
    };

    _renderActive();
    _updateCounts();

    document.getElementById('audit-setup-panel').style.display = 'none';
    document.getElementById('audit-active-panel').style.display = '';
    document.getElementById('audit-scope-label').textContent = scopeLabel;
    document.getElementById('audit-progress-title').textContent = `Auditing: ${scopeLabel}`;

    // Wire serial input
    const input  = document.getElementById('audit-serial-input');
    const submit = document.getElementById('btn-audit-submit');
    if (input && !input._auditWired) {
      input._auditWired = true;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _submitSerial(); } });
      submit.addEventListener('click', _submitSerial);
    }

    // Finish / cancel
    const finBtn = document.getElementById('btn-finish-audit');
    if (finBtn && !finBtn._auditWired) {
      finBtn._auditWired = true;
      finBtn.addEventListener('click', finish);
    }
    const cancelBtn = document.getElementById('btn-cancel-audit');
    if (cancelBtn && !cancelBtn._auditWired) {
      cancelBtn._auditWired = true;
      cancelBtn.addEventListener('click', cancel);
    }
    const exportBtn = document.getElementById('btn-audit-export');
    if (exportBtn && !exportBtn._auditWired) {
      exportBtn._auditWired = true;
      exportBtn.addEventListener('click', exportCSV);
    }

    // Camera scan
    const camBtn = document.getElementById('btn-audit-camera');
    if (camBtn && !camBtn._auditWired) {
      camBtn._auditWired = true;
      camBtn.addEventListener('click', () => {
        if (typeof Scanner !== 'undefined') {
          Scanner.start(serial => {
            document.getElementById('audit-serial-input').value = serial;
            _submitSerial();
          });
        }
      });
    }

    input?.focus();
  }

  // ── submit a scanned serial ──────────────────────────────────────────
  function _submitSerial() {
    if (!_state || _state.finished) return;
    const input = document.getElementById('audit-serial-input');
    const raw   = (input?.value || '').trim();
    if (!raw) return;
    input.value = '';

    const key = raw.toUpperCase();
    const feedback = document.getElementById('audit-scan-feedback');

    // Already scanned?
    if (_state.scanned[key]) {
      feedback.style.color = 'var(--text-muted)';
      feedback.textContent = `⚠ ${raw} already scanned`;
      setTimeout(() => { feedback.textContent = ''; }, 2000);
      return;
    }

    let category, feedbackText, feedbackColor;

    if (_state.expected[key]) {
      category     = 'matched';
      feedbackText = `✅ ${raw} — in stock (${_state.expected[key].product})`;
      feedbackColor = '#1a7a3c';
    } else if (_state.deployed[key]) {
      const d = _state.deployed[key];
      category     = 'deployed';
      feedbackText = `📦 ${raw} — deployed to ${d.customer || 'customer'} (not missing)`;
      feedbackColor = '#6040a0';
    } else if (_state.inTransit[key]) {
      category     = 'in-transit';
      feedbackText = `✈ ${raw} — in transit (not missing)`;
      feedbackColor = '#1a5080';
    } else {
      category     = 'unexpected';
      feedbackText = `❓ ${raw} — not found in system`;
      feedbackColor = '#9c2a00';
    }

    _state.scanned[key] = { serial: raw, category };
    feedback.style.color  = feedbackColor;
    feedback.textContent   = feedbackText;

    _updateCounts();
    _renderResults();
    input?.focus();
  }

  // ── update progress bar + counts ────────────────────────────────────
  function _updateCounts() {
    if (!_state) return;
    const scanned    = Object.values(_state.scanned);
    const matched    = scanned.filter(s => s.category === 'matched').length;
    const deployed   = scanned.filter(s => s.category === 'deployed').length;
    const inTransit  = scanned.filter(s => s.category === 'in-transit').length;
    const unexpected = scanned.filter(s => s.category === 'unexpected').length;
    const total      = Object.keys(_state.expected).length;
    const missing    = total - matched;
    const pct        = total > 0 ? Math.round(matched / total * 100) : 0;

    document.getElementById('audit-count-matched').textContent  = matched;
    document.getElementById('audit-count-missing').textContent  = missing;
    document.getElementById('audit-count-unexpected').textContent = unexpected;
    document.getElementById('audit-progress-fill').style.width  = pct + '%';

    // Show deployed/in-transit count in scope label
    const extras = [];
    if (deployed  > 0) extras.push(`${deployed} deployed`);
    if (inTransit > 0) extras.push(`${inTransit} in transit`);
    if (unexpected > 0) extras.push(`${unexpected} unexpected`);
    document.getElementById('audit-scope-label').textContent =
      _state.scopeLabel + (extras.length ? ` · ${extras.join(' · ')}` : '');
  }

  // ── render live results table ────────────────────────────────────────
  function _renderActive() {
    document.getElementById('audit-results-body').innerHTML =
      '<div class="empty" style="padding:1rem">No serials scanned yet — start scanning above</div>';
  }

  function _renderResults() {
    if (!_state) return;
    const container = document.getElementById('audit-results-body');

    const scannedRows = Object.values(_state.scanned).reverse(); // most recent first

    if (!scannedRows.length) {
      container.innerHTML = '<div class="empty" style="padding:1rem">No serials scanned yet</div>';
      return;
    }

    const rows = scannedRows.map(s => {
      const info    = _state.expected[s.serial.toUpperCase()]
                   || _state.deployed[s.serial.toUpperCase()]
                   || _state.inTransit[s.serial.toUpperCase()]
                   || {};
      const rowCls  = s.category === 'matched'   ? 'audit-row-match'
                    : s.category === 'deployed'   ? ''
                    : s.category === 'in-transit' ? ''
                    : 'audit-row-unexpected';
      const badge   = s.category === 'matched'    ? '<span class="audit-badge audit-badge-match">✅ In stock</span>'
                    : s.category === 'deployed'    ? '<span class="audit-badge" style="background:#ede8ff;color:#6040a0;">📦 Deployed</span>'
                    : s.category === 'in-transit'  ? '<span class="audit-badge" style="background:#e0f0ff;color:#1a5080;">✈ In transit</span>'
                    : '<span class="audit-badge audit-badge-unexpected">❓ Unknown</span>';
      return `<tr class="${rowCls}">
        <td style="font-family:var(--mono);font-size:11px">${_esc(s.serial)}</td>
        <td style="font-weight:500">${_esc(info.product || '—')}</td>
        <td>${info.category ? `<span class="cat-badge">${_esc(info.category)}</span>` : '—'}</td>
        <td>${info.location ? `<span class="loc-badge">${_esc(info.location)}</span>` : (info.customer ? _esc(info.customer) : '—')}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th style="width:22%">Serial</th>
        <th style="width:28%">Product</th>
        <th style="width:16%">Category</th>
        <th style="width:20%">Location / Customer</th>
        <th style="width:14%">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  // ── finish: generate full variance report ────────────────────────────
  function finish() {
    if (!_state) return;
    _state.finished = true;

    const scanned    = _state.scanned;
    const scannedSet = new Set(Object.keys(scanned));

    // Missing = in expected scope but never scanned
    const missingRows = Object.entries(_state.expected)
      .filter(([key]) => !scannedSet.has(key))
      .map(([, row]) => ({ serial: row.serial, category: 'missing', info: row }));

    // Matched
    const matchedRows = Object.values(scanned)
      .filter(s => s.category === 'matched')
      .map(s => ({ serial: s.serial, category: 'matched', info: _state.expected[s.serial.toUpperCase()] || {} }));

    // Deployed (scanned)
    const deployedRows = Object.values(scanned)
      .filter(s => s.category === 'deployed')
      .map(s => ({ serial: s.serial, category: 'deployed', info: _state.deployed[s.serial.toUpperCase()] || {} }));

    // In-transit (scanned)
    const inTransitRows = Object.values(scanned)
      .filter(s => s.category === 'in-transit')
      .map(s => ({ serial: s.serial, category: 'in-transit', info: _state.inTransit[s.serial.toUpperCase()] || {} }));

    // Unexpected
    const unexpectedRows = Object.values(scanned)
      .filter(s => s.category === 'unexpected')
      .map(s => ({ serial: s.serial, category: 'unexpected', info: {} }));

    // Also: in-stock but NOT in scope that we didn't scan (full DB list)
    // These are already in missingRows if scope = all

    document.getElementById('btn-finish-audit').textContent   = '✓ Report generated';
    document.getElementById('btn-finish-audit').disabled       = true;
    document.getElementById('audit-serial-input').disabled     = true;
    document.getElementById('btn-audit-submit').disabled       = true;
    document.getElementById('audit-progress-title').textContent = 'Variance Report';
    document.getElementById('btn-audit-export').style.display  = '';

    // Summary cards
    const totalExpected = Object.keys(_state.expected).length;
    const matchPct      = totalExpected > 0 ? Math.round(matchedRows.length / totalExpected * 100) : 100;
    const missingValue  = missingRows.reduce((a, r) => a + (r.info.cost || 0), 0);
    const fmt$          = n => n > 0 ? '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) : '—';

    const summaryHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="svc-stat-card" style="background:#eaf7ee;border-color:#b8e0c4;color:#1a6b38;flex:1;min-width:120px;">
          <div class="svc-stat-count">${matchedRows.length}</div>
          <div class="svc-stat-label">✅ Matched</div>
          <div class="svc-stat-value">${matchPct}% found</div>
        </div>
        <div class="svc-stat-card" style="background:#fffbf0;border-color:#f0d860;color:#9c6000;flex:1;min-width:120px;">
          <div class="svc-stat-count">${missingRows.length}</div>
          <div class="svc-stat-label">⚠ Missing</div>
          <div class="svc-stat-value">${fmt$(missingValue)}</div>
        </div>
        <div class="svc-stat-card" style="background:#ede8ff;border-color:#c8b8f8;color:#6040a0;flex:1;min-width:120px;">
          <div class="svc-stat-count">${deployedRows.length + inTransitRows.length}</div>
          <div class="svc-stat-label">📦 Accounted for</div>
          <div class="svc-stat-value">Deployed / in transit</div>
        </div>
        <div class="svc-stat-card" style="background:#fef0ea;border-color:#f5c6b0;color:#9c2a00;flex:1;min-width:120px;">
          <div class="svc-stat-count">${unexpectedRows.length}</div>
          <div class="svc-stat-label">❓ Unexpected</div>
          <div class="svc-stat-value">Not in system</div>
        </div>
      </div>`;

    // Build sectioned report table
    const allReportRows = [
      ...missingRows,
      ...unexpectedRows,
      ...matchedRows,
      ...deployedRows,
      ...inTransitRows,
    ];

    const tableRows = allReportRows.map(r => {
      const rowCls = r.category === 'matched'    ? 'audit-row-match'
                   : r.category === 'missing'    ? 'audit-row-missing'
                   : r.category === 'unexpected' ? 'audit-row-unexpected'
                   : '';
      const badge  = r.category === 'matched'    ? '<span class="audit-badge audit-badge-match">✅ Matched</span>'
                   : r.category === 'missing'    ? '<span class="audit-badge audit-badge-missing">⚠ Missing</span>'
                   : r.category === 'deployed'   ? '<span class="audit-badge" style="background:#ede8ff;color:#6040a0;">📦 Deployed</span>'
                   : r.category === 'in-transit' ? '<span class="audit-badge" style="background:#e0f0ff;color:#1a5080;">✈ In transit</span>'
                   : '<span class="audit-badge audit-badge-unexpected">❓ Unexpected</span>';
      const cost   = r.info.cost != null ? '$' + r.info.cost.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) : '—';
      const loc    = r.category === 'deployed'
                   ? `<span style="color:#6040a0">${_esc(r.info.customer || '—')}</span>`
                   : r.info.location ? `<span class="loc-badge">${_esc(r.info.location)}</span>` : '—';
      return `<tr class="${rowCls}">
        <td>${badge}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${_esc(r.serial)}</td>
        <td style="font-weight:500">${_esc(r.info.product || '—')}</td>
        <td>${r.info.category ? `<span class="cat-badge">${_esc(r.info.category)}</span>` : '—'}</td>
        <td>${loc}</td>
        <td style="font-size:12px">${cost}</td>
      </tr>`;
    }).join('');

    document.getElementById('audit-results-body').innerHTML = summaryHtml + `
      <div class="table-wrap"><table>
        <thead><tr>
          <th style="width:14%">Result</th>
          <th style="width:20%">Serial</th>
          <th style="width:24%">Product</th>
          <th style="width:14%">Category</th>
          <th style="width:16%">Location / Customer</th>
          <th style="width:12%">Cost</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
      <div style="margin-top:8px;">
        <button class="btn btn-ghost btn-sm" id="btn-new-audit">↩ New audit</button>
      </div>`;

    document.getElementById('btn-new-audit')?.addEventListener('click', cancel);

    // Store report rows for CSV export
    _state._reportRows = allReportRows;
  }

  // ── cancel / reset ───────────────────────────────────────────────────
  function cancel() {
    _state = null;
    document.getElementById('audit-setup-panel').style.display = '';
    document.getElementById('audit-active-panel').style.display = 'none';
    document.getElementById('audit-results-body').innerHTML = '';
    document.getElementById('audit-scan-feedback').textContent = '';
    document.getElementById('btn-finish-audit').textContent = 'Finish Audit';
    document.getElementById('btn-finish-audit').disabled = false;
    document.getElementById('audit-serial-input').disabled = false;
    document.getElementById('btn-audit-submit').disabled = false;
    document.getElementById('audit-progress-fill').style.width = '0%';
    document.getElementById('audit-count-matched').textContent  = '0';
    document.getElementById('audit-count-missing').textContent  = '0';
    document.getElementById('audit-count-unexpected').textContent = '0';
    document.getElementById('btn-audit-export').style.display = 'none';
    _populateFilters();
  }

  // ── export CSV ───────────────────────────────────────────────────────
  function exportCSV() {
    if (!_state || !_state._reportRows) return;
    const rows = [['Result','Serial','Product','Category','Location/Customer','Cost']];
    _state._reportRows.forEach(r => {
      const label = r.category === 'matched'    ? 'Matched'
                  : r.category === 'missing'    ? 'Missing'
                  : r.category === 'deployed'   ? 'Deployed'
                  : r.category === 'in-transit' ? 'In Transit'
                  : 'Unexpected';
      const loc   = r.category === 'deployed' ? (r.info.customer || '') : (r.info.location || '');
      rows.push([label, r.serial, r.info.product||'', r.info.category||'', loc, r.info.cost != null ? r.info.cost : '']);
    });
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `stock-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init };

})();
