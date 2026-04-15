/**
 * inventory.js — business logic
 */
const CATEGORIES = [
  'Cash Drawer',
  'Payment Terminal',
  'Customer-Facing Display',
  'POS Terminal',
  'Kitchen Display System',
  'Kitchen Printer',
  'Receipt/Label Printer',
  'Monitor Stand',
  'Monitor Mount',
  'Ceiling Mount',
  'Wi-Fi Access Point',
  'Gateway/Router',
  'Mobile Router',
  'LTE Failover',
  'PoE Switch',
  'Card Reader',
  'Menu Board',
  'Tablet',
  'Tableside AI Device',
  'MPOS',
  'Kiosk',
  'Kiosk Stand',
  'Kiosk Mount',
  'Other',
];

const HARDCODED_PRODUCTS = [
  { name: 'Volcora Auto Open Cash Drawer',         category: 'Cash Drawer' },
  { name: 'Adyen AMS1',                            category: 'Payment Terminal' },
  { name: 'Sunmi D3 Pro Separate Monitor',         category: 'Customer-Facing Display' },
  { name: 'Sunmi D3 Pro Data Processing Machine',  category: 'POS Terminal' },
  { name: 'Sunmi D2s KDS',                         category: 'Kitchen Display System' },
  { name: 'Sunmi 80mm Kitchen Cloud Printer',      category: 'Kitchen Printer' },
  { name: 'Epson TM-L90 Label Printer',            category: 'Receipt/Label Printer' },
  { name: 'Wearson Adjustable LCD TV Stand',       category: 'Monitor Stand' },
  { name: 'MOUNTUP Single Monitor Mount',          category: 'Monitor Mount' },
  { name: 'WALI TV Ceiling Mount',                 category: 'Ceiling Mount' },
  { name: 'Ubiquiti U7-Lite',                      category: 'Wi-Fi Access Point' },
  { name: 'Ubiquiti Express 7 (UX7)',              category: 'Gateway/Router' },
  { name: 'Ubiquiti UMR-Industrial',               category: 'Mobile Router' },
  { name: 'Ubiquiti U-LTE-Backup Pro',             category: 'LTE Failover' },
  { name: 'Ubiquiti Dream Router (UDR7)',           category: 'Gateway/Router' },
  { name: 'Ubiquiti USW-Lite-8-PoE',              category: 'PoE Switch' },
  { name: 'Adyen NYC1-SCR',                        category: 'Card Reader' },
  { name: 'HK1 RBOX D8 Android TV Stick',         category: 'Menu Board' },
  { name: 'Samsung Galaxy Tab A9',                 category: 'Tablet' },
  { name: 'AIO Nugget (Tableside AI)',             category: 'Tableside AI Device' },
  { name: 'Samsung Galaxy A14',                    category: 'MPOS' },
  { name: 'AIO Kiosk',                             category: 'Kiosk' },
  { name: 'AIO Kiosk Stand',                       category: 'Kiosk Stand' },
  { name: 'Kiosk Adyen Mount',                     category: 'Kiosk Mount' },
  { name: 'Other',                                 category: 'Other' },
];

