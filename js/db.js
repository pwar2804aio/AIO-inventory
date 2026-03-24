/**
 * db.js — AIO Inventory · Firebase Firestore backend
 * Replaces localStorage with a shared cloud database.
 * All reads/writes are real-time and shared across all users.
 */

// ── Firebase config ───────────────────────────────────────────────────────
const _FB_CONFIG = {
  apiKey:            "AIzaSyCJaWCjiBSYEATT7ytZoK23Dauqgek1M-g",
  authDomain:        "aio-inventory.firebaseapp.com",
  projectId:         "aio-inventory",
  storageBucket:     "aio-inventory.firebasestorage.app",
  messagingSenderId: "168216293932",
  appId:             "1:168216293932:web:68438c3e40e46ffd2f9789"
};

// ── DB module ─────────────────────────────────────────────────────────────
const DB = (() => {

  // In-memory cache — keeps the app fast (Firestore is source of truth)
  let _data = { movements: [], thresholds: {}, shipments: [], serialCosts: {} };
  let _db   = null;
  let _ready = false;
  let _onReadyCallbacks = [];

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const { initializeApp }    = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getFirestore, doc, getDoc, setDoc, onSnapshot }
                                 = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      const app = initializeApp(_FB_CONFIG);
      _db = getFirestore(app);

      const docRef = doc(_db, 'inventory', 'main');

      // Load initial data
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        _data = {
          movements:   d.movements   || [],
          thresholds:  d.thresholds  || {},
          shipments:   d.shipments   || [],
          serialCosts: d.serialCosts || {},
        };
      } else {
        // First ever run — seed empty doc
        await setDoc(docRef, _data);
      }

      // Real-time listener — syncs changes made by other users
      onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          _data = {
            movements:   d.movements   || [],
            thresholds:  d.thresholds  || {},
            shipments:   d.shipments   || [],
            serialCosts: d.serialCosts || {},
          };
          // Re-render current view if UI is loaded
          if (typeof UI !== 'undefined' && typeof _currentView !== 'undefined') {
            _refreshView();
          }
        }
      });

      _ready = true;
      _onReadyCallbacks.forEach(fn => fn());
      console.log('✅ AIO Inventory connected to Firebase');

    } catch (err) {
      console.error('Firebase init error:', err);
      // Fall back to localStorage if Firebase fails
      _loadFromLocalStorage();
      _ready = true;
      _onReadyCallbacks.forEach(fn => fn());
    }
  }

  function _loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem('aio_inventory_v2');
      if (raw) {
        const d = JSON.parse(raw);
        _data = { movements: [], thresholds: {}, shipments: [], serialCosts: {}, ...d };
      }
    } catch(e) {}
    console.warn('⚠️ Using localStorage fallback');
  }

  // ── Persist to Firestore ─────────────────────────────────────────────────
  async function _save() {
    if (!_db) { localStorage.setItem('aio_inventory_v2', JSON.stringify(_data)); return; }
    try {
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      await setDoc(doc(_db, 'inventory', 'main'), _data);
    } catch (err) {
      console.error('Save error:', err);
      localStorage.setItem('aio_inventory_v2', JSON.stringify(_data));
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function onReady(fn) {
    if (_ready) fn(); else _onReadyCallbacks.push(fn);
  }

  function getData() { return _data; }

  function addMovement(mv) {
    _data.movements.push(mv);
    _save();
  }

  function setThreshold(k, v) {
    _data.thresholds[k] = v;
    _save();
  }

  function getThreshold(k) {
    return _data.thresholds[k] !== undefined ? _data.thresholds[k] : 3;
  }

  function addShipment(s) {
    _data.shipments.push(s);
    _save();
  }

  function updateShipment(id, upd) {
    const i = _data.shipments.findIndex(s => s.id === id);
    if (i > -1) { _data.shipments[i] = { ..._data.shipments[i], ...upd }; _save(); }
  }

  function removeShipment(id) {
    _data.shipments = _data.shipments.filter(s => s.id !== id);
    _save();
  }

  function setSerialCost(serial, cost) {
    _data.serialCosts[serial.toUpperCase()] = cost;
    _save();
  }

  function getSerialCost(serial) {
    return _data.serialCosts[serial.toUpperCase()] ?? null;
  }

  function setProductCost(productName, cost, inventoryMap) {
    Object.values(inventoryMap).forEach(v => {
      if (v.product === productName) {
        v.inStock.forEach(s => { _data.serialCosts[s.toUpperCase()] = cost; });
      }
    });
    _save();
  }

  function exportJSON() { return JSON.stringify(_data, null, 2); }

  function importJSON(str) {
    const p = JSON.parse(str);
    if (!Array.isArray(p.movements)) throw new Error('Invalid format');
    _data = { shipments: [], serialCosts: {}, ...p };
    _save();
  }

  // Start init immediately
  init();

  return {
    onReady, getData, save: _save,
    addMovement, setThreshold, getThreshold,
    addShipment, updateShipment, removeShipment,
    setSerialCost, getSerialCost, setProductCost,
    exportJSON, importJSON,
  };
})();

// Track current view for real-time refresh
let _currentView = 'dashboard';
function _refreshView() {
  try {
    if      (_currentView === 'dashboard')  UI.renderDashboard();
    else if (_currentView === 'stock-list') { UI.populateStockListFilters(); UI.renderStockList(); }
    else if (_currentView === 'deployed')   { UI.populateDeployedFilters(); UI.renderDeployed(); }
    else if (_currentView === 'history')    UI.renderHistory();
    else if (_currentView === 'transit')    UI.renderTransitList();
  } catch(e) {}
}
