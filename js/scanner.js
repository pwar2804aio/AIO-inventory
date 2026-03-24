/**
 * scanner.js — Camera barcode scanner using html5-qrcode
 * Most reliable cross-platform mobile barcode library
 */
const Scanner = (() => {
  let _overlay  = null;
  let _onScan   = null;
  let _html5qr  = null;
  let _scanning = false;

  const SCANNER_DIV_ID = 'html5qr-scanner-div';

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async function scan(onResult) {
    if (!isSupported()) {
      alert('Camera not supported on this browser.');
      return;
    }
    _onScan = onResult;
    await _loadLib();
    _showOverlay();
  }

  function _loadLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload  = resolve;
      s.onerror = () => {
        // fallback CDN
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
        s2.onload  = resolve;
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
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
        <div id="${SCANNER_DIV_ID}" style="width:100%;border-radius:var(--r-md);overflow:hidden;"></div>
        <div class="scanner-status" id="scanner-status">Starting camera...</div>
        <div class="scanner-results" id="scanner-results"></div>
        <button class="btn btn-ghost btn-sm scanner-cancel" id="scanner-cancel-btn">Cancel</button>
      </div>`;

    document.body.appendChild(_overlay);
    document.getElementById('scanner-close-btn').addEventListener('click', _close);
    document.getElementById('scanner-cancel-btn').addEventListener('click', _close);
    _overlay.querySelector('.scanner-backdrop').addEventListener('click', _close);

    _startScanner();
  }

  async function _startScanner() {
    const statusEl = document.getElementById('scanner-status');
    try {
      _html5qr = new Html5Qrcode(SCANNER_DIV_ID, { verbose: false });

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.5,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
      };

      // Use back camera on mobile
      await _html5qr.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => { _onDetected(decodedText); },
        () => { /* scan failure — normal, no barcode in frame */ }
      );

      _scanning = true;
      if (statusEl) { statusEl.textContent = 'Point at barcode · hold steady'; statusEl.style.color = 'var(--success-text)'; }

    } catch (err) {
      if (!statusEl) return;
      statusEl.style.color = 'var(--danger-text)';
      statusEl.textContent =
        err.toString().includes('permission') || err.toString().includes('NotAllowed')
          ? '⚠ Camera permission denied — tap Allow and try again'
          : err.toString().includes('NotFound') || err.toString().includes('no camera')
          ? '⚠ No camera found on this device'
          : '⚠ Could not start camera — ' + (err.message || err);
    }
  }

  function _onDetected(value) {
    if (!value) return;
    const serial  = value.trim().toUpperCase();
    const resEl   = document.getElementById('scanner-results');
    const statusEl = document.getElementById('scanner-status');

    if (resEl) resEl.innerHTML = `<div class="scanner-result-badge">${serial}</div>`;
    if (statusEl) { statusEl.textContent = '✓ Got it!'; statusEl.style.color = 'var(--success-text)'; }
    if (navigator.vibrate) navigator.vibrate(80);
    if (_onScan) _onScan(serial);

    // Brief pause then clear result and keep scanning
    setTimeout(() => {
      if (resEl && document.body.contains(resEl)) {
        resEl.innerHTML = '';
        if (statusEl) { statusEl.textContent = 'Point at barcode · hold steady'; statusEl.style.color = 'var(--success-text)'; }
      }
    }, 1500);
  }

  async function _close() {
    if (_html5qr && _scanning) {
      try { await _html5qr.stop(); } catch(e) {}
      _scanning = false;
    }
    _html5qr = null;
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _onScan = null;
  }

  function attachToInput(inputEl, onScan) {
    if (!inputEl || inputEl.dataset.scannerAttached) return;
    inputEl.dataset.scannerAttached = 'true';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'scanner-trigger-btn';
    btn.title     = 'Scan barcode';
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
