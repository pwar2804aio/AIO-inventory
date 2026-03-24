/**
 * reports.js — AIO Inventory Reporting Suite
 * All reports computed from DB + Inventory module.
 */
const Reports = (() => {

  // ── Date helpers ──────────────────────────────────────────────────────
  function inRange(isoDate, from, to) {
    if (!from && !to) return true;
    const d = isoDate ? isoDate.slice(0, 10) : '';
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }

  function fmt$(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  }

  // ── Data builders ─────────────────────────────────────────────────────

  /** Summary KPIs */
  function buildSummary(from, to) {
    const holdingRows = Inventory.getAllSerialRows().filter(r => r.status === 'in-stock');
    const deployedRows = Inventory.getDeployedSerialRows().filter(r => inRange(r.date, from, to));
    const transitRows = Inventory.getAllSerialRows().filter(r => r.status === 'in-transit');

    const holdingValue  = holdingRows.reduce((a, r) => a + (r.cost ?? 0), 0);
    const deployedValue = deployedRows.reduce((a, r) => a + (r.cost ?? 0), 0);
    const transitValue  = transitRows.reduce((a, r) => a + (r.cost ?? 0), 0);
    const holdingCosted = holdingRows.filter(r => r.cost != null).length;
    const deployedCosted= deployedRows.filter(r => r.cost != null).length;

    return {
      holdingUnits: holdingRows.length,
      holdingValue,
      holdingCosted,
      deployedUnits: deployedRows.length,
      deployedValue,
      deployedCosted,
      transitUnits: transitRows.length,
      transitValue,
    };
  }

  /** Stock value grouped by category */
  function buildByCategory(from, to) {
    const map = {};
    Inventory.getAllSerialRows().filter(r => r.status === 'in-stock').forEach(r => {
      const cat = r.category || 'Uncategorised';
      if (!map[cat]) map[cat] = { category: cat, units: 0, value: 0, costed: 0 };
      map[cat].units++;
      if (r.cost != null) { map[cat].value += r.cost; map[cat].costed++; }
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }

  /** Stock value grouped by product */
  function buildByProduct(from, to) {
    const map = {};
    Inventory.getAllSerialRows().filter(r => r.status === 'in-stock').forEach(r => {
      const k = r.product;
      if (!map[k]) map[k] = { product: k, category: r.category, units: 0, value: 0, costed: 0 };
      map[k].units++;
      if (r.cost != null) { map[k].value += r.cost; map[k].costed++; map[k].avgCost = map[k].value / map[k].costed; }
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }

  /** Low stock items */
  function buildLowStock() {
    return Inventory.getLowStockItems().map(v => {
      const key = v.product + '||' + v.location;
      const threshold = DB.getThreshold(key);
      const gap = threshold - v.inStock.size;
      return { ...v, threshold, gap, inStockCount: v.inStock.size };
    }).sort((a, b) => a.inStockCount - b.inStockCount);
  }

  /** Deployed cost grouped by customer */
  function buildDeployedByCustomer(from, to) {
    const map = {};
    Inventory.getDeployedSerialRows().filter(r => inRange(r.date, from, to)).forEach(r => {
      const k = r.customer || 'Unknown';
      if (!map[k]) map[k] = { customer: k, units: 0, value: 0, costed: 0, firstDate: r.date, lastDate: r.date, products: new Set() };
      map[k].units++;
      map[k].products.add(r.product);
      if (r.cost != null) { map[k].value += r.cost; map[k].costed++; }
      if (r.date < map[k].firstDate) map[k].firstDate = r.date;
      if (r.date > map[k].lastDate)  map[k].lastDate  = r.date;
    });
    return Object.values(map).map(v => ({ ...v, products: v.products.size })).sort((a, b) => b.value - a.value);
  }

  /** Stock holding cost by location */
  function buildHoldingByLocation(from, to) {
    const map = {};
    Inventory.getAllSerialRows().filter(r => r.status === 'in-stock').forEach(r => {
      const k = r.location || 'Unassigned';
      if (!map[k]) map[k] = { location: k, units: 0, value: 0, costed: 0 };
      map[k].units++;
      if (r.cost != null) { map[k].value += r.cost; map[k].costed++; }
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }

  // ── Chart renderer (pure canvas — no deps) ────────────────────────────
  function drawBarChart(canvasId, labels, values, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 60, left: 72 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    // Detect dark mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textCol  = isDark ? '#9b9b97' : '#6b6b68';
    const gridCol  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    const bgCol    = isDark ? '#1c1c1a' : '#ffffff';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, W, H);

    const max = Math.max(...values, 1);
    const barW = Math.floor(chartW / labels.length * 0.6);
    const gap  = Math.floor(chartW / labels.length);

    // Grid lines
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = PAD.top + chartH - (i / steps) * chartH;
      ctx.strokeStyle = gridCol;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
      ctx.fillStyle = textCol;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      const val = (max * i / steps);
      ctx.fillText(val >= 1000 ? '$' + (val/1000).toFixed(1) + 'k' : '$' + val.toFixed(0), PAD.left - 6, y + 3);
    }

    // Bars
    labels.forEach((label, i) => {
      const barH = values[i] > 0 ? Math.max(2, (values[i] / max) * chartH) : 0;
      const x = PAD.left + i * gap + (gap - barW) / 2;
      const y = PAD.top + chartH - barH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]) : ctx.rect(x, y, barW, barH);
      ctx.fill();

      // Value label on bar
      if (values[i] > 0) {
        ctx.fillStyle = isDark ? '#e8e8e4' : '#1a1a18';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        const lbl = values[i] >= 1000 ? '$' + (values[i]/1000).toFixed(1)+'k' : '$'+values[i].toFixed(0);
        ctx.fillText(lbl, x + barW / 2, y - 4);
      }

      // X axis label (truncate)
      ctx.fillStyle = textCol;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const short = label.length > 12 ? label.slice(0, 11) + '…' : label;
      ctx.fillText(short, x + barW / 2, PAD.top + chartH + 16);
    });
  }

  function drawDonutChart(canvasId, labels, values, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.38, cy = H / 2;
    const R = Math.min(cx, cy) - 16;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bgCol  = isDark ? '#1c1c1a' : '#ffffff';
    const textCol= isDark ? '#e8e8e4' : '#1a1a18';
    const mutCol = isDark ? '#9b9b97' : '#6b6b68';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, W, H);

    const total = values.reduce((a, v) => a + v, 0);
    if (total === 0) { ctx.fillStyle = mutCol; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('No data', cx, cy); return; }

    let startAngle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.58, 0, Math.PI * 2); ctx.fillStyle = bgCol; ctx.fill();

    // Centre total
    ctx.fillStyle = textCol; ctx.font = 'bold 13px -apple-system,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmt$(total), cx, cy + 5);

    // Legend
    const legX = W * 0.72, legStartY = cy - (labels.length * 18) / 2;
    labels.forEach((lbl, i) => {
      const y = legStartY + i * 20;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(legX - 24, y - 6, 12, 12);
      ctx.fillStyle = mutCol; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'left';
      const pct = total > 0 ? ((values[i]/total)*100).toFixed(0)+'%' : '0%';
      const short = lbl.length > 16 ? lbl.slice(0,15)+'…' : lbl;
      ctx.fillText(`${short} (${pct})`, legX - 8, y + 4);
    });
  }

  // ── Main render ───────────────────────────────────────────────────────
  function render() {
    const from = document.getElementById('rpt-date-from').value;
    const to   = document.getElementById('rpt-date-to').value;

    const summary    = buildSummary(from, to);
    const byCategory = buildByCategory(from, to);
    const byProduct  = buildByProduct(from, to);
    const lowStock   = buildLowStock();
    const byCustomer = buildDeployedByCustomer(from, to);
    const byLocation = buildHoldingByLocation(from, to);

    const AIO_PURPLE  = '#5F68BC';
    const AIO_ORANGE  = '#F4733B';
    const AIO_GREEN   = '#3b6d11';
    const AIO_AMBER   = '#854f0b';
    const DONUT_COLORS = [AIO_PURPLE, AIO_ORANGE, '#378add', AIO_GREEN, AIO_AMBER, '#a32d2d'];

    // ── Summary KPI cards ──────────────────────────────────────────────
    document.getElementById('rpt-summary').innerHTML = `
      <div class="rpt-card purple">
        <div class="rpt-card-label">Stock Holding Value</div>
        <div class="rpt-card-val">${fmt$(summary.holdingValue)}</div>
        <div class="rpt-card-sub">${summary.holdingUnits} units · ${summary.holdingCosted} priced</div>
      </div>
      <div class="rpt-card orange">
        <div class="rpt-card-label">Deployed Stock Value</div>
        <div class="rpt-card-val">${fmt$(summary.deployedValue)}</div>
        <div class="rpt-card-sub">${summary.deployedUnits} units · ${summary.deployedCosted} priced</div>
      </div>
      <div class="rpt-card green">
        <div class="rpt-card-label">In Transit Value</div>
        <div class="rpt-card-val">${fmt$(summary.transitValue)}</div>
        <div class="rpt-card-sub">${summary.transitUnits} units</div>
      </div>
      <div class="rpt-card amber">
        <div class="rpt-card-label">Total Portfolio</div>
        <div class="rpt-card-val">${fmt$(summary.holdingValue + summary.deployedValue + summary.transitValue)}</div>
        <div class="rpt-card-sub">Holding + Deployed + Transit</div>
      </div>`;

    // ── Helper: inline bar rows ────────────────────────────────────────
    function barRows(items, labelKey, valueKey, color) {
      if (!items.length) return '<div class="empty">No data</div>';
      const max = Math.max(...items.map(i => i[valueKey]), 1);
      return `<div class="rpt-bars-wrap">${items.map(item => `
        <div class="rpt-bar-row">
          <div class="rpt-bar-label" title="${esc(item[labelKey])}">${esc(item[labelKey])}</div>
          <div class="rpt-bar-track"><div class="rpt-bar-fill ${color==='orange'?'orange':''}" style="width:${Math.max(2, Math.round(item[valueKey]/max*100))}%"></div></div>
          <div class="rpt-bar-val">${fmt$(item[valueKey])}</div>
        </div>`).join('')}</div>`;
    }

    // ── Stock value by category ────────────────────────────────────────
    document.getElementById('rpt-by-category').innerHTML = `
      <div class="rpt-grid">
        ${barRows(byCategory, 'category', 'value', 'purple')}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Units</th><th>Priced</th><th>Total value</th><th>Avg / unit</th></tr></thead>
            <tbody>${byCategory.length
              ? byCategory.map(c => `<tr>
                  <td><span class="cat-badge">${esc(c.category)}</span></td>
                  <td>${c.units}</td>
                  <td style="color:var(--text-hint)">${c.costed}</td>
                  <td style="font-weight:600">${fmt$(c.value)}</td>
                  <td style="color:var(--text-muted)">${c.costed > 0 ? fmt$(c.value/c.costed) : '—'}</td>
                </tr>`).join('')
              : '<tr><td colspan="5"><div class="empty">No data</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    // ── Stock value by product ─────────────────────────────────────────
    document.getElementById('rpt-by-product').innerHTML = `
      <div class="rpt-grid">
        ${barRows(byProduct, 'product', 'value', 'purple')}
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width:32%">Product</th><th>Category</th><th>Units</th><th>Total value</th><th>Avg / unit</th></tr></thead>
            <tbody>${byProduct.length
              ? byProduct.map(p => `<tr>
                  <td style="font-weight:500">${esc(p.product)}</td>
                  <td><span class="cat-badge">${esc(p.category)}</span></td>
                  <td>${p.units}</td>
                  <td style="font-weight:600">${fmt$(p.value)}</td>
                  <td style="color:var(--text-muted)">${p.costed > 0 ? fmt$(p.value/p.costed) : '—'}</td>
                </tr>`).join('')
              : '<tr><td colspan="5"><div class="empty">No data</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    // ── Holding cost by location ───────────────────────────────────────
    document.getElementById('rpt-by-location').innerHTML = `
      <div class="rpt-grid">
        ${barRows(byLocation, 'location', 'value', 'purple')}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Location</th><th>Units</th><th>Priced</th><th>Total value</th></tr></thead>
            <tbody>${byLocation.length
              ? byLocation.map(l => `<tr>
                  <td><span class="loc-badge">${esc(l.location)}</span></td>
                  <td>${l.units}</td>
                  <td style="color:var(--text-hint)">${l.costed}</td>
                  <td style="font-weight:600">${fmt$(l.value)}</td>
                </tr>`).join('')
              : '<tr><td colspan="4"><div class="empty">No data</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    // ── Low stock items ────────────────────────────────────────────────
    document.getElementById('rpt-low-stock').innerHTML = lowStock.length
      ? `<table>
          <thead><tr>
            <th style="width:25%">Product</th><th style="width:13%">Category</th>
            <th style="width:15%">Location</th><th>In stock</th>
            <th>Threshold</th><th>Shortfall</th><th>Status</th>
          </tr></thead>
          <tbody>${lowStock.map(item => `<tr>
            <td style="font-weight:500">${esc(item.product)}</td>
            <td><span class="cat-badge">${esc(item.category||'—')}</span></td>
            <td><span class="loc-badge">${esc(item.location||'—')}</span></td>
            <td style="font-weight:600;color:var(--${item.inStockCount===0?'danger':'warning'}-text)">${item.inStockCount}</td>
            <td style="color:var(--text-muted)">${item.threshold}</td>
            <td style="color:var(--danger-text)">${item.gap > 0 ? '+'+item.gap+' needed' : 'At threshold'}</td>
            <td><span class="badge ${item.inStockCount===0?'b-zero':'b-low'}">${item.inStockCount===0?'Out of stock':'Low stock'}</span></td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<div class="empty">All products above threshold</div>';

    // ── Deployed cost by customer ──────────────────────────────────────
    document.getElementById('rpt-by-customer').innerHTML = `
      <div class="rpt-grid">
        ${barRows(byCustomer, 'customer', 'value', 'orange')}
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:28%">Customer / Account</th><th>Units</th>
              <th>Products</th><th>Total value</th><th>First deploy</th><th>Last deploy</th>
            </tr></thead>
            <tbody>${byCustomer.length
              ? byCustomer.map(c => `<tr>
                  <td style="font-weight:500">${esc(c.customer)}</td>
                  <td>${c.units}</td>
                  <td style="color:var(--text-muted)">${c.products}</td>
                  <td style="font-weight:600">${fmt$(c.value)}</td>
                  <td style="color:var(--text-hint);font-size:11px">${fmtDate(c.firstDate)}</td>
                  <td style="color:var(--text-hint);font-size:11px">${fmtDate(c.lastDate)}</td>
                </tr>`).join('')
              : '<tr><td colspan="6"><div class="empty">No deployed stock in range</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

  }

  // ── CSV exports ───────────────────────────────────────────────────────
  function exportAll() {
    const from = document.getElementById('rpt-date-from').value;
    const to   = document.getElementById('rpt-date-to').value;

    const rows = [
      ['AIO Inventory — Report Export'],
      ['Generated', new Date().toLocaleString()],
      ['Date range', from || 'All time', to || ''],
      [],
      ['=== SUMMARY ==='],
    ];
    const s = buildSummary(from, to);
    rows.push(['Metric','Value','Units']);
    rows.push(['Stock Holding Value', s.holdingValue.toFixed(2), s.holdingUnits]);
    rows.push(['Deployed Stock Value', s.deployedValue.toFixed(2), s.deployedUnits]);
    rows.push(['In Transit Value', s.transitValue.toFixed(2), s.transitUnits]);
    rows.push([]);
    rows.push(['=== STOCK VALUE BY CATEGORY ===']);
    rows.push(['Category','Units','Priced Units','Total Value','Avg per Unit']);
    buildByCategory(from, to).forEach(c => rows.push([c.category, c.units, c.costed, c.value.toFixed(2), c.costed > 0 ? (c.value/c.costed).toFixed(2) : '']));
    rows.push([]);
    rows.push(['=== STOCK VALUE BY PRODUCT ===']);
    rows.push(['Product','Category','Units','Total Value','Avg per Unit']);
    buildByProduct(from, to).forEach(p => rows.push([p.product, p.category, p.units, p.value.toFixed(2), p.costed > 0 ? (p.value/p.costed).toFixed(2) : '']));
    rows.push([]);
    rows.push(['=== HOLDING COST BY LOCATION ===']);
    rows.push(['Location','Units','Priced Units','Total Value']);
    buildHoldingByLocation(from, to).forEach(l => rows.push([l.location, l.units, l.costed, l.value.toFixed(2)]));
    rows.push([]);
    rows.push(['=== LOW STOCK ITEMS ===']);
    rows.push(['Product','Category','Location','In Stock','Threshold','Shortfall','Status']);
    buildLowStock().forEach(i => rows.push([i.product, i.category, i.location, i.inStockCount, i.threshold, i.gap > 0 ? i.gap : 0, i.inStockCount === 0 ? 'Out of stock' : 'Low stock']));
    rows.push([]);
    rows.push(['=== DEPLOYED VALUE BY CUSTOMER ===']);
    rows.push(['Customer','Units Deployed','Product Lines','Total Value','First Deploy','Last Deploy']);
    buildDeployedByCustomer(from, to).forEach(c => rows.push([c.customer, c.units, c.products, c.value.toFixed(2), fmtDate(c.firstDate), fmtDate(c.lastDate)]));

    const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `aio_report_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  return { render, exportAll };
})();
