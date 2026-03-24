/**
 * scanner.js — Camera barcode scanner for serial number inputs
 * Uses BarcodeDetector API where available, falls back to ZXing
 */

const Scanner = (() => {

  let _stream = null;
  let _overlay = null;
  let _onScan = null;
  let _detecting = false;

  // ── Check browser support ─────────────────────────────────────────────
  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // ── Main scan function ────────────────────────────────────────────────
  async function scan(onResult) {
    if (!isSupported()) {
      alert('Camera scanning is not supported on this browser. Please type or paste serial numbers manually.');
      return;
    }
    _onScan = onResult;
    _showOverlay();
  }

  // ── Camera overlay UI ─────────────────────────────────────────────────
  function _showOverlay() {
    _overlay = document.createElement('div');
    _overlay.id = 'scanner-overlay';
    _overlay.innerHTML = `
      <div class="scanner-backdrop"></div>
      <div class="scanner-modal">
        <div class="scanner-header">
          <span class="scanner-title">Scan serial number</span>
          <button class="scanner-close" id="scanner-close-btn">✕</button>
        </div>
        <div class="scanner-viewport">
          <video id="scanner-video" autoplay playsinline muted></video>
          <div class="scanner-crosshair">
            <div class="scanner-line"></div>
          </div>
          <canvas id="scanner-canvas" style="display:none;"></canvas>
        </div>
        <div class="scanner-status" id="scanner-status">Starting camera...</div>
        <div class="scanner-hint">Point your camera at a barcode or QR code</div>
        <div class="scanner-results" id="scanner-results"></div>
        <div class="scanner-actions">
          <button class="btn btn-ghost btn-sm" id="scanner-manual-btn">Enter manually instead</button>
        </div>
      </div>`;

    document.body.appendChild(_overlay);

    document.getElementById('scanner-close-btn').addEventListener('click', _close);
    document.getElementById('scanner-manual-btn').addEventListener('click', _close);
    _overlay.querySelector('.scanner-backdrop').addEventListener('click', _close);

    _startCamera();
  }

  async function _startCamera() {
    const status = document.getElementById('scanner-status');
    try {
      // Request back camera on mobile, any camera on desktop
      _stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        }
      });

      const video = document.getElementById('scanner-video');
      if (!video) return;
      video.srcObject = _stream;
      await video.play();

      status.textContent = 'Scanning...';
      status.style.color = 'var(--success-text)';
      _detecting = true;
      _detectLoop();

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        status.textContent = '⚠ Camera permission denied. Please allow camera access and try again.';
      } else if (err.name === 'NotFoundError') {
        status.textContent = '⚠ No camera found on this device.';
      } else {
        status.textContent = '⚠ Could not start camera: ' + err.message;
      }
      status.style.color = 'var(--danger-text)';
    }
  }

  // ── Detection loop ────────────────────────────────────────────────────
  async function _detectLoop() {
    const video  = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
    if (!video || !canvas || !_detecting) return;

    // Try BarcodeDetector first (Chrome 83+, Safari 17+)
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417', 'codabar', 'itf']
      });

      const detect = async () => {
        if (!_detecting || !video.readyState || video.readyState < 2) {
          if (_detecting) requestAnimationFrame(detect);
          return;
        }
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            _onDetected(barcodes[0].rawValue);
            return;
          }
        } catch(e) {}
        if (_detecting) requestAnimationFrame(detect);
      };
      detect();

    } else {
      // Fallback: use canvas + ZXing-js from CDN
      await _loadZXing();
      const ctx = canvas.getContext('2d');

      const decode = async () => {
        if (!_detecting || !video.readyState || video.readyState < 2) {
          if (_detecting) setTimeout(decode, 150);
          return;
        }
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        try {
          const reader = new window.ZXing.BrowserMultiFormatReader();
          const result = await reader.decodeFromImageElement(canvas);
          if (result) { _onDetected(result.getText()); return; }
        } catch(e) {}
        if (_detecting) setTimeout(decode, 150);
      };
      decode();
    }
  }

  async function _loadZXing() {
    if (window.ZXing) return;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.1/umd/index.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Result handler ────────────────────────────────────────────────────
  function _onDetected(value) {
    if (!value || !_detecting) return;
    const serial = value.trim().toUpperCase();

    // Flash result on screen
    const resultsEl = document.getElementById('scanner-results');
    const statusEl  = document.getElementById('scanner-status');
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="scanner-result-badge">${serial}</div>`;
    }
    if (statusEl) {
      statusEl.textContent = '✓ Scanned!';
      statusEl.style.color = 'var(--success-text)';
    }

    // Vibrate on mobile if supported
    if (navigator.vibrate) navigator.vibrate(100);

    // Call the callback with the result
    if (_onScan) _onScan(serial);

    // Pause briefly then keep scanning for more
    _detecting = false;
    setTimeout(() => {
      if (_overlay && document.getElementById('scanner-overlay')) {
        _detecting = true;
        if (resultsEl) resultsEl.innerHTML = '';
        if (statusEl) { statusEl.textContent = 'Scanning...'; statusEl.style.color = 'var(--success-text)'; }
        _detectLoop();
      }
    }, 1500);
  }

  // ── Close ─────────────────────────────────────────────────────────────
  function _close() {
    _detecting = false;
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _onScan = null;
  }

  // ── Inject scan button next to a serial input ─────────────────────────
  function attachToInput(inputEl, onScan) {
    if (!inputEl || inputEl.dataset.scannerAttached) return;
    inputEl.dataset.scannerAttached = 'true';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scanner-trigger-btn';
    btn.title = 'Scan barcode';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="7" width="3" height="10"/><rect x="7" y="5" width="1" height="14"/>
      <rect x="9" y="7" width="2" height="10"/><rect x="12" y="5" width="1" height="14"/>
      <rect x="14" y="7" width="3" height="10"/><rect x="18" y="5" width="3" height="14"/>
    </svg>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      scan((serial) => {
        if (onScan) onScan(serial);
      });
    });

    // Wrap input + button in a flex container
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    wrap.appendChild(btn);
  }

  return { scan, attachToInput, isSupported };
})();
