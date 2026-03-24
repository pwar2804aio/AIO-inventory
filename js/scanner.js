/**
 * scanner.js — Camera barcode scanner
 * Primary: BarcodeDetector API (iOS 17+, Chrome Android)
 * Fallback: @zxing/library via canvas polling
 */
const Scanner = (() => {
  let _stream    = null;
  let _overlay   = null;
  let _onScan    = null;
  let _detecting = false;
  let _animFrame = null;

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async function scan(onResult) {
    if (!isSupported()) {
      alert('Camera not supported on this browser.');
      return;
    }
    _onScan = onResult;
    _showOverlay();
  }

  // ── Overlay ────────────────────────────────────────────────────────────
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
          <canvas id="scanner-canvas" style="display:none"></canvas>
          <div class="scanner-corners">
            <div class="sc-tl"></div><div class="sc-tr"></div>
            <div class="sc-bl"></div><div class="sc-br"></div>
          </div>
          <div class="scanner-line-wrap"><div class="scanner-line"></div></div>
        </div>
        <div class="scanner-status" id="scanner-status">Starting camera...</div>
        <div class="scanner-hint">Point camera at any barcode or QR code</div>
        <div class="scanner-results" id="scanner-results"></div>
        <button class="btn btn-ghost btn-sm scanner-cancel" id="scanner-cancel-btn">Cancel</button>
      </div>`;
    document.body.appendChild(_overlay);
    document.getElementById('scanner-close-btn').addEventListener('click', _close);
    document.getElementById('scanner-cancel-btn').addEventListener('click', _close);
    _overlay.querySelector('.scanner-backdrop').addEventListener('click', _close);
    _startCamera();
  }

  // ── Camera ─────────────────────────────────────────────────────────────
  async function _startCamera() {
    const status = document.getElementById('scanner-status');
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const video = document.getElementById('scanner-video');
      if (!video) return;
      video.srcObject = _stream;
      await new Promise(r => { video.onloadedmetadata = r; });
      await video.play();
      status.textContent = 'Scanning...';
      status.style.color = 'var(--success-text)';
      _detecting = true;

      // Choose detection method
      if ('BarcodeDetector' in window) {
        _detectWithBarcodeDetector(video);
      } else {
        status.textContent = 'Loading scanner...';
        await _loadZXing();
        if (!_detecting) return;
        status.textContent = 'Scanning...';
        _detectWithZXing(video);
      }
    } catch(err) {
      status.style.color = 'var(--danger-text)';
      status.textContent =
        err.name === 'NotAllowedError' ? '⚠ Camera permission denied — tap Allow and try again' :
        err.name === 'NotFoundError'   ? '⚠ No camera found' :
        '⚠ Camera error: ' + err.message;
    }
  }

  // ── BarcodeDetector (native, fast) ─────────────────────────────────────
  async function _detectWithBarcodeDetector(video) {
    let supported = ['code_128','code_39','ean_13','ean_8','upc_a','upc_e','qr_code','data_matrix','pdf417','codabar','itf'];
    try {
      supported = await BarcodeDetector.getSupportedFormats();
    } catch(e) {}
    const detector = new BarcodeDetector({ formats: supported });

    const tick = async () => {
      if (!_detecting) return;
      if (video.readyState >= 2) {
        try {
          const results = await detector.detect(video);
          if (results.length > 0) { _onDetected(results[0].rawValue); return; }
        } catch(e) {}
      }
      _animFrame = requestAnimationFrame(tick);
    };
    _animFrame = requestAnimationFrame(tick);
  }

  // ── ZXing canvas polling fallback ──────────────────────────────────────
  function _detectWithZXing(video) {
    const canvas = document.getElementById('scanner-canvas');
    const ctx    = canvas.getContext('2d');
    // Use ZXing library — @zxing/library UMD exposes window.ZXing
    const hints  = new Map();
    hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new window.ZXing.MultiFormatReader();
    reader.setHints(hints);

    const tick = () => {
      if (!_detecting) return;
      if (video.readyState < 2 || !video.videoWidth) { setTimeout(tick, 100); return; }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const luminance = new window.ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
        const binary    = new window.ZXing.HybridBinarizer(luminance);
        const bitmap    = new window.ZXing.BinaryBitmap(binary);
        const result    = reader.decode(bitmap);
        if (result) { _onDetected(result.getText()); return; }
      } catch(e) {
        // NotFoundException is normal — no barcode in frame yet
      }
      if (_detecting) setTimeout(tick, 150);
    };
    tick();
  }

  // ── Load ZXing library ─────────────────────────────────────────────────
  function _loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      // @zxing/library UMD — exposes window.ZXing with MultiFormatReader, RGBLuminanceSource etc.
      s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
      s.onload  = resolve;
      s.onerror = resolve; // still try even if load fails
      document.head.appendChild(s);
    });
  }

  // ── Result ─────────────────────────────────────────────────────────────
  function _onDetected(value) {
    if (!value || !_detecting) return;
    _detecting = false;
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

    const serial = value.trim().toUpperCase();
    const resEl  = document.getElementById('scanner-results');
    const staEl  = document.getElementById('scanner-status');
    if (resEl) resEl.innerHTML = `<div class="scanner-result-badge">${serial}</div>`;
    if (staEl) { staEl.textContent = '✓ Got it!'; staEl.style.color = 'var(--success-text)'; }
    if (navigator.vibrate) navigator.vibrate(80);
    if (_onScan) _onScan(serial);

    // Resume after brief pause
    setTimeout(() => {
      if (!_overlay || !document.body.contains(_overlay)) return;
      const video = document.getElementById('scanner-video');
      if (!video) return;
      if (resEl) resEl.innerHTML = '';
      if (staEl) { staEl.textContent = 'Scanning...'; staEl.style.color = 'var(--success-text)'; }
      _detecting = true;
      if ('BarcodeDetector' in window) _detectWithBarcodeDetector(video);
      else _detectWithZXing(video);
    }, 1800);
  }

  // ── Close ──────────────────────────────────────────────────────────────
  function _close() {
    _detecting = false;
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    if (_stream)  { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _onScan = null;
  }

  // ── Attach button to input ─────────────────────────────────────────────
  function attachToInput(inputEl, onScan) {
    if (!inputEl || inputEl.dataset.scannerAttached) return;
    inputEl.dataset.scannerAttached = 'true';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scanner-trigger-btn';
    btn.title = 'Scan barcode';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
      <rect x="7" y="7" width="3" height="10" rx="0.5"/><rect x="11" y="7" width="1.5" height="10" rx="0.5"/><rect x="14" y="7" width="3" height="10" rx="0.5"/>
    </svg>`;
    btn.addEventListener('click', e => { e.preventDefault(); scan(onScan); });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex:1;';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    wrap.appendChild(btn);
  }

  return { scan, attachToInput, isSupported };
})();
