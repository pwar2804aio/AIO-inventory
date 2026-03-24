/**
 * reports.js — AIO Inventory Reporting Suite
 * 6 reports: Stock Value, Value by Category, Category Breakdown,
 *            Product Breakdown, Low Stock, Deployed Cost
 */
const Reports = (() => {

  // ── Date helpers ──────────────────────────────────────────────────────
  function parseDate(iso) { return new Date(iso); }
  function fmtMoney(n)    { return '$' + (n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function fmtNum(n)      { return (n||0).toLocaleString('en-US'); }
  function esc(s)         { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(iso)   { return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }

  function getDateRange() {
    const from = document.getElementById('rpt-date-from').value;
    const to   = document.getElementById('rpt-date-to').value;
    return {
      from: from ? new Date(from + 'T00:00:00') : null,
      to:   to   ? new Date(to   + 'T23:59:59') : null,
    };
  }

  function inRange(iso, range) {
    if (!range.from && !range.to) return true;
    const d = parseDate(iso);
    if (range.from && d < range.from) return false;
    if (range.to   && d > range.to)   return false;
    return true;
  }

  // ── Core data builders ────────────────────────────────────────────────

  /** All serials in stock with their costs, filtered by when they were received */
  function getHoldingData(range) {
    const { movements } = DB.getData();
    const invMap = Inventory.getInventoryMap();
    const rows = [];

    Object.values(invMap).forEach(v => {
      [...v.inStock].forEach(serial => {
        // Find when this serial was received
        const inMv = movements.find(m => m.type === 'IN' && m.serials.includes(serial));
        if (range && inMv && !inRange(inMv.date, range)) return;
        const cost = DB.getSerialCost(serial);
        rows.push({
          serial,
          product:  v.product,
          category: v.category,
          location: v.location,
          cost:     cost ?? null,
          receivedDate: inMv ? inMv.date : null,
        });
      });
    });
    return rows;
  }

  /** All deployed serials with costs, filtered by dispatch date */
  function getDeployedData(range) {
    return Inventory.getDeployedSerialRows().filter(r => {
      if (!range.from && !range.to) return true;
      return inRange(r.date, range);
    });
  }

  // ── Report 1: Total Stock Value ───────────────────────────────────────
  function renderStockValue() {
    const range = getDateRange();
    const rows  = getHoldingData(range);
    const priced   = rows.filter(r => r.cost != null);
    const unpriced = rows.filter(r => r.cost == null);
    const total    = priced.reduce((a, r) => a + r.cost, 0);
    const avgCost  = priced.length ? total / priced.length : 0;

    // By product
    const byProduct = {};
    rows.forEach(r => {
      if (!byProduct[r.product]) byProduct[r.product] = { product: r.product, category: r.category, units: 0, costedUnits: 0, total: 0 };
      byProduct[r.product].units++;
      if (r.cost != null) { byProduct[r.product].costedUnits++; byProduct[r.product].total += r.cost; }
    });
    const productRows = Object.values(byProduct).sort((a, b) => b.total - a.total);
    const maxTotal = Math.max(...productRows.map(r => r.total), 1);

    document.getElementById('rpt-stock-value').innerHTML = `
      <div class="rpt-summary-cards">
        <div class="rpt-card rpt-card-green">
          <div class="rpt-card-label">Total holding value</div>
          <div class="rpt-card-val">${fmtMoney(total)}</div>
          <div class="rpt-card-sub">${fmtNum(priced.length)} priced units</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Total units in stock</div>
          <div class="rpt-card-val">${fmtNum(rows.length)}</div>
          <div class="rpt-card-sub">${unpriced.length} without cost</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Average unit cost</div>
          <div class="rpt-card-val">${fmtMoney(avgCost)}</div>
          <div class="rpt-card-sub">across priced units</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Product lines</div>
          <div class="rpt-card-val">${fmtNum(productRows.length)}</div>
          <div class="rpt-card-sub">in holding</div>
        </div>
      </div>
      <div class="rpt-chart-label">Value by product</div>
      <div class="rpt-bar-chart">
        ${productRows.map(r => `
          <div class="rpt-bar-row">
            <div class="rpt-bar-name" title="${esc(r.product)}">${esc(r.product)}</div>
            <div class="rpt-bar-track">
              <div class="rpt-bar-fill rpt-fill-green" style="width:${Math.max(2, Math.round(r.total / maxTotal * 100))}%"></div>
            </div>
            <div class="rpt-bar-val">${fmtMoney(r.total)} <span class="rpt-bar-units">${r.units}u</span></div>
          </div>`).join('')}
      </div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Product</th><th>Category</th><th>Units</th><th>Priced</th><th>Total value</th><th>Avg cost</th></tr></thead>
          <tbody>${productRows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.product)}</td>
            <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
            <td>${fmtNum(r.units)}</td>
            <td>${fmtNum(r.costedUnits)}</td>
            <td style="font-weight:500;color:var(--success-text)">${fmtMoney(r.total)}</td>
            <td>${r.costedUnits ? fmtMoney(r.total / r.costedUnits) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Report 2: Stock Value by Category ────────────────────────────────
  function renderValueByCategory() {
    const range = getDateRange();
    const rows  = getHoldingData(range);
    const bycat = {};
    rows.forEach(r => {
      const k = r.category || 'Uncategorised';
      if (!bycat[k]) bycat[k] = { category: k, units: 0, costedUnits: 0, total: 0 };
      bycat[k].units++;
      if (r.cost != null) { bycat[k].costedUnits++; bycat[k].total += r.cost; }
    });
    const catRows  = Object.values(bycat).sort((a, b) => b.total - a.total);
    const grandTotal = catRows.reduce((a, r) => a + r.total, 0);
    const maxTotal   = Math.max(...catRows.map(r => r.total), 1);
    const COLOURS    = ['rpt-fill-blue','rpt-fill-green','rpt-fill-amber','rpt-fill-coral','rpt-fill-teal','rpt-fill-purple'];

    document.getElementById('rpt-value-category').innerHTML = `
      <div class="rpt-summary-cards">
        <div class="rpt-card rpt-card-green">
          <div class="rpt-card-label">Grand total value</div>
          <div class="rpt-card-val">${fmtMoney(grandTotal)}</div>
          <div class="rpt-card-sub">${catRows.length} categories</div>
        </div>
        ${catRows.slice(0,3).map((r,i) => `
        <div class="rpt-card">
          <div class="rpt-card-label">${esc(r.category)}</div>
          <div class="rpt-card-val">${fmtMoney(r.total)}</div>
          <div class="rpt-card-sub">${fmtNum(r.units)} units · ${grandTotal ? Math.round(r.total/grandTotal*100) : 0}%</div>
        </div>`).join('')}
      </div>
      <div class="rpt-chart-label">Value breakdown by category</div>
      <div class="rpt-bar-chart">
        ${catRows.map((r,i) => `
          <div class="rpt-bar-row">
            <div class="rpt-bar-name">${esc(r.category)}</div>
            <div class="rpt-bar-track">
              <div class="rpt-bar-fill ${COLOURS[i % COLOURS.length]}" style="width:${Math.max(2, Math.round(r.total / maxTotal * 100))}%"></div>
            </div>
            <div class="rpt-bar-val">${fmtMoney(r.total)} <span class="rpt-bar-units">${grandTotal ? Math.round(r.total/grandTotal*100) : 0}%</span></div>
          </div>`).join('')}
      </div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Category</th><th>Units</th><th>Priced units</th><th>Total value</th><th>% of total</th><th>Avg cost</th></tr></thead>
          <tbody>${catRows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.category)}</td>
            <td>${fmtNum(r.units)}</td>
            <td>${fmtNum(r.costedUnits)}</td>
            <td style="font-weight:500;color:var(--success-text)">${fmtMoney(r.total)}</td>
            <td>${grandTotal ? Math.round(r.total/grandTotal*100) : 0}%</td>
            <td>${r.costedUnits ? fmtMoney(r.total/r.costedUnits) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Report 3: Category Breakdown ─────────────────────────────────────
  function renderCategoryBreakdown() {
    const range = getDateRange();
    const allSerials = Inventory.getAllSerialRows();
    const deployed   = Inventory.getDeployedSerialRows().filter(r => inRange(r.date, range));
    const { shipments } = DB.getData();

    // Holding (in-stock only for this range)
    const holding = getHoldingData(range);

    const cats = {};
    const addTo = (cat, field) => {
      if (!cats[cat]) cats[cat] = { category: cat, holding: 0, inTransit: 0, deployed: 0 };
      cats[cat][field]++;
    };

    holding.forEach(r => addTo(r.category || 'Uncategorised', 'holding'));
    shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => p.serials.forEach(() => addTo(p.category || 'Uncategorised', 'inTransit')));
    });
    deployed.forEach(r => addTo(r.category || 'Uncategorised', 'deployed'));

    const catRows = Object.values(cats).sort((a, b) => (b.holding + b.deployed) - (a.holding + a.deployed));
    const maxUnits = Math.max(...catRows.map(r => r.holding + r.inTransit + r.deployed), 1);

    document.getElementById('rpt-category-breakdown').innerHTML = `
      <div class="rpt-legend">
        <span class="rpt-legend-dot rpt-fill-green"></span> Holding
        <span class="rpt-legend-dot rpt-fill-amber" style="margin-left:12px"></span> In transit
        <span class="rpt-legend-dot rpt-fill-coral" style="margin-left:12px"></span> Deployed
      </div>
      <div class="rpt-stacked-chart">
        ${catRows.map(r => {
          const total = r.holding + r.inTransit + r.deployed;
          const hPct  = Math.round(r.holding    / maxUnits * 100);
          const tPct  = Math.round(r.inTransit  / maxUnits * 100);
          const dPct  = Math.round(r.deployed   / maxUnits * 100);
          return `<div class="rpt-bar-row">
            <div class="rpt-bar-name">${esc(r.category)}</div>
            <div class="rpt-bar-track">
              <div class="rpt-bar-fill rpt-fill-green"  style="width:${Math.max(hPct,0)}%;display:inline-block;position:relative;float:left" title="Holding: ${r.holding}"></div>
              <div class="rpt-bar-fill rpt-fill-amber"  style="width:${Math.max(tPct,0)}%;display:inline-block;position:relative;float:left" title="In transit: ${r.inTransit}"></div>
              <div class="rpt-bar-fill rpt-fill-coral"  style="width:${Math.max(dPct,0)}%;display:inline-block;position:relative;float:left" title="Deployed: ${r.deployed}"></div>
            </div>
            <div class="rpt-bar-val">${fmtNum(total)} <span class="rpt-bar-units">total</span></div>
          </div>`;
        }).join('')}
      </div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Category</th><th>In stock</th><th>In transit</th><th>Deployed</th><th>Total units</th></tr></thead>
          <tbody>${catRows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.category)}</td>
            <td style="color:var(--success-text)">${fmtNum(r.holding)}</td>
            <td style="color:var(--transit-text)">${fmtNum(r.inTransit)}</td>
            <td style="color:var(--danger-text)">${fmtNum(r.deployed)}</td>
            <td style="font-weight:500">${fmtNum(r.holding + r.inTransit + r.deployed)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Report 4: Product Breakdown ───────────────────────────────────────
  function renderProductBreakdown() {
    const range    = getDateRange();
    const holding  = getHoldingData(range);
    const deployed = getDeployedData(range);
    const { shipments } = DB.getData();

    const prods = {};
    const addTo = (prod, cat, field) => {
      if (!prods[prod]) prods[prod] = { product: prod, category: cat, holding: 0, inTransit: 0, deployed: 0, holdingVal: 0, deployedVal: 0 };
      prods[prod][field]++;
    };

    holding.forEach(r => {
      addTo(r.product, r.category, 'holding');
      if (r.cost != null) prods[r.product].holdingVal += r.cost;
    });
    shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => p.serials.forEach(() => addTo(p.product, p.category, 'inTransit')));
    });
    deployed.forEach(r => {
      addTo(r.product, r.category, 'deployed');
      if (r.cost != null) prods[r.product].deployedVal += r.cost;
    });

    const prodRows = Object.values(prods).sort((a, b) => (b.holding + b.deployed) - (a.holding + a.deployed));

    document.getElementById('rpt-product-breakdown').innerHTML = `
      <div class="rpt-summary-cards">
        <div class="rpt-card"><div class="rpt-card-label">Product lines</div><div class="rpt-card-val">${fmtNum(prodRows.length)}</div></div>
        <div class="rpt-card"><div class="rpt-card-label">Total in stock</div><div class="rpt-card-val" style="color:var(--success-text)">${fmtNum(holding.length)}</div></div>
        <div class="rpt-card"><div class="rpt-card-label">Total deployed</div><div class="rpt-card-val" style="color:var(--danger-text)">${fmtNum(deployed.length)}</div></div>
      </div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Product</th><th>Category</th><th>In stock</th><th>In transit</th><th>Deployed</th><th>Holding value</th><th>Deployed value</th></tr></thead>
          <tbody>${prodRows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.product)}</td>
            <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
            <td style="color:var(--success-text)">${fmtNum(r.holding)}</td>
            <td style="color:var(--transit-text)">${fmtNum(r.inTransit)}</td>
            <td style="color:var(--danger-text)">${fmtNum(r.deployed)}</td>
            <td>${r.holdingVal  ? fmtMoney(r.holdingVal)  : '—'}</td>
            <td>${r.deployedVal ? fmtMoney(r.deployedVal) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Report 5: Low Stock ───────────────────────────────────────────────
  function renderLowStock() {
    const lowItems = Inventory.getLowStockItems();
    const map      = Inventory.getInventoryMap();
    const allItems = Object.values(map);
    const zeroItems = lowItems.filter(v => v.inStock.size === 0);
    const warnItems = lowItems.filter(v => v.inStock.size > 0);

    document.getElementById('rpt-low-stock').innerHTML = `
      <div class="rpt-summary-cards">
        <div class="rpt-card rpt-card-red">
          <div class="rpt-card-label">Out of stock</div>
          <div class="rpt-card-val" style="color:var(--danger-text)">${fmtNum(zeroItems.length)}</div>
          <div class="rpt-card-sub">product lines at zero</div>
        </div>
        <div class="rpt-card rpt-card-amber">
          <div class="rpt-card-label">Low stock warnings</div>
          <div class="rpt-card-val" style="color:var(--warning-text)">${fmtNum(warnItems.length)}</div>
          <div class="rpt-card-sub">at or below threshold</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Healthy stock</div>
          <div class="rpt-card-val" style="color:var(--success-text)">${fmtNum(allItems.length - lowItems.length)}</div>
          <div class="rpt-card-sub">product lines OK</div>
        </div>
      </div>
      ${zeroItems.length ? `
      <div class="rpt-chart-label" style="color:var(--danger-text)">Out of stock</div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Product</th><th>Category</th><th>Location</th><th>Threshold</th><th>Status</th></tr></thead>
          <tbody>${zeroItems.map(v => `<tr>
            <td style="font-weight:500">${esc(v.product)}</td>
            <td><span class="cat-badge">${esc(v.category||'—')}</span></td>
            <td><span class="loc-badge">${esc(v.location||'—')}</span></td>
            <td>${DB.getThreshold(v.product+'||'+v.location)}</td>
            <td><span class="badge b-zero">Out of stock</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
      ${warnItems.length ? `
      <div class="rpt-chart-label" style="color:var(--warning-text);margin-top:1rem">Low stock warnings</div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Product</th><th>Category</th><th>Location</th><th>In stock</th><th>Threshold</th></tr></thead>
          <tbody>${warnItems.map(v => `<tr>
            <td style="font-weight:500">${esc(v.product)}</td>
            <td><span class="cat-badge">${esc(v.category||'—')}</span></td>
            <td><span class="loc-badge">${esc(v.location||'—')}</span></td>
            <td><span class="badge b-low">${v.inStock.size}</span></td>
            <td>${DB.getThreshold(v.product+'||'+v.location)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
      ${!lowItems.length ? '<div class="empty" style="padding:2rem">All products are well stocked</div>' : ''}`;
  }

  // ── Report 6: Deployed Cost ───────────────────────────────────────────
  function renderDeployedCost() {
    const range    = getDateRange();
    const deployed = getDeployedData(range);
    const priced   = deployed.filter(r => r.cost != null);
    const total    = priced.reduce((a, r) => a + r.cost, 0);

    // By customer
    const byCust = {};
    deployed.forEach(r => {
      const k = r.customer || 'Unknown';
      if (!byCust[k]) byCust[k] = { customer: k, units: 0, value: 0, costed: 0, products: new Set() };
      byCust[k].units++;
      byCust[k].products.add(r.product);
      if (r.cost != null) { byCust[k].costed++; byCust[k].value += r.cost; }
    });
    const custRows = Object.values(byCust).sort((a, b) => b.value - a.value);
    const maxVal   = Math.max(...custRows.map(r => r.value), 1);

    document.getElementById('rpt-deployed-cost').innerHTML = `
      <div class="rpt-summary-cards">
        <div class="rpt-card rpt-card-red">
          <div class="rpt-card-label">Total deployed value</div>
          <div class="rpt-card-val">${fmtMoney(total)}</div>
          <div class="rpt-card-sub">${fmtNum(priced.length)} priced units</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Units deployed</div>
          <div class="rpt-card-val">${fmtNum(deployed.length)}</div>
          <div class="rpt-card-sub">${deployed.length - priced.length} without cost</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Customers</div>
          <div class="rpt-card-val">${fmtNum(custRows.length)}</div>
          <div class="rpt-card-sub">with deployed units</div>
        </div>
        <div class="rpt-card">
          <div class="rpt-card-label">Avg cost per unit</div>
          <div class="rpt-card-val">${priced.length ? fmtMoney(total / priced.length) : '—'}</div>
          <div class="rpt-card-sub">deployed units</div>
        </div>
      </div>
      <div class="rpt-chart-label">Deployed value by customer</div>
      <div class="rpt-bar-chart">
        ${custRows.map(r => `
          <div class="rpt-bar-row">
            <div class="rpt-bar-name" title="${esc(r.customer)}">${esc(r.customer)}</div>
            <div class="rpt-bar-track">
              <div class="rpt-bar-fill rpt-fill-coral" style="width:${Math.max(2, Math.round(r.value / maxVal * 100))}%"></div>
            </div>
            <div class="rpt-bar-val">${fmtMoney(r.value)} <span class="rpt-bar-units">${r.units}u</span></div>
          </div>`).join('')}
      </div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr><th>Customer / Account</th><th>Units deployed</th><th>Products</th><th>Total value</th><th>Avg per unit</th></tr></thead>
          <tbody>${custRows.map(r => `<tr>
            <td style="font-weight:500">${esc(r.customer)}</td>
            <td>${fmtNum(r.units)}</td>
            <td style="font-size:11px;color:var(--text-muted)">${[...r.products].map(p => esc(p)).join(', ')}</td>
            <td style="font-weight:500;color:var(--danger-text)">${fmtMoney(r.value)}</td>
            <td>${r.costed ? fmtMoney(r.value / r.costed) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Master render ─────────────────────────────────────────────────────
  function renderAll() {
    renderStockValue();
    renderValueByCategory();
    renderCategoryBreakdown();
    renderProductBreakdown();
    renderLowStock();
    renderDeployedCost();
  }

  // ── CSV Exports ───────────────────────────────────────────────────────
  function exportReport(reportId) {
    const range = getDateRange();
    let rows, filename;

    if (reportId === 'stock-value') {
      const data = getHoldingData(range);
      rows = [['Serial','Product','Category','Location','Cost','Received Date']];
      data.forEach(r => rows.push([r.serial, r.product, r.category, r.location, r.cost??'', r.receivedDate ? fmtDate(r.receivedDate) : '']));
      filename = 'aio_stock_value.csv';
    } else if (reportId === 'value-category') {
      const data = getHoldingData(range);
      const bycat = {};
      data.forEach(r => {
        const k = r.category||'Uncategorised';
        if (!bycat[k]) bycat[k] = {category:k,units:0,costedUnits:0,total:0};
        bycat[k].units++;
        if (r.cost!=null){bycat[k].costedUnits++;bycat[k].total+=r.cost;}
      });
      rows = [['Category','Units','Priced Units','Total Value','Avg Cost']];
      Object.values(bycat).sort((a,b)=>b.total-a.total).forEach(r => rows.push([r.category,r.units,r.costedUnits,r.total.toFixed(2),r.costedUnits?((r.total/r.costedUnits).toFixed(2)):'']));
      filename = 'aio_value_by_category.csv';
    } else if (reportId === 'category-breakdown') {
      const holding  = getHoldingData(range);
      const deployed = getDeployedData(range);
      const cats = {};
      holding.forEach(r  => { const k=r.category||'Uncategorised'; if(!cats[k])cats[k]={category:k,holding:0,inTransit:0,deployed:0}; cats[k].holding++; });
      deployed.forEach(r => { const k=r.category||'Uncategorised'; if(!cats[k])cats[k]={category:k,holding:0,inTransit:0,deployed:0}; cats[k].deployed++; });
      rows = [['Category','In Stock','In Transit','Deployed','Total']];
      Object.values(cats).forEach(r => rows.push([r.category,r.holding,r.inTransit,r.deployed,r.holding+r.inTransit+r.deployed]));
      filename = 'aio_category_breakdown.csv';
    } else if (reportId === 'product-breakdown') {
      const holding  = getHoldingData(range);
      const deployed = getDeployedData(range);
      const prods = {};
      holding.forEach(r  => { if(!prods[r.product])prods[r.product]={product:r.product,category:r.category,holding:0,deployed:0,holdingVal:0,deployedVal:0}; prods[r.product].holding++; if(r.cost)prods[r.product].holdingVal+=r.cost; });
      deployed.forEach(r => { if(!prods[r.product])prods[r.product]={product:r.product,category:r.category,holding:0,deployed:0,holdingVal:0,deployedVal:0}; prods[r.product].deployed++; if(r.cost)prods[r.product].deployedVal+=r.cost; });
      rows = [['Product','Category','In Stock','Deployed','Holding Value','Deployed Value']];
      Object.values(prods).forEach(r => rows.push([r.product,r.category,r.holding,r.deployed,r.holdingVal.toFixed(2),r.deployedVal.toFixed(2)]));
      filename = 'aio_product_breakdown.csv';
    } else if (reportId === 'low-stock') {
      const lowItems = Inventory.getLowStockItems();
      rows = [['Product','Category','Location','In Stock','Threshold','Status']];
      lowItems.forEach(v => rows.push([v.product,v.category,v.location,v.inStock.size,DB.getThreshold(v.product+'||'+v.location),v.inStock.size===0?'Out of stock':'Low stock']));
      filename = 'aio_low_stock.csv';
    } else if (reportId === 'deployed-cost') {
      const data = getDeployedData(range);
      rows = [['Serial','Product','Category','Customer','Dispatched By','Date','Reference','Cost']];
      data.forEach(r => rows.push([r.serial,r.product,r.category,r.customer,r.by,fmtDate(r.date),r.ref,r.cost??'']));
      filename = 'aio_deployed_cost.csv';
    }

    if (rows) {
      const csv = rows.map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(',')).join('\n');
      const a   = document.createElement('a');
      a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }

  return { renderAll, renderStockValue, renderValueByCategory, renderCategoryBreakdown, renderProductBreakdown, renderLowStock, renderDeployedCost, exportReport };
})();
