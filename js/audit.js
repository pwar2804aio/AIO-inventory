// audit.js — Stock Audit / Variance Report
// Only cares about in-stock serials at physical locations.
// Deployed and in-transit items are completely out of scope — they are not on site.

const Audit = (() => {

  let _state = null;

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const fmt$ = n => n > 0 ? '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';

  // ── init ─────────────────────────────────────────────────────────────
  function init() {
    _populateFilters();
    const startBtn = document.getElementById('btn-start-audit');
    if (startBtn && !startBtn._auditWired) {
      startBtn._auditWired = true;
      startBtn.addEventListener('click', start);
    }
  }

  function _populateFilters() {
    const locSel = document.getElementById('audit-loc-filter');
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
      const products = [...new Set(
        Inventory.getAllSerialRows().filter(r => r.status === 'in-stock').map(r => r.product)
      )].sort();
      const cur = prodSel.value;
      prodSel.innerHTML = '<option value="">All products</option>' +
        products.map(p => `<option value="${_esc(p)}"${p===cur?' selected':''}>${_esc(p)}</option>`).join('');
    }
  }

  // ── start ─────────────────────────────────────────────────────────────
  function start() {
    const locF  = document.getElementById('audit-loc-filter')?.value  || '';
    const catF  = document.getElementById('audit-cat-filter')?.value  || '';
    const prodF = document.getElementById('audit-product-filter')?.value || '';

    // Expected = in-stock serials only, filtered to scope
    const scoped = Inventory.getAllSerialRows().filter(r => {
      if (r.status !== 'in-stock') return false;
      if (locF  && r.location !== locF)  return false;
      if (catF  && r.category !== catF)  return false;
      if (prodF && r.product  !== prodF) return false;
      return true;
    });

    const expectedMap = {};
    scoped.forEach(r => { expectedMap[r.serial.toUpperCase()] = r; });

    const parts = [];
    if (prodF) parts.push(prodF);
    else if (catF) parts.push(catF);
    else parts.push('All products');
    if (locF) parts.push(`@ ${locF}`);
    const scopeLabel = parts.join(' ');

    _state = { expectedMap, scanned: {}, scopeLabel, locF, catF, prodF, finished: false };

    // Show active panel
    document.getElementById('audit-setup-panel').style.display = 'none';
    document.getElementById('audit-active-panel').style.display = '';
    document.getElementById('audit-scope-label').textContent = scopeLabel;
    document.getElementById('audit-progress-title').textContent = `Auditing: ${scopeLabel}`;
    document.getElementById('audit-results-body').innerHTML =
      '<div class="empty" style="padding:1rem">No serials scanned yet — start scanning above</div>';
    _updateCounts();

    // Wire input (once)
    const input  = document.getElementById('audit-serial-input');
    const submit = document.getElementById('btn-audit-submit');
    input.disabled  = false;
    submit.disabled = false;
    input.value     = '';
    if (!input._auditWired) {
      input._auditWired = true;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _submit(); } });
      submit.addEventListener('click', _submit);
    }

    // Finish / cancel / export (once)
    const finBtn = document.getElementById('btn-finish-audit');
    finBtn.textContent = 'Finish Audit';
    finBtn.disabled = false;
    if (!finBtn._auditWired) {
      finBtn._auditWired = true;
      finBtn.addEventListener('click', finish);
    }
    const cancelBtn = document.getElementById('btn-cancel-audit');
    if (!cancelBtn._auditWired) {
      cancelBtn._auditWired = true;
      cancelBtn.addEventListener('click', cancel);
    }
    const exportBtn = document.getElementById('btn-audit-export');
    exportBtn.style.display = 'none';
    if (!exportBtn._auditWired) {
      exportBtn._auditWired = true;
      exportBtn.addEventListener('click', _exportCSV);
    }

    // Camera
    const camBtn = document.getElementById('btn-audit-camera');
    if (camBtn && !camBtn._auditWired) {
      camBtn._auditWired = true;
      camBtn.addEventListener('click', () => {
        if (typeof Scanner !== 'undefined') {
          Scanner.start(serial => {
            document.getElementById('audit-serial-input').value = serial;
            _submit();
          });
        }
      });
    }

    input.focus();
  }

  // ── submit a serial ──────────────────────────────────────────────────
  function _submit() {
    if (!_state || _state.finished) return;
    const input    = document.getElementById('audit-serial-input');
    const raw      = (input?.value || '').trim();
    if (!raw) return;
    input.value = '';

    const key      = raw.toUpperCase();
    const feedback = document.getElementById('audit-scan-feedback');

    if (_state.scanned[key]) {
      feedback.style.color = 'var(--text-muted)';
      feedback.textContent = `⚠ ${raw} already scanned`;
      setTimeout(() => { if (feedback.textContent.includes(raw)) feedback.textContent = ''; }, 2000);
      return;
    }

    let category, color;
    if (_state.expectedMap[key]) {
      category = 'matched';
      color    = '#1a7a3c';
      feedback.textContent = `✅ ${raw} — ${_state.expectedMap[key].product}`;
    } else {
      category = 'unexpected';
      color    = '#9c2a00';
      feedback.textContent = `❓ ${raw} — not found in stock`;
    }

    feedback.style.color = color;
    _state.scanned[key]  = { serial: raw, category };
    _updateCounts();
    _renderLiveTable();
    input.focus();
  }

  // ── counts & progress bar ────────────────────────────────────────────
  function _updateCounts() {
    if (!_state) return;
    const scanned    = Object.values(_state.scanned);
    const matched    = scanned.filter(s => s.category === 'matched').length;
    const unexpected = scanned.filter(s => s.category === 'unexpected').length;
    const total      = Object.keys(_state.expectedMap).length;
    const missing    = total - matched;
    const pct        = total > 0 ? Math.round(matched / total * 100) : 0;

    document.getElementById('audit-count-matched').textContent   = matched;
    document.getElementById('audit-count-missing').textContent   = missing;
    document.getElementById('audit-count-unexpected').textContent = unexpected;
    document.getElementById('audit-progress-fill').style.width   = pct + '%';
  }

  // ── live scan table (most recent first) ──────────────────────────────
  function _renderLiveTable() {
    const rows = Object.values(_state.scanned).reverse();
    if (!rows.length) return;
    document.getElementById('audit-results-body').innerHTML =
      `<div class="table-wrap"><table>
        <thead><tr>
          <th style="width:20%">Serial</th>
          <th style="width:32%">Product</th>
          <th style="width:16%">Category</th>
          <th style="width:16%">Location</th>
          <th style="width:16%">Result</th>
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
  }

  // ── finish: full variance report ─────────────────────────────────────
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

    const scannedKeys = new Set(Object.keys(_state.scanned));

    // Missing = expected but not scanned
    const missingRows = Object.entries(_state.expectedMap)
      .filter(([k]) => !scannedKeys.has(k))
      .map(([, r]) => ({ serial: r.serial, category: 'missing', info: r }));

    // Matched = scanned & expected
    const matchedRows = Object.values(_state.scanned)
      .filter(s => s.category === 'matched')
      .map(s => ({ serial: s.serial, category: 'matched', info: _state.expectedMap[s.serial.toUpperCase()] || {} }));

    // Unexpected = scanned but not in expected
    const unexpectedRows = Object.values(_state.scanned)
      .filter(s => s.category === 'unexpected')
      .map(s => ({ serial: s.serial, category: 'unexpected', info: {} }));

    _state._report = [...missingRows, ...unexpectedRows, ...matchedRows];

    const total        = Object.keys(_state.expectedMap).length;
    const matchPct     = total > 0 ? Math.round(matchedRows.length / total * 100) : 100;
    const missingValue = missingRows.reduce((a, r) => a + (r.info.cost || 0), 0);

    // Summary cards
    const summaryHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="svc-stat-card" style="background:#eaf7ee;border-color:#b8e0c4;color:#1a6b38;flex:1;min-width:120px;">
          <div class="svc-stat-count">${matchedRows.length}<span style="font-size:16px;font-weight:500;margin-left:6px;">/ ${total}</span></div>
          <div class="svc-stat-label">✅ Matched</div>
          <div class="svc-stat-value">${matchPct}% of stock found</div>
        </div>
        <div class="svc-stat-card" style="background:#fffbf0;border-color:#f0d860;color:#9c6000;flex:1;min-width:120px;">
          <div class="svc-stat-count">${missingRows.length}</div>
          <div class="svc-stat-label">⚠ Missing</div>
          <div class="svc-stat-value">${fmt$(missingValue)}</div>
        </div>
        <div class="svc-stat-card" style="background:#fef0ea;border-color:#f5c6b0;color:#9c2a00;flex:1;min-width:120px;">
          <div class="svc-stat-count">${unexpectedRows.length}</div>
          <div class="svc-stat-label">❓ Unexpected</div>
          <div class="svc-stat-value">Not in system</div>
        </div>
      </div>`;

    // Report table — missing & unexpected first, then matched
    const tableRows = _state._report.map(r => {
      const rc    = r.category === 'matched'    ? 'audit-row-match'
                  : r.category === 'missing'    ? 'audit-row-missing'
                  : 'audit-row-unexpected';
      const badge = r.category === 'matched'    ? '<span class="audit-badge audit-badge-match">✅ Matched</span>'
                  : r.category === 'missing'    ? '<span class="audit-badge audit-badge-missing">⚠ Missing</span>'
                  : '<span class="audit-badge audit-badge-unexpected">❓ Unexpected</span>';
      const cost  = r.info.cost != null
        ? '$' + r.info.cost.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
      return `<tr class="${rc}">
        <td>${badge}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:500">${_esc(r.serial)}</td>
        <td style="font-weight:500">${_esc(r.info.product||'—')}</td>
        <td>${r.info.category?`<span class="cat-badge">${_esc(r.info.category)}</span>`:'—'}</td>
        <td>${r.info.location?`<span class="loc-badge">${_esc(r.info.location)}</span>`:'—'}</td>
        <td style="font-size:12px;">${cost}</td>
      </tr>`;
    }).join('');

    document.getElementById('audit-results-body').innerHTML = summaryHtml +
      `<div class="table-wrap"><table>
        <thead><tr>
          <th style="width:12%">Result</th>
          <th style="width:20%">Serial</th>
          <th style="width:26%">Product</th>
          <th style="width:14%">Category</th>
          <th style="width:16%">Location</th>
          <th style="width:12%">Cost</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
      <div style="margin-top:8px;">
        <button class="btn btn-ghost btn-sm" id="btn-new-audit">↩ New audit</button>
      </div>`;

    document.getElementById('btn-new-audit')?.addEventListener('click', cancel);
  }

  // ── cancel / reset ───────────────────────────────────────────────────
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
  }

  // ── export CSV ───────────────────────────────────────────────────────
  function _exportCSV() {
    if (!_state?._report) return;
    const rows = [['Result','Serial','Product','Category','Location','Cost']];
    _state._report.forEach(r => {
      const label = r.category === 'matched' ? 'Matched' : r.category === 'missing' ? 'Missing' : 'Unexpected';
      rows.push([label, r.serial, r.info.product||'', r.info.category||'', r.info.location||'', r.info.cost != null ? r.info.cost : '']);
    });
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `stock-audit-${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { init };

})();
