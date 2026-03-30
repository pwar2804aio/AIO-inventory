/**
 * db.js — AIO Inventory · Firebase Firestore backend
 */
const DB_CONFIG = {
  apiKey:            "AIzaSyCJaWCjiBSYEATT7ytZoK23Dauqgek1M-g",
  authDomain:        "aio-inventory.firebaseapp.com",
  projectId:         "aio-inventory",
  storageBucket:     "aio-inventory.firebasestorage.app",
  messagingSenderId: "168216293932",
  appId:             "1:168216293932:web:68438c3e40e46ffd2f9789"
};

const DB = (() => {
  let _data  = { movements: [], thresholds: {}, shipments: [], serialCosts: {}, serialConditions: {}, customSuppliers: [], customLocations: [], orders: [], suppliers: [], productRecords: [] };
  let _db    = null;
  let _ready = false;
  let _onReadyCallbacks = [];

  async function init() {
    try {
      const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getFirestore, doc, getDoc, setDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      const app = getApps().length ? getApps()[0] : initializeApp(DB_CONFIG);
      _db = getFirestore(app);

      const docRef = doc(_db, 'inventory', 'main');
      const snap   = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        _data = { movements: d.movements||[], thresholds: d.thresholds||{}, shipments: d.shipments||[], serialCosts: d.serialCosts||{}, serialConditions: d.serialConditions||{}, purchaseOrders: d.purchaseOrders||{}, serialPOs: d.serialPOs||{}, customSuppliers: d.customSuppliers||[], customLocations: d.customLocations||[], orders: d.orders||[], suppliers: d.suppliers||[], productRecords: d.productRecords||[] };
      } else {
        await setDoc(docRef, _data);
      }

      // Real-time listener — keeps all users in sync
      onSnapshot(docRef, snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        _data = { movements: d.movements||[], thresholds: d.thresholds||{}, shipments: d.shipments||[], serialCosts: d.serialCosts||{}, serialConditions: d.serialConditions||{}, purchaseOrders: d.purchaseOrders||{}, serialPOs: d.serialPOs||{}, customSuppliers: d.customSuppliers||[], customLocations: d.customLocations||[], orders: d.orders||[], suppliers: d.suppliers||[], productRecords: d.productRecords||[] };
        if (typeof _currentView !== 'undefined') _refreshView();
      });

      _ready = true;
      _onReadyCallbacks.forEach(fn => fn());
    } catch(err) {
      console.error('DB init error:', err);
      _loadLS();
      _ready = true;
      _onReadyCallbacks.forEach(fn => fn());
    }
  }

  function _loadLS() {
    try { const r = localStorage.getItem('aio_inventory_v2'); if (r) { const d=JSON.parse(r); _data={movements:[],thresholds:{},shipments:[],serialCosts:{},...d}; } } catch(e) {}
  }

  async function _save() {
    if (!_db) { localStorage.setItem('aio_inventory_v2', JSON.stringify(_data)); return; }
    try {
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      await setDoc(doc(_db, 'inventory', 'main'), _data);
    } catch(e) { localStorage.setItem('aio_inventory_v2', JSON.stringify(_data)); }
  }

  function onReady(fn)          { if (_ready) fn(); else _onReadyCallbacks.push(fn); }
  function getData()             { return _data; }
  function addMovement(mv)       { _data.movements.push(mv); _save(); }
  function setThreshold(k, v)    { _data.thresholds[k] = v; _save(); }
  function getThreshold(k) {
    if (_data.thresholds[k] !== undefined) return _data.thresholds[k];
    const product = k.split('||')[0];
    const rec = (_data.productRecords || []).find(p => p.name === product);
    if (rec && rec.defaultThreshold != null) return rec.defaultThreshold;
    return 3;
  }
  function addShipment(s)        { _data.shipments.push(s); _save(); }
  function updateShipment(id,u)  { const i=_data.shipments.findIndex(s=>s.id===id); if(i>-1){_data.shipments[i]={..._data.shipments[i],...u};_save();} }
  function removeShipment(id)    { _data.shipments=_data.shipments.filter(s=>s.id!==id); _save(); }
  function setSerialCost(s,c)    { _data.serialCosts[s.toUpperCase()]=c; _save(); }
  function getSerialCost(s)      { return _data.serialCosts[s.toUpperCase()]??null; }
  function setProductCost(name,cost,map) {
    Object.values(map).forEach(v => { if(v.product===name) v.inStock.forEach(s=>{_data.serialCosts[s.toUpperCase()]=cost;}); });
    _save();
  }

  // Delete a serial from all movements (removes it from stock entirely)
  function deleteSerial(serial) {
    const s = serial.toUpperCase();
    _data.movements = _data.movements.map(mv => ({
      ...mv,
      serials: mv.serials.filter(x => x.toUpperCase() !== s)
    })).filter(mv => mv.serials.length > 0);
    delete _data.serialCosts[s];
    _save();
  }

  // Rename a serial across all movements and cost records
  function renameSerial(oldSerial, newSerial) {
    const o = oldSerial.toUpperCase();
    const n = newSerial.toUpperCase();
    _data.movements = _data.movements.map(mv => ({
      ...mv,
      serials: mv.serials.map(s => s.toUpperCase() === o ? n : s)
    }));
    if (_data.serialCosts[o] !== undefined) {
      _data.serialCosts[n] = _data.serialCosts[o];
      delete _data.serialCosts[o];
    }
    _save();
  }
  // Update condition flag on the IN movement for a serial (also records tester)
  // NOTE: the 'used' field is NEVER modified here — it is permanent from receipt
  function updateSerialCondition(serial, condition, testedBy, testedDate, notes) {
    const s = serial.toUpperCase();
    // Per-serial storage — prevents one serial's condition from bleeding across
    // all serials that share the same batch IN movement
    if (!_data.serialConditions) _data.serialConditions = {};
    _data.serialConditions[s] = {
      condition:  condition,
      testedBy:   testedBy  || '',
      testedAt:   testedDate ? (testedDate + 'T00:00:00.000Z') : (condition === '' ? '' : new Date().toISOString()),
      testNotes:  notes !== undefined ? notes : '',
    };
    // Also scrub any movement-level condition for this serial so the fallback
    // in getAllSerialRows can never bleed the old movement condition onto other
    // serials in the same batch
    _data.movements = _data.movements.map(mv => {
      if (mv.type === 'IN' && (mv.condition || '') !== '' && mv.serials.some(x => x.toUpperCase() === s)) {
        return { ...mv, condition: '' };
      }
      return mv;
    });
    _save();
  }
  function getSerialCondition(serial) {
    const s = serial.toUpperCase();
    const sc = _data.serialConditions || {};
    return s in sc ? sc[s] : null; // null = no per-serial override; caller falls back to movement
  }
  function addOrder(order)       { if(!_data.orders) _data.orders=[]; _data.orders.push(order); _save(); }
  function updateOrder(id,u)     { if(!_data.orders) return; const i=_data.orders.findIndex(o=>o.id===id); if(i>-1){_data.orders[i]={..._data.orders[i],...u};_save();} }
  function removeOrder(id)       { if(!_data.orders) return; _data.orders=_data.orders.filter(o=>o.id!==id); _save(); }
  function getOrders()           { return _data.orders||[]; }

  function addSupplier(s)        { if(!_data.suppliers) _data.suppliers=[]; _data.suppliers.push(s); _save(); }
  function updateSupplier(id,u)  { if(!_data.suppliers) return; const i=_data.suppliers.findIndex(s=>s.id===id); if(i>-1){_data.suppliers[i]={..._data.suppliers[i],...u};_save();} }
  function removeSupplier(id)    { if(!_data.suppliers) return; _data.suppliers=_data.suppliers.filter(s=>s.id!==id); _save(); }
  function getSupplierRecords()  { return _data.suppliers||[]; }

  function addProductRecord(r)      { if(!_data.productRecords) _data.productRecords=[]; _data.productRecords.push(r); _save(); }
  function updateProductRecord(id,u){ if(!_data.productRecords) return; const i=_data.productRecords.findIndex(r=>r.id===id); if(i>-1){_data.productRecords[i]={..._data.productRecords[i],...u};_save();} }
  function removeProductRecord(id)  { if(!_data.productRecords) return; _data.productRecords=_data.productRecords.filter(r=>r.id!==id); _save(); }
  function getProductRecords()      { return _data.productRecords||[]; }

  function exportJSON()          { return JSON.stringify(_data, null, 2); }
  function importJSON(str)       { const p=JSON.parse(str); if(!Array.isArray(p.movements)) throw new Error('Invalid format'); _data={shipments:[],serialCosts:{},purchaseOrders:{},...p}; _save(); }

  // ── Purchase Orders ────────────────────────────────────────────────────
  // poNumber -> { poNumber, supplier, date, lines: [{product, unitCost}] }
  function savePO(poNumber, poData) {
    if (!_data.purchaseOrders) _data.purchaseOrders = {};
    _data.purchaseOrders[poNumber] = { ...poData, poNumber };
    _save();
  }
  function getPO(poNumber)   { return (_data.purchaseOrders || {})[poNumber] || null; }
  function getAllPOs()        { return Object.values(_data.purchaseOrders || {}); }
  function getPONumbers()    { return Object.keys(_data.purchaseOrders || {}).sort(); }
  // Get locked unit cost for a product from a specific PO
  function getPOUnitCost(poNumber, product) {
    const po = getPO(poNumber);
    if (!po) return null;
    const line = (po.lines || []).find(l => l.product === product);
    return line ? line.unitCost : null;
  }
  // Store which PO a serial is linked to
  function setSerialPO(serial, poNumber) {
    if (!_data.serialPOs) _data.serialPOs = {};
    _data.serialPOs[serial.toUpperCase()] = poNumber;
    _save();
  }
  function getSerialPO(serial) { return (_data.serialPOs || {})[serial.toUpperCase()] || null; }

  function addCustomSupplier(name) {
    if (!_data.customSuppliers) _data.customSuppliers = [];
    if (!_data.customSuppliers.includes(name)) { _data.customSuppliers.push(name); _save(); }
  }
  function addCustomLocation(name) {
    if (!_data.customLocations) _data.customLocations = [];
    if (!_data.customLocations.includes(name)) { _data.customLocations.push(name); _save(); }
  }
  function getCustomSuppliers() { return _data.customSuppliers || []; }
  function getCustomLocations() { return _data.customLocations || []; }

  init();
  return { onReady, getData, save:_save, addMovement, setThreshold, getThreshold, addShipment, updateShipment, removeShipment, setSerialCost, getSerialCost, setProductCost, deleteSerial, renameSerial, updateSerialCondition, getSerialCondition, savePO, getPO, getAllPOs, getPONumbers, getPOUnitCost, setSerialPO, getSerialPO, addCustomSupplier, addCustomLocation, getCustomSuppliers, getCustomLocations, addOrder, updateOrder, removeOrder, getOrders, addSupplier, updateSupplier, removeSupplier, getSupplierRecords, addProductRecord, updateProductRecord, removeProductRecord, getProductRecords, exportJSON, importJSON };
})();

let _currentView = 'dashboard';
function _refreshView() {
  try {
    if      (_currentView==='dashboard')  UI.renderDashboard();
    else if (_currentView==='stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    else if (_currentView==='deployed')   { UI.populateDeployedFilters(); UI.renderDeployed(); }
    else if (_currentView==='history')    UI.renderHistory();
    else if (_currentView==='transit')    UI.renderTransitList();
    else if (_currentView==='orders')     UI.renderOrderList();
  } catch(e) {}
}
