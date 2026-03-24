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
  let _data  = { movements: [], thresholds: {}, shipments: [], serialCosts: {} };
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
        _data = { movements: d.movements||[], thresholds: d.thresholds||{}, shipments: d.shipments||[], serialCosts: d.serialCosts||{} };
      } else {
        await setDoc(docRef, _data);
      }

      // Real-time listener — keeps all users in sync
      onSnapshot(docRef, snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        _data = { movements: d.movements||[], thresholds: d.thresholds||{}, shipments: d.shipments||[], serialCosts: d.serialCosts||{} };
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
  function getThreshold(k)       { return _data.thresholds[k] !== undefined ? _data.thresholds[k] : 3; }
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
  function updateSerialCondition(serial, condition, testedBy) {
    const s = serial.toUpperCase();
    _data.movements = _data.movements.map(mv => {
      if (mv.type === 'IN' && mv.serials.some(x => x.toUpperCase() === s)) {
        return {
          ...mv,
          condition: condition,
          testedBy:  testedBy || mv.testedBy || '',
          testedAt:  condition === '' ? '' : (mv.testedAt || new Date().toISOString()),
        };
      }
      return mv;
    });
    _save();
  }
  function exportJSON()          { return JSON.stringify(_data, null, 2); }
  function importJSON(str)       { const p=JSON.parse(str); if(!Array.isArray(p.movements)) throw new Error('Invalid format'); _data={shipments:[],serialCosts:{},...p}; _save(); }

  init();
  return { onReady, getData, save:_save, addMovement, setThreshold, getThreshold, addShipment, updateShipment, removeShipment, setSerialCost, getSerialCost, setProductCost, deleteSerial, renameSerial, updateSerialCondition, exportJSON, importJSON };
})();

let _currentView = 'dashboard';
function _refreshView() {
  try {
    if      (_currentView==='dashboard')  UI.renderDashboard();
    else if (_currentView==='stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    else if (_currentView==='deployed')   { UI.populateDeployedFilters(); UI.renderDeployed(); }
    else if (_currentView==='history')    UI.renderHistory();
    else if (_currentView==='transit')    UI.renderTransitList();
  } catch(e) {}
}