let PRODUCTS = [...HARDCODED_PRODUCTS];
function refreshProducts() {
  const records = DB.getProductRecords();
  const merged  = [...HARDCODED_PRODUCTS];
  records.forEach(r => {
    if (!merged.find(h => h.name === r.name)) {
      merged.push({ name: r.name, category: r.category || 'Other' });
    } else {
      // Update category/supplier on existing entry
      const idx = merged.findIndex(h => h.name === r.name);
      if (idx > -1) merged[idx] = { ...merged[idx], category: r.category || merged[idx].category, supplier: r.supplier };
    }
  });
  PRODUCTS.length = 0;
  PRODUCTS.push(...merged);
}

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
      if (!map[v.product]) map[v.product] = { product: v.product, category: v.category, inStock: 0, inTransit: 0, totalCost: 0, costedUnits: 0 };
      map[v.product].inStock += v.inStock.size;
      // Sum cost for all in-stock serials
      v.inStock.forEach(serial => {
        const cost = DB.getSerialCost(serial);
        if (cost != null) {
          map[v.product].totalCost  += cost;
          map[v.product].costedUnits++;
        }
      });
    });
    // Add in-transit counts and costs
    DB.getData().shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => {
        if (!map[p.product]) map[p.product] = { product: p.product, category: p.category, inStock: 0, inTransit: 0, totalCost: 0, costedUnits: 0 };
        map[p.product].inTransit += p.serials.length;
        p.serials.forEach(serial => {
          const cost = DB.getSerialCost(serial);
          if (cost != null) {
            map[p.product].totalCost  += cost;
            map[p.product].costedUnits++;
          }
        });
      });
    });
    // Add avgCost derived field
    return Object.values(map).sort((a, b) => a.product.localeCompare(b.product)).map(p => ({
      ...p,
      avgCost: p.costedUnits > 0 ? p.totalCost / p.costedUnits : null,
    }));
  }

  // All individual serial rows for Stock Holding view
  function getAllSerialRows() {
    const rows = [];
    // Build a map of serial → the IN movement that put it in stock (most recent IN)
    const serialInMovement = {};
    DB.getData().movements.forEach(mv => {
      if (mv.type === 'IN') {
        mv.serials.forEach(s => { serialInMovement[s.toUpperCase()] = mv; });
      }
    });

    const map = getInventoryMap();
    Object.values(map).forEach(v => {
      [...v.inStock].sort().forEach(serial => {
        const inMv = serialInMovement[serial.toUpperCase()];
        // used = permanent flag (set at receipt, never cleared)
        const used = inMv?.used === true || inMv?.condition === 'used';
        // Per-serial condition overrides movement-level condition (prevents batch bleed)
        const scEntry = DB.getSerialCondition(serial);
        const condition = scEntry !== null
          ? scEntry.condition                                              // per-serial override
          : (inMv?.condition === 'used' ? '' : (inMv?.condition || '')); // movement fallback
        const testedBy  = scEntry !== null ? (scEntry.testedBy  || '') : (inMv?.testedBy  || '');
        const testedAt  = scEntry !== null ? (scEntry.testedAt  || '') : (inMv?.testedAt  || '');
        const testNotes = scEntry !== null ? (scEntry.testNotes || '') : (inMv?.testNotes || '');
        rows.push({
          serial,
          product:   v.product,
          category:  v.category,
          location:  v.location,
          status:    'in-stock',
          used,
          condition,
          testedBy,
          testedAt,
          testNotes,
          poNumber:  inMv?.poNumber  || DB.getSerialPO(serial) || '',
          cost:      DB.getSerialCost(serial),
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
            condition:  '',
            shipmentId: s.id,
            poNumber:   s.poNumber || DB.getSerialPO(serial) || '',
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
      if (mv.type === 'OUT' && !mv.isRmaTl) {
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

  // Returns a map of serial -> condition for all serials currently in stock
  function getSerialConditionMap() {
    const map = {};
    getAllSerialRows().forEach(r => { map[r.serial.toUpperCase()] = r.condition || ''; });
    return map;
  }

  // Returns all dispatched rows that were RMA or TL at time of dispatch
  function getRmaTlDispatchedRows() {
    const rows = [];
    const { movements } = DB.getData();
    const lastOut = {};
    movements.forEach(mv => {
      if (mv.type === 'OUT' && mv.isRmaTl) {
        mv.serials.forEach(s => { lastOut[s] = { ...mv }; });
      }
    });
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
          rmaTlType:  mv.rmaTlType || 'rma',
        });
      }
    });
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // Returns items with fail-tl condition still in stock (for Total Loss view)
  function getTotalLossRows() {
    return getAllSerialRows().filter(r => r.condition === 'fail-tl');
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

  // Group deployed serials by product name (for dashboard)
  function getDeployedByProduct() {
    const map = {};
    getDeployedSerialRows().forEach(r => {
      if (!map[r.product]) map[r.product] = { product: r.product, category: r.category, units: 0, totalCost: 0, costedUnits: 0 };
      map[r.product].units++;
      if (r.cost != null) {
        map[r.product].totalCost  += r.cost;
        map[r.product].costedUnits++;
      }
    });
    return Object.values(map).sort((a, b) => a.product.localeCompare(b.product)).map(p => ({
      ...p,
      avgCost: p.costedUnits > 0 ? p.totalCost / p.costedUnits : null,
    }));
  }

  // ── Stock In ─────────────────────────────────────────────────────────
  function stockIn(receipt) {
    const { supplier, location, receivedBy, products } = receipt;
    if (!location) throw new Error('Location / warehouse is required.');
    if (!products || products.length === 0) throw new Error('Add at least one product.');

    // Collect all serials being received across all product rows
    const allIncoming = [];
    products.forEach((p, i) => {
      if (!p.product)  throw new Error(`Product ${i + 1}: name is required.`);
      if (!p.category) throw new Error(`Product ${i + 1}: category is required.`);
      if (!p.serials || p.serials.length === 0) throw new Error(`Product ${i + 1} ("${p.product}"): add at least one serial number, or use the "No serial numbers" toggle.`);
      p.serials.forEach(s => allIncoming.push({ serial: s.toUpperCase(), productLabel: p.product }));
    });

    // Block if any real serial already exists in stock holding (skip NS- placeholders)
    const realIncoming = allIncoming.filter(({ serial }) => !serial.startsWith('NS-'));
    const inStock = getAvailableSerials();
    const duplicates = realIncoming.filter(({ serial }) => inStock.has(serial));
    if (duplicates.length > 0) {
      throw new Error(
        `Cannot receive — ${duplicates.length} serial${duplicates.length > 1 ? 's' : ''} already in Stock Holding: ` +
        duplicates.map(d => d.serial).join(', ')
      );
    }

    // Also block if serial is already in an active in-transit shipment
    const inTransitSerials = new Set();
    DB.getData().shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => p.serials.forEach(s => inTransitSerials.add(s.toUpperCase())));
    });
    const transitDups = realIncoming.filter(({ serial }) => inTransitSerials.has(serial));
    if (transitDups.length > 0) {
      throw new Error(
        `Cannot receive — ${transitDups.length} serial${transitDups.length > 1 ? 's' : ''} already registered as In Transit: ` +
        transitDups.map(d => d.serial).join(', ')
      );
    }

    const poNumber = (receipt.poNumber || '').trim();

    products.forEach((p, i) => {
      const key = p.product + '||' + location;
      if (p.threshold !== '' && p.threshold != null) DB.setThreshold(key, parseInt(p.threshold, 10));

      // Determine unit cost — PO-linked items use PO price (locked), otherwise use entered price
      let unitCost = p.unitCost != null ? p.unitCost : null;
      if (poNumber) {
        const existingPOCost = DB.getPOUnitCost(poNumber, p.product);
        if (existingPOCost != null) {
          unitCost = existingPOCost; // use locked PO price
        }
        // Link every serial to this PO
        p.serials.forEach(s => DB.setSerialPO(s, poNumber));
        // Save/update PO record
        const existingPO = DB.getPO(poNumber) || { poNumber, supplier: supplier || '', date: new Date().toISOString().slice(0,10), lines: [] };
        const lineIdx = existingPO.lines.findIndex(l => l.product === p.product);
        if (lineIdx > -1) {
          if (unitCost != null) existingPO.lines[lineIdx].unitCost = unitCost;
        } else if (unitCost != null) {
          existingPO.lines.push({ product: p.product, category: p.category, unitCost });
        }
        DB.savePO(poNumber, existingPO);
      }

      if (unitCost != null) {
        p.serials.forEach(s => DB.setSerialCost(s, unitCost));
      }

      const condition = receipt.condition || '';
      // Faulty and needs-testing items are permanently marked as used
      const isUsed = condition === 'used' || condition === 'faulty' || condition === 'needs-testing';

      DB.addMovement({
        id: Date.now() + Math.random(),
        type: 'IN',
        product: p.product, category: p.category, location,
        supplier: supplier || '', receivedBy: receivedBy || '',
        condition,
        used: isUsed,          // permanent — never cleared regardless of condition changes
        poNumber: poNumber || '',
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

    // Collect all incoming serials
    const allIncoming = products.flatMap(p => p.serials.map(s => s.toUpperCase()));

    // Block if already in stock holding (skip NS- placeholders)
    const realIncoming = allIncoming.filter(s => !s.startsWith('NS-'));
    const inStock = getAvailableSerials();
    const stockDups = realIncoming.filter(s => inStock.has(s));
    if (stockDups.length > 0) {
      throw new Error(
        `Cannot register — ${stockDups.length} serial${stockDups.length > 1 ? 's' : ''} already in Stock Holding: ` +
        stockDups.join(', ')
      );
    }

    // Block if already deployed
    const deployedSet = new Set(getDeployedSerialRows().map(r => r.serial.toUpperCase()));
    const deployedDups = realIncoming.filter(s => deployedSet.has(s));
    if (deployedDups.length > 0) {
      throw new Error(
        `Cannot register — ${deployedDups.length} serial${deployedDups.length > 1 ? 's' : ''} already in Stock Deployed: ` +
        deployedDups.join(', ')
      );
    }

    // Block if already in another active shipment
    const inTransitSerials = new Set();
    DB.getData().shipments.filter(s => s.status === 'in-transit').forEach(s => {
      s.products.forEach(p => p.serials.forEach(s => inTransitSerials.add(s.toUpperCase())));
    });
    const transitDups = realIncoming.filter(s => inTransitSerials.has(s));
    if (transitDups.length > 0) {
      throw new Error(
        `Cannot register — ${transitDups.length} serial${transitDups.length > 1 ? 's' : ''} already registered as In Transit: ` +
        transitDups.join(', ')
      );
    }

    const poNumber = (opts.poNumber || '').trim();

    // Save costs and PO links
    products.forEach(p => {
      let unitCost = p.unitCost != null ? p.unitCost : null;
      if (poNumber) {
        const existingPOCost = DB.getPOUnitCost(poNumber, p.product);
        if (existingPOCost != null) unitCost = existingPOCost;
        p.serials.forEach(s => DB.setSerialPO(s, poNumber));
        const existingPO = DB.getPO(poNumber) || { poNumber, supplier: supplier || '', date: new Date().toISOString().slice(0,10), lines: [] };
        const lineIdx = existingPO.lines.findIndex(l => l.product === p.product);
        if (lineIdx > -1) { if (unitCost != null) existingPO.lines[lineIdx].unitCost = unitCost; }
        else if (unitCost != null) existingPO.lines.push({ product: p.product, category: p.category, unitCost });
        DB.savePO(poNumber, existingPO);
      }
      if (unitCost != null) p.serials.forEach(s => DB.setSerialCost(s, unitCost));
    });

    const shipment = {
      id:         Date.now(),
      status:     'in-transit',
      supplier:   supplier || '',
      location:   location || '',
      expectedBy: expectedBy || '',
      poNumber:   poNumber || '',
      products:   products.map(p => ({ product: p.product, category: p.category, serials: [...p.serials], unitCost: p.unitCost })),
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
      const poNumber = shipment.poNumber || '';
      // Prefer the landed cost (unit cost + freight share) set at arrange-shipment time.
      // Fall back to PO-locked price, then product unitCost, then null.
      let unitCost = p.landedPerUnit != null ? p.landedPerUnit
                   : p.unitCost     != null ? p.unitCost
                   : null;
      if (poNumber && unitCost == null) {
        const poCost = DB.getPOUnitCost(poNumber, p.product);
        if (poCost != null) unitCost = poCost;
      }
      if (poNumber) p.serials.forEach(s => DB.setSerialPO(s, poNumber));
      if (unitCost != null) p.serials.forEach(s => DB.setSerialCost(s, unitCost));
      DB.addMovement({
        id: Date.now() + Math.random(),
        type: 'IN',
        product: p.product, category: p.category, location,
        supplier: shipment.supplier || '', receivedBy: receivedBy || '',
        poNumber: poNumber,
        serials: [...p.serials],
        date: new Date().toISOString(),
        fromShipment: id,
      });
    });
    DB.updateShipment(id, { status: 'received', receivedAt: new Date().toISOString(), receivedBy: receivedBy || '', actualLocation: location });
    // Also mark the linked purchase order as received
    if (shipment.orderId) {
      DB.updateOrder(shipment.orderId, { status: 'received', receivedAt: new Date().toISOString() });
    } else if (shipment.poNumber) {
      // Fallback: find order by PO number
      const linkedOrder = (DB.getOrders() || []).find(o => o.poNumber === shipment.poNumber);
      if (linkedOrder) DB.updateOrder(linkedOrder.id, { status: 'received', receivedAt: new Date().toISOString() });
    }
  }


  // ── Partial Receive ───────────────────────────────────────────────────
  // Receive a subset of units from an in-transit shipment.
  // parts = [{product, category, serials: string[], qty: number}]
  //   serials: user-scanned real serials (replaces NS- placeholders)
  //   qty:     used only when serials is empty (non-serialised items)
  function receivePartialShipment(shipmentId, parts, receivedBy, actualLocation) {
    const { shipments } = DB.getData();
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) throw new Error('Shipment not found.');
    const location = actualLocation || shipment.location;
    if (!location) throw new Error('Location is required to receive stock.');

    const poNumber = shipment.poNumber || '';
    const now = Date.now();

    for (const part of parts) {
      const shipProd = shipment.products.find(p => p.product === part.product);
      if (!shipProd || !shipProd.serials.length) continue;

      let serialsToReceive;
      if (part.serials && part.serials.length > 0) {
        // User scanned real serials — splice equivalent NS- placeholders out
        const qty = part.serials.length;
        if (qty > shipProd.serials.length) throw new Error(`Cannot receive ${qty} of ${part.product} — only ${shipProd.serials.length} in transit.`);
        shipProd.serials.splice(0, qty);
        serialsToReceive = part.serials;
      } else {
        // Non-serialised: pop NS- placeholders from shipment
        const qty = Math.min(part.qty, shipProd.serials.length);
        if (!qty) continue;
        serialsToReceive = shipProd.serials.splice(0, qty);
      }
      if (!serialsToReceive.length) continue;

      let unitCost = shipProd.landedPerUnit != null ? shipProd.landedPerUnit
                   : shipProd.unitCost     != null ? shipProd.unitCost : null;
      if (poNumber && unitCost == null) {
        const poCost = DB.getPOUnitCost(poNumber, part.product);
        if (poCost != null) unitCost = poCost;
      }
      if (poNumber) serialsToReceive.forEach(s => DB.setSerialPO(s, poNumber));
      if (unitCost != null) serialsToReceive.forEach(s => DB.setSerialCost(s, unitCost));

      DB.addMovement({
        id: now + Math.random(),
        type: 'IN',
        product:    part.product,
        category:   part.category || shipProd.category,
        location,
        supplier:   shipment.supplier || '',
        receivedBy: receivedBy || '',
        poNumber,
        serials:    [...serialsToReceive],
        date:       new Date().toISOString(),
        fromShipment: shipmentId,
      });
    }

    // Mark shipment received if all units have been collected
    const allReceived = shipment.products.every(p => p.serials.length === 0);
    if (allReceived) {
      DB.updateShipment(shipmentId, {
        status: 'received',
        receivedAt: new Date().toISOString(),
        receivedBy: receivedBy || '',
        actualLocation: location,
      });
    }

    // Recalculate order status
    if (shipment.orderId) {
      const orderShipments = DB.getData().shipments.filter(s => s.orderId === shipment.orderId);
      const allDone   = orderShipments.every(s => s.status === 'received');
      if (allDone) DB.updateOrder(shipment.orderId, { status: 'received', receivedAt: new Date().toISOString() });
    }
  }

  // ── Stock Out ─────────────────────────────────────────────────────────
  // Returns the known product for a serial based on its first IN movement
  function getSerialKnownProduct(serial) {
    const s = serial.toUpperCase();
    const firstIn = DB.getData().movements.find(m => m.type === 'IN' && m.serials.some(x => x.toUpperCase() === s));
    return firstIn ? firstIn.product : null;
  }

  function stockOut(opts) {
    const { customer, by, ref, serials, product: expectedProduct } = opts;
    if (!customer) throw new Error('Customer / account is required.');
    if (!serials || serials.length === 0) throw new Error('Add at least one serial number.');

    // Block if serial is already in Stock Deployed (dispatched and not returned)
    const deployedSet = new Set(getDeployedSerialRows().map(r => r.serial.toUpperCase()));
    const alreadyDeployed = serials.filter(s => deployedSet.has(s.toUpperCase()));
    if (alreadyDeployed.length > 0) {
      throw new Error(
        `Cannot dispatch — ${alreadyDeployed.length} serial${alreadyDeployed.length > 1 ? 's' : ''} already in Stock Deployed: ` +
        alreadyDeployed.join(', ')
      );
    }

    // Block if serial not in current stock holding
    const avail = getAvailableSerials();
    const notInStock = serials.filter(s => !avail.has(s.toUpperCase()));
    if (notInStock.length > 0) {
      throw new Error('Serials not in Stock Holding: ' + notInStock.join(', '));
    }

    // ── Product mismatch check ──────────────────────────────────────────
    // Each serial has a known product from its first IN movement.
    // Block dispatch if the user is trying to book it out against a different product.
    // NS- serials (no serial number items) are exempt — they share product by quantity.
    const mismatches = serials.filter(s => !s.toUpperCase().startsWith('NS-')).map(s => {
      const knownProduct = getSerialKnownProduct(s);
      // Find what product this serial is currently filed under in stock
      const currentProduct = (() => {
        const map = getInventoryMap();
        for (const v of Object.values(map)) {
          if (v.inStock.has(s)) return v.product;
        }
        return null;
      })();
      if (currentProduct && expectedProduct && currentProduct !== expectedProduct) {
        return { serial: s, knownProduct: currentProduct, requestedProduct: expectedProduct };
      }
      return null;
    }).filter(Boolean);

    if (mismatches.length > 0) {
      const detail = mismatches.map(m => `${m.serial} is ${m.knownProduct}, not ${m.requestedProduct}`).join('; ');
      throw new Error(`Product mismatch — serial numbers belong to a different product: ${detail}`);
    }

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
    const condMap = getSerialConditionMap();
    Object.values(groups).forEach((g, i) => {
      const isRmaTl = g.serials.some(s => ['rma','fail-tl'].includes(condMap[s.toUpperCase()]));
      const rmaTlType = g.serials.some(s => condMap[s.toUpperCase()] === 'fail-tl') ? 'fail-tl' : 'rma';
      DB.addMovement({ id: now + i, type: 'OUT', product: g.product, category: g.category, location: g.location, customer, by: by || '', ref: ref || '', serials: g.serials, date: new Date().toISOString(), ...(isRmaTl ? { isRmaTl: true, rmaTlType } : {}) });
    });
  }

  // ── Stock Out (by product/quantity — no serial numbers) ──────────────
  function stockOutByProduct(opts) {
    const { customer, by, ref, items } = opts;
    if (!customer) throw new Error('Customer / account is required.');
    if (!items || items.length === 0) throw new Error('Select at least one product.');

    const map = getInventoryMap();
    const now = Date.now();
    let i = 0;

    items.forEach(({ product, location, qty }) => {
      const key = product + '||' + location;
      const v   = map[key];
      if (!v) throw new Error(`Product "${product}" not found at ${location}`);
      const available = [...v.inStock];
      if (available.length < qty) throw new Error(`Only ${available.length} unit(s) of "${product}" available at ${location} — requested ${qty}`);

      const slicedSerials = available.slice(0, qty);
      const condMap2 = getSerialConditionMap();
      const isRmaTl2 = slicedSerials.some(s => ['rma','fail-tl'].includes(condMap2[s.toUpperCase()]));
      const rmaTlType2 = slicedSerials.some(s => condMap2[s.toUpperCase()] === 'fail-tl') ? 'fail-tl' : 'rma';
      DB.addMovement({
        id: now + (i++),
        type: 'OUT',
        product, category: v.category, location,
        customer, by: by || '', ref: ref || '',
        serials: slicedSerials,
        qty,
        date: new Date().toISOString(),
        ...(isRmaTl2 ? { isRmaTl: true, rmaTlType: rmaTlType2 } : {}),
      });
    });
  }
  function getLocations() {
    const fromData = [...DB.getData().movements.map(m => m.location), ...DB.getData().shipments.map(s => s.location)].filter(Boolean);
    return [...new Set([...fromData, ...DB.getCustomLocations()])].sort();
  }
  function getSuppliers() {
    const fromData    = [...DB.getData().movements.filter(m => m.supplier).map(m => m.supplier), ...DB.getData().shipments.filter(s => s.supplier).map(s => s.supplier)].filter(Boolean);
    const fromRecords = DB.getSupplierRecords().map(s => s.name).filter(Boolean);
    return [...new Set([...fromData, ...fromRecords, ...DB.getCustomSuppliers()])].sort();
  }
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

  // ── Recall deployed serial back to stock for servicing ─────────────
  // ── Pending Deployment ───────────────────────────────────────────────
  function stagePendingDeployment(opts) {
    const { customer, by, ref, serials } = opts;
    if (!customer) throw new Error('Customer / account is required.');
    if (!serials || serials.length === 0) throw new Error('Add at least one serial number.');

    // Block if already deployed
    const deployedSet = new Set(getDeployedSerialRows().map(r => r.serial.toUpperCase()));
    const alreadyDeployed = serials.filter(s => deployedSet.has(s.toUpperCase()));
    if (alreadyDeployed.length > 0)
      throw new Error('Already in Stock Deployed: ' + alreadyDeployed.join(', '));

    // Block if already pending deployment
    const pendingSerials = new Set(
      DB.getPendingDeployments().flatMap(p => p.serials.map(s => s.toUpperCase()))
    );
    const alreadyPending = serials.filter(s => pendingSerials.has(s.toUpperCase()));
    if (alreadyPending.length > 0)
      throw new Error('Already staged for deployment: ' + alreadyPending.join(', '));

    // Must be in stock
    const avail = getAvailableSerials();
    const notInStock = serials.filter(s => !avail.has(s.toUpperCase()));
    if (notInStock.length > 0)
      throw new Error('Not in Stock Holding: ' + notInStock.join(', '));

    // ── Product mismatch check (same as stockOut) ───────────────────────
    const stageMismatches = serials.filter(s => !s.toUpperCase().startsWith('NS-')).map(s => {
      const map = getInventoryMap();
      let currentProduct = null;
      for (const v of Object.values(map)) { if (v.inStock.has(s)) { currentProduct = v.product; break; } }
      return currentProduct ? { serial: s, currentProduct } : null;
    }).filter(Boolean).filter(({ serial, currentProduct }) => {
      // Check against any product explicitly passed, or against first-ever IN movement
      const knownProduct = getSerialKnownProduct(serial);
      return knownProduct && currentProduct !== knownProduct;
    });
    if (stageMismatches.length > 0) {
      const detail = stageMismatches.map(m => `${m.serial} belongs to ${m.currentProduct}`).join('; ');
      throw new Error(`Product mismatch: ${detail}`);
    }

    // Resolve product/category/location per serial from inventory map
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
      DB.addPendingDeployment({
        id: now + i,
        product: g.product, category: g.category, location: g.location,
        customer, by: by || '', ref: ref || '',
        serials: g.serials,
        stagedAt: new Date().toISOString(),
      });
    });
  }

  function confirmDeployment(pendingId) {
    const pd = DB.getPendingDeployments().find(p => p.id === pendingId);
    if (!pd) throw new Error('Pending deployment not found.');

    // Create the real OUT movement
    DB.addMovement({
      id: Date.now(),
      type: 'OUT',
      product: pd.product, category: pd.category, location: pd.location,
      customer: pd.customer, by: pd.by || '', ref: pd.ref || '',
      serials: pd.serials,
      date: new Date().toISOString(),
    });

    // Remove from pending
    DB.removePendingDeployment(pendingId);
  }

  function getPendingDeploymentSerials() {
    // Returns a Set of serial.toUpperCase() that are staged for deployment
    return new Set(
      DB.getPendingDeployments().flatMap(p => p.serials.map(s => s.toUpperCase()))
    );
  }

  function recallToServicing(serial, location, condition, recalledBy) {
    const s = serial.trim().toUpperCase();
    if (!s)        throw new Error('Serial number is required.');
    if (!location) throw new Error('Location is required.');

    // Must currently be in deployed (OUT) state
    const deployedSet = new Set(getDeployedSerialRows().map(r => r.serial.toUpperCase()));
    if (!deployedSet.has(s)) throw new Error(`Serial "${s}" is not in Stock Deployed.`);

    // Find the original IN movement to get product/category
    const { movements } = DB.getData();
    const origIn = [...movements].reverse().find(m => m.type === 'IN' && m.serials.map(x => x.toUpperCase()).includes(s));
    if (!origIn) throw new Error('Cannot find original stock-in record for this serial.');

    // Preserve original cost
    const cost = DB.getSerialCost(s);

    DB.addMovement({
      id:         Date.now(),
      type:       'IN',
      product:    origIn.product,
      category:   origIn.category,
      location,
      supplier:   'Recalled from deployment',
      receivedBy: recalledBy || '',
      serials:    [s],
      condition:  condition || 'needs-testing',
      used:       true,
      date:       new Date().toISOString(),
    });

    // Re-apply the original serial cost
    if (cost != null) DB.setSerialCost(s, cost);
  }

    DB.onReady(() => refreshProducts());
    return { getInventoryMap, getStockByProduct, getDeployedByProduct, getAllSerialRows, getDeployedSerialRows, getRmaTlDispatchedRows, getTotalLossRows, getAvailableSerials, getLowStockItems, getSerialInfo, getSerialKnownProduct, stockIn, createShipment, receiveShipment, receivePartialShipment, stockOut, stockOutByProduct, stagePendingDeployment, confirmDeployment, getPendingDeploymentSerials, getLocations, getSuppliers, getProducts, getCustomers, getStats, recallToServicing, createOrder, refreshProducts, CATEGORIES, PRODUCTS };

  function createOrder(opts) {
    const { supplier, poNumber, expectedBy, products, taxRate, taxAmount, taxRef } = opts;
    if (!supplier) throw new Error('Manufacturer / Supplier is required.');
    if (!products || !products.length) throw new Error('At least one product is required.');
    products.forEach(p => {
      if (!p.product) throw new Error('Select a product for each row.');
      if (!p.qty || parseInt(p.qty) < 1) throw new Error(`Enter a quantity for "${p.product || 'product'}".`);
    });

    const id = Date.now();
    const finalPO = poNumber || `PO-${new Date().getFullYear()}-${String(id).slice(-5)}`;

    // ── Tax calculation — split proportionally by line value ──────────
    const subtotal = products.reduce((a, p) => a + (parseFloat(p.unitCost)||0) * (parseInt(p.qty)||0), 0);
    // taxAmount overrides taxRate if both provided
    const resolvedTaxAmount = taxAmount != null && taxAmount > 0
      ? parseFloat(taxAmount)
      : (taxRate != null && taxRate > 0 && subtotal > 0 ? subtotal * parseFloat(taxRate) / 100 : 0);
    const resolvedTaxRate = taxRate != null && taxRate > 0 ? parseFloat(taxRate) : null;

    // Split tax across product lines proportionally by line value
    const productsWithTax = products.map(p => {
      const lineValue = (parseFloat(p.unitCost)||0) * (parseInt(p.qty)||0);
      const taxShare  = subtotal > 0 ? (lineValue / subtotal) * resolvedTaxAmount : 0;
      const taxPerUnit = parseInt(p.qty) > 0 ? taxShare / parseInt(p.qty) : 0;
      const landedUnitCost = (parseFloat(p.unitCost)||0) + taxPerUnit;
      return {
        product:       p.product,
        category:      p.category || '',
        qty:           parseInt(p.qty),
        unitCost:      p.unitCost != null ? parseFloat(p.unitCost) : null,
        taxShare:      parseFloat(taxShare.toFixed(4)),
        taxPerUnit:    parseFloat(taxPerUnit.toFixed(4)),
        landedUnitCost: parseFloat(landedUnitCost.toFixed(4)),
      };
    });

    // Lock prices into the PO system — use landed cost (inc. tax) as the locked unit price
    DB.savePO(finalPO, {
      supplier,
      date: new Date().toISOString(),
      lines: productsWithTax.map(p => ({
        product:  p.product,
        unitCost: p.unitCost != null ? p.unitCost : null,
        landedUnitCost: p.landedUnitCost,
      })),
    });

    const order = {
      id,
      supplier,
      poNumber: finalPO,
      expectedBy: expectedBy || '',
      products: productsWithTax,
      status:    'pending',
      createdAt: new Date().toISOString(),
      // Tax summary
      subtotal:        parseFloat(subtotal.toFixed(2)),
      taxAmount:       parseFloat(resolvedTaxAmount.toFixed(2)),
      taxRate:         resolvedTaxRate,
      taxRef:          taxRef || '',
      totalWithTax:    parseFloat((subtotal + resolvedTaxAmount).toFixed(2)),
    };

    DB.addOrder(order);
    return order;
  }
})();

