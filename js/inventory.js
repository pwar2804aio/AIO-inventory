/**
 * inventory.js — business logic
 */
const CATEGORIES = ['POS Device', 'Payment Device', 'Printer', 'Networking', 'Kiosks', 'Other'];

const Inventory = (() => {

  // ── Inventory map ────────────────────────────────────────────────────
  function getInventoryMap() {
    const map = {};
    DB.getData().movements.forEach(mv => {
      const key = mv.product + '||' + (mv.location || '');
      if (!map[key]) map[key] = { product: mv.product, category: mv.category || '', location: mv.location || '', inStock: new Set(), totalIn: 0, totalOut: 0 };
      if (mv.type === 'IN') {
        mv.serials.forEach(s => map[key].inStock.add(s));
        map[key].totalIn += mv.serials.length;
      } else {
        mv.serials.forEach(s => map[key].inStock.delete(s));
        map[key].totalOut += mv.serials.length;
      }
    });
    return map;
  }

  // Group by product name only (for dashboard widget)
  function getStockByProduct() {
    const map = {};
    Object.values(getInventoryMap()).forEach(v => {
      if (!map[v.product]) map[v.product] = { product: v.product, category: v.category, inStock: 0, inTransit: 0 };
      map[v.product].inStock += v.inStock.size;
    });
    // Add in-transit counts
    DB.getData().shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => {
        if (!map[p.product]) map[p.product] = { product: p.product, category: p.category, inStock: 0, inTransit: 0 };
        map[p.product].inTransit += p.serials.length;
      });
    });
    return Object.values(map).sort((a, b) => a.product.localeCompare(b.product));
  }

  // All individual serial rows for All Stock view
  function getAllSerialRows() {
    const rows = [];
    const map = getInventoryMap();
    Object.values(map).forEach(v => {
      [...v.inStock].sort().forEach(serial => {
        rows.push({
          serial,
          product:  v.product,
          category: v.category,
          location: v.location,
          status:   'in-stock',
          cost:     DB.getSerialCost(serial),
        });
      });
    });
    // Also add in-transit serials
    DB.getData().shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => {
        p.serials.forEach(serial => {
          rows.push({
            serial,
            product:    p.product,
            category:   p.category,
            location:   s.location || '',
            status:     'in-transit',
            shipmentId: s.id,
            cost:       DB.getSerialCost(serial),
          });
        });
      });
    });
    return rows;
  }

  // All individually deployed (dispatched) serial rows for Stock Deployed view
  function getDeployedSerialRows() {
    const rows = [];
    const { movements } = DB.getData();
    // Build a map: serial -> last OUT movement
    const lastOut = {};
    movements.forEach(mv => {
      if (mv.type === 'OUT') {
        mv.serials.forEach(s => {
          lastOut[s] = { ...mv };
        });
      }
    });
    // Only include serials that are still dispatched (not re-received)
    const availableSerials = getAvailableSerials();
    Object.entries(lastOut).forEach(([serial, mv]) => {
      if (!availableSerials.has(serial)) {
        rows.push({
          serial,
          product:    mv.product,
          category:   mv.category || '',
          customer:   mv.customer || '',
          by:         mv.by || '',
          ref:        mv.ref || '',
          date:       mv.date,
          cost:       DB.getSerialCost(serial),
        });
      }
    });
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function getAvailableSerials() {
    const s = new Set();
    Object.values(getInventoryMap()).forEach(v => v.inStock.forEach(x => s.add(x)));
    return s;
  }

  function getLowStockItems() {
    return Object.values(getInventoryMap()).filter(v => {
      return v.inStock.size <= DB.getThreshold(v.product + '||' + v.location);
    });
  }

  function getSerialInfo(serial) {
    const s = serial.trim().toUpperCase();
    const history = [];
    let status = 'unknown', currentProduct = null, currentLocation = null, currentCategory = null;
    // Check movements
    DB.getData().movements.forEach(mv => {
      if (mv.serials.map(x => x.toUpperCase()).includes(s)) {
        history.push(mv);
        if (mv.type === 'IN')  { status = 'in-stock';   currentProduct = mv.product; currentLocation = mv.location; currentCategory = mv.category; }
        if (mv.type === 'OUT') { status = 'dispatched'; }
      }
    });
    // Check shipments
    DB.getData().shipments.forEach(sh => {
      sh.products.forEach(p => {
        if (p.serials.map(x => x.toUpperCase()).includes(s)) {
          if (status === 'unknown') { status = 'in-transit'; currentProduct = p.product; currentLocation = sh.location; currentCategory = p.category; }
        }
      });
    });
    return { serial: s, history, status, currentProduct, currentLocation, currentCategory };
  }

  // ── Stock In ─────────────────────────────────────────────────────────
  function stockIn(receipt) {
    const { supplier, location, receivedBy, products } = receipt;
    if (!location) throw new Error('Location / warehouse is required.');
    if (!products || products.length === 0) throw new Error('Add at least one product.');

    products.forEach((p, i) => {
      if (!p.product)  throw new Error(`Product ${i + 1}: name is required.`);
      if (!p.category) throw new Error(`Product ${i + 1}: category is required.`);
      if (!p.serials || p.serials.length === 0) throw new Error(`Product ${i + 1} ("${p.product}"): add at least one serial number.`);
      const key = p.product + '||' + location;
      if (p.threshold !== '' && p.threshold != null) DB.setThreshold(key, parseInt(p.threshold, 10));
      // Save per-serial costs
      if (p.serialCosts) {
        Object.entries(p.serialCosts).forEach(([serial, cost]) => {
          if (cost !== '' && cost != null) DB.setSerialCost(serial, parseFloat(cost));
        });
      }
      DB.addMovement({
        id: Date.now() + Math.random(),
        type: 'IN',
        product: p.product, category: p.category, location,
        supplier: supplier || '', receivedBy: receivedBy || '',
        serials: [...p.serials],
        date: new Date().toISOString(),
      });
    });
  }

  // ── Shipments (In Transit) ────────────────────────────────────────────
  function createShipment(opts) {
    const { supplier, location, expectedBy, products } = opts;
    if (!products || products.length === 0) throw new Error('Add at least one product.');
    products.forEach((p, i) => {
      if (!p.product)  throw new Error(`Product ${i + 1}: name is required.`);
      if (!p.category) throw new Error(`Product ${i + 1}: category is required.`);
      if (!p.serials || p.serials.length === 0) throw new Error(`Product ${i + 1}: add at least one serial number.`);
    });
    // Save costs
    products.forEach(p => {
      if (p.serialCosts) {
        Object.entries(p.serialCosts).forEach(([serial, cost]) => {
          if (cost !== '' && cost != null) DB.setSerialCost(serial, parseFloat(cost));
        });
      }
    });
    const shipment = {
      id:         Date.now(),
      status:     'in-transit',
      supplier:   supplier || '',
      location:   location || '',
      expectedBy: expectedBy || '',
      products:   products.map(p => ({ product: p.product, category: p.category, serials: [...p.serials] })),
      createdAt:  new Date().toISOString(),
    };
    DB.addShipment(shipment);
    return shipment;
  }

  function receiveShipment(id, receivedBy, actualLocation) {
    const { shipments } = DB.getData();
    const shipment = shipments.find(s => s.id === id);
    if (!shipment) throw new Error('Shipment not found.');
    const location = actualLocation || shipment.location;
    if (!location) throw new Error('Location is required to receive stock.');

    shipment.products.forEach(p => {
      const key = p.product + '||' + location;
      DB.addMovement({
        id: Date.now() + Math.random(),
        type: 'IN',
        product: p.product, category: p.category, location,
        supplier: shipment.supplier || '', receivedBy: receivedBy || '',
        serials: [...p.serials],
        date: new Date().toISOString(),
        fromShipment: id,
      });
    });
    DB.updateShipment(id, { status: 'received', receivedAt: new Date().toISOString(), receivedBy: receivedBy || '', actualLocation: location });
  }

  // ── Stock Out ─────────────────────────────────────────────────────────
  function stockOut(opts) {
    const { customer, by, ref, serials } = opts;
    if (!customer) throw new Error('Customer / account is required.');
    if (!serials || serials.length === 0) throw new Error('Add at least one serial number.');

    const avail = getAvailableSerials();
    const bad = serials.filter(s => !avail.has(s));
    if (bad.length > 0) throw new Error('Serials not in stock: ' + bad.join(', '));

    const map = getInventoryMap();
    const groups = {};
    serials.forEach(s => {
      Object.values(map).forEach(v => {
        if (v.inStock.has(s)) {
          const k = v.product + '||' + v.location;
          if (!groups[k]) groups[k] = { product: v.product, location: v.location, category: v.category, serials: [] };
          groups[k].serials.push(s);
        }
      });
    });

    const now = Date.now();
    Object.values(groups).forEach((g, i) => {
      DB.addMovement({ id: now + i, type: 'OUT', product: g.product, category: g.category, location: g.location, customer, by: by || '', ref: ref || '', serials: g.serials, date: new Date().toISOString() });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function getLocations() { return [...new Set([...DB.getData().movements.map(m => m.location), ...DB.getData().shipments.map(s => s.location)].filter(Boolean))].sort(); }
  function getProducts()  { return [...new Set(DB.getData().movements.map(m => m.product))].sort(); }
  function getCustomers() { return [...new Set(DB.getData().movements.filter(m => m.customer).map(m => m.customer))].sort(); }

  function getStats() {
    const { movements, shipments } = DB.getData();
    const map   = getInventoryMap();
    const items = Object.values(map);
    const inTransitCount = shipments.filter(s => s.status === 'in-transit').reduce((a, s) => a + s.products.reduce((b, p) => b + p.serials.length, 0), 0);
    return {
      totalIn:      movements.filter(m => m.type === 'IN').reduce((a, m) => a + m.serials.length, 0),
      totalOut:     movements.filter(m => m.type === 'OUT').reduce((a, m) => a + m.serials.length, 0),
      inStock:      items.reduce((a, v) => a + v.inStock.size, 0),
      inTransit:    inTransitCount,
      deployed:     getDeployedSerialRows().length,
      productLines: items.length,
      locations:    new Set(items.map(v => v.location).filter(Boolean)).size,
      lowCount:     getLowStockItems().length,
    };
  }

  return { getInventoryMap, getStockByProduct, getAllSerialRows, getDeployedSerialRows, getAvailableSerials, getLowStockItems, getSerialInfo, stockIn, createShipment, receiveShipment, stockOut, getLocations, getProducts, getCustomers, getStats, CATEGORIES };
})();
