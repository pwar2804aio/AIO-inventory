/**
 * scanner.js — Camera barcode scanner
 * Robust cross-platform implementation for iOS Safari + Android Chrome
 */
const Scanner = (() => {
  let _stream    = null;
  let _overlay   = null;
  let _onScan    = null;
  let _active    = false;
  let _rafId     = null;
  let _detector  = null;
  let _canvas    = null;
  let _ctx       = null;

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async function scan(onResult) {
    if (!isSupported()) {
      alert('Camera not supported on this browser. Please type serial numbers manually.');
      return;
    }
    _onScan = onResult;
    _showOverlay();
  }

  function _showOverlay() {
    _overlay = document.createElement('div');
    _overlay.id = 'scanner-overlay';
    _overlay.innerHTML = `
      <div class="scanner-backdrop"></div>
      <div class="scanner-modal">
        <div class="scanner-header">
          <span class="scanner-title">Scan barcode</span>
          <button class="scanner-close" id="scanner-close-btn">✕</button>
        </div>
        <div class="scanner-viewport">
          <video id="scanner-video" autoplay playsinline muted></video>
          <div class="scanner-corners">
            <div class="sc-tl"></div><div class="sc-tr"></div>
            <div class="sc-bl"></div><div class="sc-br"></div>
          </div>
          <div class="scanner-line-wrap"><div class="scanner-line"></div></div>
        </div>
        <div class="scanner-status" id="scanner-status">Starting camera...</div>
        <div class="scanner-hint">Hold steady · point at barcode or QR code</div>
        <div class="scanner-results" id="scanner-results"></div>
        <button class="btn btn-ghost btn-sm scanner-cancel" id="scanner-cancel-btn">Cancel</button>
      </div>`;
    document.body.appendChild(_overlay);
    document.getElementById('scanner-close-btn').addEventListener('click', _close);
    document.getElementById('scanner-cancel-btn').addEventListener('click', _close);
    _overlay.querySelector('.scanner-backdrop').addEventListener('click', _close);

    // Offscreen canvas for ZXing fallback
    _canvas = document.createElement('canvas');
    _ctx    = _canvas.getContext('2d', { willReadFrequently: true });

    _startCamera();
  }

  async function _startCamera() {
    const statusEl = document.getElementById('scanner-status');
    try {
      // On iOS, exact facingMode can cause failure — use ideal
      _stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        }
      });

      const video = document.getElementById('scanner-video');
      if (!video) { _close(); return; }

      video.srcObject = _stream;

      // iOS requires explicit play() after setting srcObject
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(resolve, 3000); // failsafe
      });

      try { await video.play(); } catch(e) { /* already playing */ }

      // Wait for first frame
      await new Promise(resolve => {
        const check = () => {
          if (video.readyState >= 3 && video.videoWidth > 0) resolve();
          else setTimeout(check, 100);
        };
        check();
      });

      statusEl.textContent = 'Scanning...';
      statusEl.style.color = 'var(--success-text)';
      _active = true;

      // Prefer BarcodeDetector (native, fast, works on iOS 17+, Android Chrome)
      if ('BarcodeDetector' in window) {
        _startBarcodeDetector(video);
      } else {
        statusEl.textContent = 'Loading scanner...';
        await _loadZXing();
        if (!_active) return;
        statusEl.textContent = 'Scanning...';
        _startZXing(video);
      }

    } catch (err) {
      if (!statusEl) return;
      statusEl.style.color = 'var(--danger-text)';
      if (err.name === 'NotAllowedError') {
        statusEl.textContent = '⚠ Camera access denied — tap Allow and try again';
      } else if (err.name === 'NotFoundError') {
        statusEl.textContent = '⚠ No camera found';
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        statusEl.textContent = '⚠ Camera in use by another app — close it and retry';
      } else {
        statusEl.textContent = '⚠ ' + (err.message || 'Camera error');
      }
    }
  }

  // ── BarcodeDetector (iOS 17+, Chrome Android) ──────────────────────────
  async function _startBarcodeDetector(video) {
    let formats;
    try { formats = await BarcodeDetector.getSupportedFormats(); }
    catch(e) { formats = ['code_128','code_39','ean_13','ean_8','upc_a','upc_e','qr_code','data_matrix','pdf417','codabar','itf']; }

    _detector = new BarcodeDetector({ formats });

    const tick = async () => {
      if (!_active) return;
      const video = document.getElementById('scanner-video');
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        _rafId = requestAnimationFrame(tick);
        return;
      }
      try {
        const results = await _detector.detect(video);
        if (results && results.length > 0) {
          _onDetected(results[0].rawValue);
          return; // stop loop — _onDetected will restart after pause
        }
      } catch(e) { /* no barcode in frame — normal */ }
      _rafId = requestAnimationFrame(tick);
    };
    _rafId = requestAnimationFrame(tick);
  }

  // ── ZXing canvas fallback ──────────────────────────────────────────────
  async function _loadZXing() {
    if (window.ZXing && window.ZXing.MultiFormatReader) return;
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
      s.onload = resolve;
      s.onerror = resolve; // resolve even on error so we don't hang
      document.head.appendChild(s);
    });
  }

  function _startZXing(video) {
    if (!window.ZXing || !window.ZXing.MultiFormatReader) {
      const s = document.getElementById('scanner-status');
      if (s) { s.textContent = '⚠ Scanner unavailable — type serials manually'; s.style.color = 'var(--danger-text)'; }
      return;
    }

    const hints = new Map();
    hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new window.ZXing.MultiFormatReader();
    reader.setHints(hints);

    const tick = () => {
      if (!_active) return;
      const v = document.getElementById('scanner-video');
      if (!v || v.readyState < 2 || !v.videoWidth) { setTimeout(tick, 150); return; }

      _canvas.width  = v.videoWidth;
      _canvas.height = v.videoHeight;
      _ctx.drawImage(v, 0, 0);

      try {
        const imgData    = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
        const luminance  = new window.ZXing.RGBLuminanceSource(imgData.data, _canvas.width, _canvas.height);
        const binary     = new window.ZXing.HybridBinarizer(luminance);
        const bitmap     = new window.ZXing.BinaryBitmap(binary);
        const result     = reader.decode(bitmap);
        if (result) { _onDetected(result.getText()); return; }
      } catch(e) { /* NotFoundException — no barcode yet */ }

      setTimeout(tick, 150);
    };
    tick();
  }

  // ── Result ─────────────────────────────────────────────────────────────
  function _onDetected(value) {
    if (!value || !_active) return;
    _active = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

    const serial = value.trim().toUpperCase();
    const resEl = document.getElementById('scanner-results');
    const staEl = document.getElementById('scanner-status');
    if (resEl) resEl.innerHTML = `<div class="scanner-result-badge">${serial}</div>`;
    if (staEl) { staEl.textContent = '✓ Got it!'; staEl.style.color = 'var(--success-text)'; }
    if (navigator.vibrate) navigator.vibrate(80);
    if (_onScan) _onScan(serial);

    // Resume scanning after short pause
    setTimeout(() => {
      if (!_overlay || !document.body.contains(_overlay)) return;
      const video = document.getElementById('scanner-video');
      if (!video) return;
      if (resEl) resEl.innerHTML = '';
      if (staEl) { staEl.textContent = 'Scanning...'; staEl.style.color = 'var(--success-text)'; }
      _active = true;
      if (_detector) _startBarcodeDetector(video);
      else _startZXing(video);
    }, 1500);
  }

  // ── Close ──────────────────────────────────────────────────────────────
  function _close() {
    _active = false;
    if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if (_overlay){ _overlay.remove(); _overlay = null; }
    _detector = null;
    _onScan   = null;
  }

  // ── Attach scan button to an input ────────────────────────────────────
  function attachToInput(inputEl, onScan) {
    if (!inputEl || inputEl.dataset.scannerAttached) return;
    inputEl.dataset.scannerAttached = 'true';

    const btn = document.createElement('button');
    btn.type  = 'button';
    btn.className = 'scanner-trigger-btn';
    btn.title = 'Scan barcode';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
      <rect x="7" y="7" width="3" height="10" rx="0.5"/>
      <rect x="11.5" y="7" width="1.5" height="10" rx="0.5"/>
      <rect x="14.5" y="7" width="2.5" height="10" rx="0.5"/>
    </svg>`;
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); scan(onScan); });

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;width:100%;';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    wrap.appendChild(btn);
  }

  return { scan, attachToInput, isSupported };
})();
