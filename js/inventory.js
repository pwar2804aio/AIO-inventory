/**
 * inventory.js — business logic
 */
const CATEGORIES = ['POS Device', 'Payment Device', 'Printer', 'Networking', 'Kiosks', 'Other'];

const Inventory = (() => {

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
    DB.getData().movements.forEach(mv => {
      if (mv.serials.map(x => x.toUpperCase()).includes(s)) {
        history.push(mv);
        if (mv.type === 'IN')  { status = 'in-stock';   currentProduct = mv.product; currentLocation = mv.location; currentCategory = mv.category; }
        if (mv.type === 'OUT') { status = 'dispatched'; }
      }
    });
    return { serial: s, history, status, currentProduct, currentLocation, currentCategory };
  }

  /**
   * Receive one or more products in a single receipt.
   * @param {Object} receipt - { supplier, location, receivedBy, products: [{product, category, threshold, serials}] }
   */
  function stockIn(receipt) {
    const { supplier, location, receivedBy, products } = receipt;
    if (!location) throw new Error('Location / warehouse is required.');
    if (!products || products.length === 0) throw new Error('Add at least one product.');

    products.forEach((p, i) => {
      if (!p.product) throw new Error(`Product ${i + 1}: name is required.`);
      if (!p.category) throw new Error(`Product ${i + 1}: category is required.`);
      if (!p.serials || p.serials.length === 0) throw new Error(`Product ${i + 1} ("${p.product}"): add at least one serial number.`);
      const key = p.product + '||' + location;
      if (p.threshold !== '' && p.threshold !== null && p.threshold !== undefined) {
        DB.setThreshold(key, parseInt(p.threshold, 10));
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

  function getLocations()  { return [...new Set(DB.getData().movements.map(m => m.location).filter(Boolean))].sort(); }
  function getProducts()   { return [...new Set(DB.getData().movements.map(m => m.product))].sort(); }
  function getCustomers()  { return [...new Set(DB.getData().movements.filter(m => m.customer).map(m => m.customer))].sort(); }

  function getStats() {
    const { movements } = DB.getData();
    const map   = getInventoryMap();
    const items = Object.values(map);
    return {
      totalIn:      movements.filter(m => m.type === 'IN').reduce((a, m) => a + m.serials.length, 0),
      totalOut:     movements.filter(m => m.type === 'OUT').reduce((a, m) => a + m.serials.length, 0),
      inStock:      items.reduce((a, v) => a + v.inStock.size, 0),
      productLines: items.length,
      locations:    new Set(items.map(v => v.location).filter(Boolean)).size,
      lowCount:     getLowStockItems().length,
    };
  }

  return { getInventoryMap, getAvailableSerials, getLowStockItems, getSerialInfo, stockIn, stockOut, getLocations, getProducts, getCustomers, getStats, CATEGORIES };
})();
