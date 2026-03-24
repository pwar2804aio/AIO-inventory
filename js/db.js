/**
 * db.js — AIO Inventory local storage layer
 */
const DB_KEY = 'aio_inventory_v1';

const DB = (() => {
  function _load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('DB load error:', e); }
    return { movements: [], thresholds: {} };
  }
  function _save(data) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (e) { console.error('DB save error:', e); }
  }

  let _data = _load();

  return {
    getData()            { return _data; },
    save()               { _save(_data); },
    addMovement(mv)      { _data.movements.push(mv); _save(_data); },
    setThreshold(k, v)   { _data.thresholds[k] = v; _save(_data); },
    getThreshold(k)      { return _data.thresholds[k] !== undefined ? _data.thresholds[k] : 3; },
    exportJSON()         { return JSON.stringify(_data, null, 2); },
    importJSON(str)      {
      const p = JSON.parse(str);
      if (!Array.isArray(p.movements)) throw new Error('Invalid format');
      _data = p; _save(_data);
    },
  };
})();
