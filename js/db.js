/**
 * db.js — AIO Inventory local storage layer
 * v2 adds: shipments (in-transit), serialCosts map
 */
const DB_KEY = 'aio_inventory_v2';

const DB = (() => {
  function _load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('DB load error:', e); }
    return { movements: [], thresholds: {}, shipments: [], serialCosts: {} };
  }
  function _save(d) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch (e) { console.error('DB save error:', e); }
  }

  let _data = _load();
  // Migrate old data missing new keys
  if (!_data.shipments)   _data.shipments   = [];
  if (!_data.serialCosts) _data.serialCosts  = {};

  return {
    getData()               { return _data; },
    save()                  { _save(_data); },
    addMovement(mv)         { _data.movements.push(mv); _save(_data); },
    setThreshold(k, v)      { _data.thresholds[k] = v; _save(_data); },
    getThreshold(k)         { return _data.thresholds[k] !== undefined ? _data.thresholds[k] : 3; },
    // Shipments (in-transit)
    addShipment(s)          { _data.shipments.push(s); _save(_data); },
    updateShipment(id, upd) {
      const i = _data.shipments.findIndex(s => s.id === id);
      if (i > -1) { _data.shipments[i] = { ..._data.shipments[i], ...upd }; _save(_data); }
    },
    removeShipment(id)      { _data.shipments = _data.shipments.filter(s => s.id !== id); _save(_data); },
    // Serial costs: { [serial]: cost }
    setSerialCost(serial, cost) { _data.serialCosts[serial.toUpperCase()] = cost; _save(_data); },
    getSerialCost(serial)       { return _data.serialCosts[serial.toUpperCase()] ?? null; },
    exportJSON()            { return JSON.stringify(_data, null, 2); },
    importJSON(str)         {
      const p = JSON.parse(str);
      if (!Array.isArray(p.movements)) throw new Error('Invalid format');
      _data = { shipments: [], serialCosts: {}, ...p }; _save(_data);
    },
  };
})();
