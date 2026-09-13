(() => {
  const root = document.querySelector('[data-admin-notification]');
  const bookingsRoot = document.querySelector('[data-admin-bookings]');
  // Bookings page owns the full module; other admin pages use admin-notifications.js.
  if (!bookingsRoot || !root) return;

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value || '';
  const bell = root.querySelector('[data-notification-toggle]');
  const badge = root.querySelector('[data-notification-badge]');
  const panel = root.querySelector('[data-notification-panel]');
  const notificationItems = root.querySelector('[data-notification-items]');
  const soundButton = root.querySelector('[data-notification-sound]');
  const clearButton = root.querySelector('[data-notification-clear]');
  const bookingList = bookingsRoot.querySelector('[data-bookings-list]');
  const bookingMessage = bookingsRoot.querySelector('[data-bookings-message]');
  const pageLabel = bookingsRoot.querySelector('[data-bookings-page]');
  const prevButton = bookingsRoot.querySelector('[data-bookings-prev]');
  const nextButton = bookingsRoot.querySelector('[data-bookings-next]');
  const searchInput = bookingsRoot.querySelector('[data-booking-search]');
  const tablePanel = bookingsRoot.querySelector('[data-booking-table-panel]');
  const calendarPanel = bookingsRoot.querySelector('[data-booking-calendar-panel]');
  const calendarElement = bookingsRoot.querySelector('[data-reservation-calendar]');
  const calendarFallback = bookingsRoot.querySelector('[data-calendar-fallback]');
  const calendarDayModal = document.querySelector('[data-calendar-day-modal]');
  const calendarDayTitle = calendarDayModal?.querySelector('[data-calendar-day-title]');
  const calendarDayStayCount = calendarDayModal?.querySelector('[data-calendar-day-stay-count]');
  const calendarDayOutCount = calendarDayModal?.querySelector('[data-calendar-day-out-count]');
  const calendarDayOccupied = calendarDayModal?.querySelector('[data-calendar-day-occupied]');
  const calendarDayReserved = calendarDayModal?.querySelector('[data-calendar-day-reserved]');
  const calendarDayAvailable = calendarDayModal?.querySelector('[data-calendar-day-available]');
  const calendarDayOccupancy = calendarDayModal?.querySelector('[data-calendar-day-occupancy]');
  const calendarDayOccupancyMeter = calendarDayModal?.querySelector('[data-calendar-day-occupancy-meter]');
  const calendarDayOccupancyOccupiedFill = calendarDayModal?.querySelector('[data-calendar-day-occupancy-occupied-fill]');
  const calendarDayOccupancyReservedFill = calendarDayModal?.querySelector('[data-calendar-day-occupancy-reserved-fill]');
  const calendarDayOccupancyHint = calendarDayModal?.querySelector('[data-calendar-day-occupancy-hint]');
  const calendarDayTypes = calendarDayModal?.querySelector('[data-calendar-day-types]');
  const calendarDayFind = calendarDayModal?.querySelector('[data-calendar-day-find]');
  const calendarDayFilter = calendarDayModal?.querySelector('[data-calendar-day-filter]');
  const calendarDayOccupiedHeadingCount = calendarDayModal?.querySelector('[data-calendar-day-occupied-heading-count]');
  const calendarDayReservedHeadingCount = calendarDayModal?.querySelector('[data-calendar-day-reserved-heading-count]');
  const calendarDayOutHeadingCount = calendarDayModal?.querySelector('[data-calendar-day-out-heading-count]');
  const calendarDayEmpty = calendarDayModal?.querySelector('[data-calendar-day-empty]');
  const calendarDayOccupiedBlock = calendarDayModal?.querySelector('[data-calendar-day-occupied-block]');
  const calendarDayReservedBlock = calendarDayModal?.querySelector('[data-calendar-day-reserved-block]');
  const calendarDayOutBlock = calendarDayModal?.querySelector('[data-calendar-day-out-block]');
  const calendarDayOccupiedList = calendarDayModal?.querySelector('[data-calendar-day-occupied-list]');
  const calendarDayReservedList = calendarDayModal?.querySelector('[data-calendar-day-reserved-list]');
  const calendarDayOutList = calendarDayModal?.querySelector('[data-calendar-day-out-list]');
  const paymentViewModal = document.querySelector('[data-payment-view-modal]');
  const paymentAddModal = document.querySelector('[data-payment-add-modal]');
  const paymentViewList = paymentViewModal?.querySelector('[data-payment-view-list]');
  const paymentViewSummary = paymentViewModal?.querySelector('[data-payment-view-summary]');
  const paymentViewAddBtn = paymentViewModal?.querySelector('[data-payment-view-add]');
  const arrivalsPanel = bookingsRoot.querySelector('[data-arrivals-panel]');
  const arrivalsList = bookingsRoot.querySelector('[data-arrivals-list]');
  const pendingCallsPanel = bookingsRoot.querySelector('[data-pending-calls-panel]');
  const pendingCallsList = bookingsRoot.querySelector('[data-pending-calls-list]');
  const checkoutsPanel = bookingsRoot.querySelector('[data-checkouts-panel]');
  const checkoutsList = bookingsRoot.querySelector('[data-checkouts-list]');
  const daytimeFlowOpenButton = document.querySelector('[data-daytime-flow-open]');
  const daytimeFlowPanel = bookingsRoot.querySelector('[data-daytime-flow-panel]');
  const daytimeFlowToolbar = bookingsRoot.querySelector('[data-daytime-flow-toolbar]');
  const daytimeArrivalsList = bookingsRoot.querySelector('[data-daytime-arrivals-list]');
  const daytimeCheckoutsList = bookingsRoot.querySelector('[data-daytime-checkouts-list]');
  const daytimeArrivalsTitle = bookingsRoot.querySelector('[data-daytime-arrivals-title]');
  const daytimeCheckoutsTitle = bookingsRoot.querySelector('[data-daytime-checkouts-title]');
  const detailModal = document.querySelector('[data-booking-modal]');
  const detailBody = detailModal?.querySelector('[data-booking-detail]');
  const detailActions = detailModal?.querySelector('[data-booking-detail-actions]');
  const flushButton = bookingsRoot.querySelector('[data-history-flush]');
  const flushLogPanel = bookingsRoot.querySelector('[data-history-flush-log]');
  const flushLogList = bookingsRoot.querySelector('[data-history-flush-log-list]');
  const flushLogToggle = bookingsRoot.querySelector('[data-history-flush-toggle]');
  const flushLogBody = bookingsRoot.querySelector('[data-history-flush-body]');
  const flushLogCount = bookingsRoot.querySelector('[data-history-flush-count]');
  const flushModal = document.querySelector('[data-history-flush-modal]');
  const flushByInput = flushModal?.querySelector('[data-history-flush-by]');
  const flushConfirmButton = flushModal?.querySelector('[data-history-flush-confirm]');
  const flushDetailModal = document.querySelector('[data-history-flush-detail-modal]');
  const flushDetailBody = flushDetailModal?.querySelector('[data-flush-detail-body]');
  const flushDetailFile = flushDetailModal?.querySelector('[data-flush-detail-file]');
  const walkInOpenButton = bookingsRoot.querySelector('[data-walkin-open]');
  let flushLogsCache = [];
  let isLeavingBookingsPage = false;

  const scriptLoadPromises = new Map();

  function loadScriptOnce(src) {
    if (!src) return Promise.reject(new Error('Missing script src'));
    if (scriptLoadPromises.has(src)) return scriptLoadPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lazy-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.lazySrc = src;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
    scriptLoadPromises.set(src, promise);
    return promise;
  }

  async function ensureFullCalendarLoaded() {
    if (window.FullCalendar?.Calendar) return true;
    const assets = window.__adminBookingsAssets?.fullCalendar || [
      '/lib/fullcalendar/core.min.js',
      '/lib/fullcalendar/daygrid.min.js',
      '/lib/fullcalendar/list.min.js',
    ];
    for (const src of assets) {
      await loadScriptOnce(src);
    }
    return Boolean(window.FullCalendar?.Calendar);
  }

  async function ensureTesseractLoaded() {
    if (typeof Tesseract !== 'undefined') return;
    const src = window.__adminBookingsAssets?.tesseract
      || 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    await loadScriptOnce(src);
    if (typeof Tesseract === 'undefined') {
      throw new Error('Local OCR library failed to load. Enter details manually.');
    }
  }
  let filter = '';
  let search = '';
  let history = false;
  let page = 1;
  let totalPages = 1;
  let paymentBookingContext = null;
  let paymentPriceContext = {
    stayTotal: 0,
    amountPaid: 0,
    balanceDue: 0,
    amountDueNow: 0,
  };
  let paymentOcrObjectUrl = null;
  let paymentOcrBusy = false;
  let paymentOcrNeedsApply = false;
  let paymentOcrOriginalFile = null;
  let paymentOcrScannerFilterEnabled = false;
  /** When true, re-run OCR after the current pass finishes (scanner filter toggled mid-run). */
  let paymentOcrRerunAfterBusy = false;
  /** null = unknown, true/false after first Azure OCR probe. */
  let azureOcrConfigured = null;
  let paymentCameraStream = null;
  let paymentCameraFacingMode = 'environment';
  const paymentCameraModal = document.querySelector('[data-payment-camera-modal]');
  const paymentCameraVideo = paymentCameraModal?.querySelector('[data-payment-camera-video]');
  const paymentCameraCanvas = paymentCameraModal?.querySelector('[data-payment-camera-canvas]');
  let paymentCameraAutoTimer = 0;
  let paymentCameraScanBusy = false;
  let paymentCameraAutoCaptureLock = false;
  let paymentCameraScanWorker = null;
  let paymentCameraGoodHits = 0;
  let paymentCameraLastGoodRef = '';
  let paymentCameraOcrCanvas = null;
  const paymentCameraGuideFrame = paymentCameraModal?.querySelector('[data-payment-camera-guide-frame]');
  const paymentCameraGuideLabel = paymentCameraModal?.querySelector('[data-payment-camera-guide-label]');
  let reservationCalendar = null;
  let calendarStayCache = [];
  const calendarStayingByDay = new Map();
  const calendarCheckoutByDay = new Map();
  const calendarOccupancyByDay = new Map();
  let calendarDayLastFocus = null;
  let selectedBooking = null;
  /** When set to a booking id, reception flow is on Extras (incidental / snack) after Fees checkout CTA. */
  let receptionExtrasStageBookingId = null;
  let searchTimer = null;
  let selectedFromUrlHandled = false;
  let pendingScrollBookingId = null;
  let arrivalsFromUrlHandled = false;
  let pendingCallsFromUrlHandled = false;
  let checkoutsFromUrlHandled = false;
  let daytimeFlowLocalDateIso = '';
  let pollTimer = null;
  let audioContext = null;
  let audioUnlocked = false;
  let soundEnabled = localStorage.getItem('moriBookingSound') !== 'off';
  const DAYTIME_CALL_STATE_KEY = 'moriDaytimeCallState:v1';

  function readDaytimeCallState() {
    try {
      const raw = localStorage.getItem(DAYTIME_CALL_STATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeDaytimeCallState(state) {
    try {
      localStorage.setItem(DAYTIME_CALL_STATE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures (private mode/full quota).
    }
  }

  let daytimeCallState = readDaytimeCallState();

  function setSoundLabel() {
    if (!soundButton) return;
    soundButton.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
  }

  function unlockAudio() {
    if (audioUnlocked || !soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    audioContext.resume().then(() => {
      audioUnlocked = audioContext.state === 'running';
    }).catch(() => {});
  }

  function playChime() {
    if (!soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();

    const emit = () => {
      if (!audioContext) return;
      const now = audioContext.currentTime;
      [660, 880].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.09 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + index * 0.09);
        oscillator.stop(now + index * 0.09 + 0.24);
      });
    };

    if (audioContext.state !== 'running') {
      audioContext.resume()
        .then(() => {
          audioUnlocked = audioContext?.state === 'running';
          if (audioUnlocked) emit();
        })
        .catch(() => {});
      return;
    }

    audioUnlocked = true;
    emit();
  }

  function showOfferEndingSoonAlert(notification) {
    const mins = Math.max(1, Number(notification?.minutesRemaining || 0));
    const title = String(notification?.title || 'Special offer');
    const rooms = Array.isArray(notification?.roomTypes) ? notification.roomTypes.filter(Boolean).join(', ') : '';
    const message = `${title} ends in about ${mins} minute${mins === 1 ? '' : 's'}${rooms ? ` (${rooms})` : ''}.`;
    const host = document.body;
    if (!host) return;
    const alert = document.createElement('div');
    alert.className = 'admin-live-alert is-warning';
    alert.textContent = message;
    host.append(alert);
    window.setTimeout(() => {
      alert.classList.add('is-leaving');
      window.setTimeout(() => alert.remove(), 250);
    }, 10000);
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  setSoundLabel();

  soundButton?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('moriBookingSound', soundEnabled ? 'on' : 'off');
    setSoundLabel();
    if (soundEnabled) unlockAudio();
  });

  clearButton?.addEventListener('click', async () => {
    if (clearButton.disabled) return;
    clearButton.disabled = true;
    const previousLabel = clearButton.textContent;
    clearButton.textContent = 'Clearing\u2026';
    try {
      await apiFetch('/api/admin/bookings/notifications/read-all', { method: 'POST' });
      setBadge(0);
      if (notificationItems) {
        notificationItems.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'admin-notification-empty';
        empty.textContent = 'No new notifications.';
        notificationItems.append(empty);
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      window.alert(error instanceof Error ? error.message : 'Could not clear notifications.');
      await refreshNotifications();
    } finally {
      clearButton.disabled = false;
      clearButton.textContent = previousLabel || 'Clear all';
    }
  });

  bell?.addEventListener('click', () => {
    const open = panel?.hidden ?? true;
    if (panel) panel.hidden = !open;
    bell.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!panel || panel.hidden || root.contains(event.target)) return;
    panel.hidden = true;
    bell?.setAttribute('aria-expanded', 'false');
  });

  async function apiFetch(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
    }
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    return payload;
  }

  async function apiFetchBlob(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
    };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
    }
    if (!headers.Accept) headers.Accept = 'application/pdf';
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
    const fileName = match
      ? decodeURIComponent(match[1].replace(/"/g, '').trim())
      : 'Mori-History-Export.pdf';
    const recordCount = Number(response.headers.get('X-Flush-Record-Count') || 0);
    return { blob, fileName, recordCount };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function setHistoryChrome(isHistory) {
    if (flushButton) flushButton.hidden = !isHistory;
    if (flushLogPanel) flushLogPanel.hidden = !isHistory;
    if (walkInOpenButton) walkInOpenButton.hidden = isHistory;
    if (!isHistory) {
      setFlushLogExpanded(false);
    }
  }

  function isCashPaymentMethod(method) {
    return method === 'Cash';
  }

  function isDigitalPaymentMethod(method) {
    return method === 'EWallet' || method === 'BankTransfer' || method === 'GCash' || method === 'Maya';
  }

  function formatPaymentEvent(value) {
    const map = {
      Deposit: 'Deposit',
      ArrivalPayment: 'Arrival',
      BalanceSettlement: 'Balance',
      Refund: 'Refund',
      Adjustment: 'Adjustment',
    };
    return map[value] || String(value || '');
  }

  function formatPaymentMethod(value) {
    if (
      value === 'EWallet'
      || value === 'BankTransfer'
      || value === 'GCash'
      || value === 'Maya'
    ) {
      return 'E-wallet (InstaPay QR)';
    }
    if (value === 'Card') return 'Card (legacy)';
    return String(value || '');
  }

  function enablePaymentOcrPhotoZoom(image) {
    if (!(image instanceof HTMLElement) || !image.getAttribute('src')) return;
    image.setAttribute('data-photo-zoom', '');
    image.setAttribute('data-photo-zoom-src', image.getAttribute('src') || '');
    image.setAttribute('data-photo-zoom-alt', image.getAttribute('alt') || 'E-wallet receipt');
    image.setAttribute('title', 'Click to zoom \u00B7 Esc to exit');
    if (typeof window.initPhotoZoom === 'function') {
      window.initPhotoZoom(image.parentElement || paymentAddModal || document);
    }
  }

  function isPhotoZoomOpen() {
    return Boolean(document.body.classList.contains('hotel-photo-zoom-open'));
  }

  function setPaymentOcrStatus(message, isError) {
    const status = paymentAddModal?.querySelector('[data-payment-ocr-status]');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('is-error');
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function setPaymentAddBanner(message, isError = true) {
    const banner = paymentAddModal?.querySelector('[data-payment-add-banner]');
    if (!banner) return;
    if (!message) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    banner.hidden = false;
    banner.textContent = message;
    banner.classList.toggle('is-error', Boolean(isError));
  }

  function closePaymentAddPopup() {
    const popup = paymentAddModal?.querySelector('[data-payment-add-popup]');
    if (popup) popup.hidden = true;
  }

  function showPaymentAddPopup(message, title = 'Apply receipt first') {
    const popup = paymentAddModal?.querySelector('[data-payment-add-popup]');
    const text = paymentAddModal?.querySelector('[data-payment-add-popup-text]');
    const heading = paymentAddModal?.querySelector('#paymentAddPopupTitle');
    if (!popup || !text) {
      window.alert(message);
      return;
    }
    if (heading) heading.textContent = title;
    text.textContent = message;
    popup.hidden = false;
    setPaymentAddBanner(message, true);
    setPaymentOcrStatus(message, true);
    paymentAddModal.querySelector('[data-payment-add-popup-ok]')?.focus();
  }

  function resetPaymentOcrUi() {
    if (paymentOcrObjectUrl) {
      URL.revokeObjectURL(paymentOcrObjectUrl);
      paymentOcrObjectUrl = null;
    }
    paymentOcrBusy = false;
    paymentOcrNeedsApply = false;
    paymentOcrOriginalFile = null;
    paymentOcrScannerFilterEnabled = false;
    paymentOcrRerunAfterBusy = false;
    if (!paymentAddModal) return;
    const fileInput = paymentAddModal.querySelector('[data-payment-receipt-upload]');
    const captureInput = paymentAddModal.querySelector('[data-payment-receipt-capture]');
    const pathInput = paymentAddModal.querySelector('[data-payment-receipt-path]');
    const preview = paymentAddModal.querySelector('[data-payment-receipt-preview]');
    const previewWrap = paymentAddModal.querySelector('[data-payment-receipt-preview-wrap]');
    const dialog = paymentAddModal.querySelector('.admin-payment-modal-dialog');
    if (fileInput) fileInput.value = '';
    if (captureInput) captureInput.value = '';
    if (pathInput) pathInput.value = '';
    if (preview) {
      preview.removeAttribute('src');
      preview.removeAttribute('data-photo-zoom-src');
      preview.alt = 'Uploaded payment receipt';
    }
    if (previewWrap) previewWrap.hidden = true;
    if (dialog) dialog.classList.remove('is-wide');
    setPaymentOcrStatus('');
  }

  const ocrParse = () => window.MoriReceiptOcrParse || {};
  function cleanOcrParty(value) { return ocrParse().cleanOcrParty?.(value) ?? String(value || '').trim(); }
  function parseMoneyToken(token) { return ocrParse().parseMoneyToken?.(token) ?? null; }
  function normalizePhMobile(value) { return ocrParse().normalizePhMobile?.(value) ?? ''; }
  function formatPhMobileDisplay(rawValue) { return ocrParse().formatPhMobileDisplay?.(rawValue) ?? String(rawValue || '').trim(); }
  function extractPhoneCandidates(text) { return ocrParse().extractPhoneCandidates?.(text) ?? []; }
  function extractClassicGcashRef(text) { return ocrParse().extractClassicGcashRef?.(text) ?? ''; }
  function collectGcashReferenceAfterLabel(lines) { return ocrParse().collectGcashReferenceAfterLabel?.(lines) ?? ''; }
  function parseTransferFromTo(text, lines) { return ocrParse().parseTransferFromTo?.(text, lines) ?? { transferFrom: '', transferTo: '' }; }
  function detectEwalletLayout(upper, compact) { return ocrParse().detectEwalletLayout?.(upper, compact) ?? { wallet: 'Other', layout: 'unknown' }; }
  function parseEwalletOcrText(text) { return ocrParse().parseEwalletOcrText?.(text) ?? { wallet: 'Other', layout: 'unknown', reference: '', amount: null, transferFrom: '', transferTo: '', raw: String(text || '') }; }



  /**
   * Document-scanner look: grayscale, auto-contrast, mild sharpen.
   * Used for preview, upload, Azure, and local OCR.
   */
  async function applyReceiptScannerFilter(source, options = {}) {
    const maxSide = options.maxSide ?? 1800;
    const mime = options.mime ?? 'image/jpeg';
    const quality = options.quality ?? 0.88;
    const fileName = options.fileName || (source && source.name) || 'receipt-scan.jpg';
    try {
      const bitmap = await createImageBitmap(source);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        bitmap.close?.();
        return source;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();

      const image = ctx.getImageData(0, 0, width, height);
      const data = image.data;
      const gray = new Float32Array(width * height);

      // 1) Grayscale + collect histogram for auto levels
      const hist = new Uint32Array(256);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        gray[p] = g;
        hist[Math.max(0, Math.min(255, Math.round(g)))] += 1;
      }

      const total = width * height;
      const lowCut = Math.max(1, Math.floor(total * 0.02));
      const highCut = Math.max(1, Math.floor(total * 0.02));
      let cum = 0;
      let lo = 0;
      let hi = 255;
      for (let v = 0; v < 256; v += 1) {
        cum += hist[v];
        if (cum >= lowCut) {
          lo = v;
          break;
        }
      }
      cum = 0;
      for (let v = 255; v >= 0; v -= 1) {
        cum += hist[v];
        if (cum >= highCut) {
          hi = v;
          break;
        }
      }
      if (hi <= lo + 8) {
        lo = 20;
        hi = 235;
      }
      const range = hi - lo;

      // 2) Contrast stretch + slight paper white bias
      const stretched = new Float32Array(total);
      for (let p = 0; p < total; p += 1) {
        let value = ((gray[p] - lo) / range) * 255;
        value = Math.max(0, Math.min(255, value));
        // Soft curve: darken text slightly, brighten paper
        if (value < 128) {
          value = value * 0.92;
        } else {
          value = 128 + (value - 128) * 1.08;
        }
        stretched[p] = Math.max(0, Math.min(255, value));
      }

      // 3) Mild unsharp mask for text edges (scanner crispness)
      const out = new Uint8ClampedArray(total);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const p = y * width + x;
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            out[p] = stretched[p];
            continue;
          }
          const blur =
            (stretched[p - width - 1]
              + stretched[p - width]
              + stretched[p - width + 1]
              + stretched[p - 1]
              + stretched[p] * 2
              + stretched[p + 1]
              + stretched[p + width - 1]
              + stretched[p + width]
              + stretched[p + width + 1])
            / 10;
          const sharp = stretched[p] + (stretched[p] - blur) * 1.15;
          out[p] = Math.max(0, Math.min(255, Math.round(sharp)));
        }
      }

      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const v = out[p];
        // Cool document-scanner paper tint (subtle)
        data[i] = Math.min(255, v + 2);
        data[i + 1] = Math.min(255, v + 1);
        data[i + 2] = Math.min(255, v + 4);
        data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);

      const blob = await new Promise((resolve) => {
        canvas.toBlob((result) => resolve(result), mime, quality);
      });
      if (!blob) return source;
      const base = String(fileName).replace(/\.[^.]+$/, '') || 'receipt-scan';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      return new File([blob], `${base}-scanned.${ext}`, { type: mime });
    } catch {
      return source;
    }
  }

  async function preprocessReceiptForOcr(file) {
    return applyReceiptScannerFilter(file, {
      maxSide: 1800,
      mime: 'image/png',
      quality: 0.92,
      fileName: file?.name || 'receipt.png',
    });
  }

  /** Compress for Azure F0 (max 4 MB) \u2014 scanned + small JPEG. */
  async function prepareReceiptForAzureOcr(file) {
    return applyReceiptScannerFilter(file, {
      maxSide: 1600,
      mime: 'image/jpeg',
      quality: 0.78,
      fileName: file?.name || 'receipt.jpg',
    });
  }

  async function uploadPaymentReceiptFile(file) {
    if (!paymentBookingContext?.id) {
      throw new Error('Open a booking before uploading a receipt.');
    }
    const form = new FormData();
    form.append('bookingId', String(paymentBookingContext.id));
    form.append('file', file, file.name || 'receipt.jpg');
    return apiFetch('/api/admin/payments/receipt-upload', {
      method: 'POST',
      body: form,
    });
  }

  async function resizeReceiptImage(source, options = {}) {
    const maxSide = options.maxSide ?? 1600;
    const mime = options.mime ?? 'image/jpeg';
    const quality = options.quality ?? 0.78;
    const fileName = options.fileName || (source && source.name) || 'receipt.jpg';
    try {
      const bitmap = await createImageBitmap(source);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close?.();
        return source;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob((result) => resolve(result), mime, quality));
      if (!blob) return source;
      return new File([blob], fileName, { type: mime });
    } catch {
      return source;
    }
  }

  async function requestAzureReceiptOcr(file) {
    if (!paymentBookingContext?.id) {
      throw new Error('Open a booking before scanning a receipt.');
    }
    const azureFile = paymentOcrScannerFilterEnabled
      ? await resizeReceiptImage(file, {
          maxSide: 1600,
          mime: 'image/jpeg',
          quality: 0.78,
          fileName: file.name || 'receipt-scanned.jpg',
        })
      : await resizeReceiptImage(file, {
          maxSide: 1600,
          mime: 'image/jpeg',
          quality: 0.82,
          fileName: (file && file.name) || 'receipt.jpg',
        });
    const form = new FormData();
    form.append('bookingId', String(paymentBookingContext.id));
    form.append('file', azureFile, azureFile.name || 'receipt.jpg');
    return apiFetch('/api/admin/payments/receipt-ocr', {
      method: 'POST',
      body: form,
    });
  }

  async function runTesseractReceiptOcr(file, statusPrefix) {
    await ensureTesseractLoaded();
    if (typeof Tesseract === 'undefined') {
      throw new Error('Local OCR library failed to load. Enter details manually.');
    }
    // File is usually already scanner-filtered; recognize directly for speed.
    const ocrSource = file;
    if (typeof Tesseract.createWorker === 'function') {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (message) => {
          if (message?.status === 'recognizing text' && typeof message.progress === 'number') {
            const pct = Math.round(message.progress * 100);
            setPaymentOcrStatus(`${statusPrefix}${pct}%`);
          }
        },
      });
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
        });
        const result = await worker.recognize(ocrSource);
        return result?.data?.text || '';
      } finally {
        await worker.terminate();
      }
    }
    const result = await Tesseract.recognize(ocrSource, 'eng', {
      logger: (message) => {
        if (message?.status === 'recognizing text' && typeof message.progress === 'number') {
          const pct = Math.round(message.progress * 100);
          setPaymentOcrStatus(`${statusPrefix}${pct}%`);
        }
      },
    });
    return result?.data?.text || '';
  }

  function applyParsedReceiptOcrToUi(parsed, engineLabel) {
    const raw = paymentAddModal?.querySelector('[data-payment-ocr-raw]');
    const ref = paymentAddModal?.querySelector('[data-payment-ocr-ref]');
    const amountInput = paymentAddModal?.querySelector('[data-payment-ocr-amount]');
    const fromInput = paymentAddModal?.querySelector('[data-payment-ocr-from]');
    const toInput = paymentAddModal?.querySelector('[data-payment-ocr-to]');
    const channelHidden = paymentAddModal?.querySelector('[data-payment-ocr-channel]');

    if (raw) raw.value = parsed.raw || '(no text detected)';
    if (ref) ref.value = parsed.reference || '';
    if (amountInput) amountInput.value = parsed.amount != null ? parsed.amount.toFixed(2) : '';
    if (fromInput) fromInput.value = parsed.transferFrom || '';
    if (toInput) toInput.value = parsed.transferTo || '';
    if (channelHidden) {
      const allowed = ['GCash', 'Maya', 'PayPal', 'InstaPay', 'Other'];
      channelHidden.value = allowed.includes(parsed.wallet) ? parsed.wallet : 'Other';
    }

    const layoutLabel =
      parsed.layout === 'gcash-history'
        ? 'GCash history'
        : parsed.layout === 'gcash-receipt'
          ? 'GCash receipt'
          : parsed.layout === 'instapay'
            ? 'InstaPay'
            : parsed.wallet;
    const missing = [];
    if (!parsed.reference) missing.push('reference');
    if (parsed.amount == null) missing.push('amount');
    if (!parsed.transferFrom && !parsed.transferTo) missing.push('from/to');
    const engineNote = engineLabel ? ` \u00B7 ${engineLabel}` : '';
    if (missing.length) {
      setPaymentOcrStatus(
        `${layoutLabel}${engineNote}: could not fully read ${missing.join(', ')}. Fix from the photo, then Apply.`,
        true
      );
    } else {
      setPaymentOcrStatus(`${layoutLabel} detected${engineNote} \u2014 compare fields, then Apply.`);
    }
  }

  async function previewPaymentReceiptFilter(file, useScannerFilter) {
    if (!paymentAddModal || !file) return file;
    const image = paymentAddModal.querySelector('[data-payment-ocr-image]');
    const compare = paymentAddModal.querySelector('[data-payment-ocr-compare]');
    const caption = paymentAddModal.querySelector('[data-payment-ocr-caption]');
    const dialog = paymentAddModal.querySelector('.admin-payment-modal-dialog');
    let workingFile = file;
    if (useScannerFilter) {
      try {
        workingFile = await applyReceiptScannerFilter(file, {
          maxSide: 1800,
          mime: 'image/jpeg',
          quality: 0.9,
          fileName: file.name || 'receipt.jpg',
        });
      } catch {
        workingFile = file;
      }
    }
    if (paymentOcrObjectUrl) URL.revokeObjectURL(paymentOcrObjectUrl);
    paymentOcrObjectUrl = URL.createObjectURL(workingFile);
    if (compare) compare.hidden = false;
    if (dialog) dialog.classList.add('is-wide');
    if (image) {
      image.src = paymentOcrObjectUrl;
      image.alt = useScannerFilter ? 'Scanned receipt' : (file.name || 'Uploaded receipt');
      enablePaymentOcrPhotoZoom(image);
    }
    if (caption) {
      caption.textContent = useScannerFilter
        ? 'Scanned receipt \u00B7 click to zoom \u00B7 Esc to exit'
        : 'Receipt photo \u00B7 click to zoom \u00B7 Esc to exit';
    }
    return workingFile;
  }

  async function runPaymentReceiptOcr(file) {
    if (!paymentAddModal || !file) return;

    paymentOcrBusy = true;
    paymentOcrNeedsApply = true;
    paymentOcrOriginalFile = file;
    const raw = paymentAddModal.querySelector('[data-payment-ocr-raw]');
    const pathInput = paymentAddModal.querySelector('[data-payment-receipt-path]');
    const filterToggle = paymentAddModal.querySelector('[data-payment-ocr-scanner-filter]');

    // Keep switch state; default remains false until user turns it on.
    paymentOcrScannerFilterEnabled = Boolean(filterToggle?.checked);
    if (filterToggle) filterToggle.checked = paymentOcrScannerFilterEnabled;

    let workingFile = file;
    if (paymentOcrScannerFilterEnabled) {
      setPaymentOcrStatus('Applying scanner filter\u2026');
    } else {
      setPaymentOcrStatus(
        azureOcrConfigured === false ? 'Reading receipt with local OCR\u2026' : 'Reading receipt\u2026'
      );
    }

    try {
      workingFile = await previewPaymentReceiptFilter(file, paymentOcrScannerFilterEnabled);
    } catch {
      workingFile = file;
    }

    const uploadPromise = uploadPaymentReceiptFile(workingFile)
      .then((result) => {
        if (pathInput) pathInput.value = result?.path || '';
      })
      .catch((error) => {
        setPaymentOcrStatus(
          error instanceof Error ? error.message : 'Receipt upload failed.',
          true
        );
      });

    try {
      let recognizedText = '';
      let engineLabel = '';
      let usedAzure = false;

      if (azureOcrConfigured !== false) {
        setPaymentOcrStatus(
          paymentOcrScannerFilterEnabled
            ? 'Reading scanned receipt with Azure\u2026'
            : 'Reading receipt with Azure\u2026'
        );
        try {
          const azureResult = await requestAzureReceiptOcr(workingFile);
          const engine = String(azureResult?.engine || '');
          if (engine === 'Azure' && String(azureResult?.text || '').trim()) {
            recognizedText = String(azureResult.text);
            usedAzure = true;
            azureOcrConfigured = true;
            const used = azureResult.pagesUsedThisMonth;
            const budget = azureResult.monthlyBudget;
            engineLabel =
              used != null && budget != null
                ? `Azure OCR ${used}/${budget}`
                : 'Azure OCR';
          } else {
            if (engine === 'Unavailable') azureOcrConfigured = false;
            const reason = azureResult?.fallbackReason
              || (engine === 'QuotaExceeded'
                ? 'Azure free quota unavailable'
                : engine === 'Unavailable'
                  ? 'Azure not configured'
                  : 'Azure unavailable');
            setPaymentOcrStatus(`Using local OCR (${reason})\u2026`);
          }
        } catch (azureError) {
          setPaymentOcrStatus(
            `Using local OCR (${azureError instanceof Error ? azureError.message : 'Azure request failed'})\u2026`
          );
        }
      } else {
        setPaymentOcrStatus(
          paymentOcrScannerFilterEnabled
            ? 'Reading scanned receipt with local OCR\u2026'
            : 'Reading receipt with local OCR\u2026'
        );
      }

      if (!usedAzure) {
        if (typeof Tesseract === 'undefined') {
          throw new Error(
            'Azure OCR unavailable and local OCR library failed to load. Enter details manually.'
          );
        }
        recognizedText = await runTesseractReceiptOcr(workingFile, 'Local OCR\u2026 ');
        engineLabel = azureOcrConfigured === false
          ? 'local OCR (Azure not configured)'
          : 'local OCR';
      }

      const parsed = parseEwalletOcrText(recognizedText);
      applyParsedReceiptOcrToUi(parsed, engineLabel);
      await uploadPromise;
    } catch (error) {
      setPaymentOcrStatus(
        error instanceof Error ? error.message : 'Unable to read receipt.',
        true
      );
      if (raw) raw.value = '';
    } finally {
      paymentOcrBusy = false;
      if (paymentOcrRerunAfterBusy && paymentOcrOriginalFile) {
        paymentOcrRerunAfterBusy = false;
        void runPaymentReceiptOcr(paymentOcrOriginalFile);
      }
    }
  }

  function hasPaymentOcrReading() {
    if (!paymentAddModal) return false;
    const raw = (paymentAddModal.querySelector('[data-payment-ocr-raw]')?.value || '').trim();
    const ref = (paymentAddModal.querySelector('[data-payment-ocr-ref]')?.value || '').trim();
    const amount = (paymentAddModal.querySelector('[data-payment-ocr-amount]')?.value || '').trim();
    const from = (paymentAddModal.querySelector('[data-payment-ocr-from]')?.value || '').trim();
    const to = (paymentAddModal.querySelector('[data-payment-ocr-to]')?.value || '').trim();
    if (ref || amount || from || to) return true;
    return Boolean(raw && raw !== '(no text detected)');
  }

  async function onPaymentOcrScannerFilterToggle(event) {
    const enabled = Boolean(event?.target?.checked);
    paymentOcrScannerFilterEnabled = enabled;
    if (!paymentOcrOriginalFile) return;

    const body = paymentAddModal?.querySelector('.admin-payment-modal-body');
    const scrollTop = body?.scrollTop ?? 0;
    const keepReading = hasPaymentOcrReading();

    // Always update the preview immediately \u2014 do not block on OCR.
    setPaymentOcrStatus(
      enabled ? 'Applying scanner filter\u2026' : 'Showing original receipt\u2026'
    );
    try {
      await previewPaymentReceiptFilter(paymentOcrOriginalFile, enabled);
    } catch {
      /* keep previous preview */
    }

    if (!enabled) {
      // Preview-only: never re-OCR when turning filter off after a successful read.
      paymentOcrRerunAfterBusy = false;
      if (keepReading) {
        setPaymentOcrStatus(
          'Showing original receipt \u2014 OCR fields kept. Turn filter on again to re-read.'
        );
      } else {
        setPaymentOcrStatus('Showing original receipt\u2026');
      }
    } else if (paymentOcrBusy) {
      paymentOcrRerunAfterBusy = true;
      setPaymentOcrStatus(
        'Scanner filter on \u2014 OCR will re-read when the current pass finishes.'
      );
    } else {
      await runPaymentReceiptOcr(paymentOcrOriginalFile);
    }

    if (body) {
      body.scrollTop = scrollTop;
      requestAnimationFrame(() => {
        body.scrollTop = scrollTop;
      });
    }
  }

  function applyPaymentOcrResult() {
    if (!paymentAddModal) return;
    const channelHidden = paymentAddModal.querySelector('[data-payment-ocr-channel]');
    const channel = (channelHidden?.value || '').trim() || 'Other';
    const reference = (paymentAddModal.querySelector('[data-payment-ocr-ref]')?.value || '').trim();
    const amountValue = Number(paymentAddModal.querySelector('[data-payment-ocr-amount]')?.value || 0);
    const transferFrom = (paymentAddModal.querySelector('[data-payment-ocr-from]')?.value || '').trim();
    const transferTo = (paymentAddModal.querySelector('[data-payment-ocr-to]')?.value || '').trim();
    const methodSelect = paymentAddModal.querySelector('[data-payment-method]');
    const ext = paymentAddModal.querySelector('[data-payment-external-ref]');
    const bank = paymentAddModal.querySelector('[data-payment-bank-ref]');
    const epayAmount = paymentAddModal.querySelector('[data-payment-epay-amount]');
    const notes = paymentAddModal.querySelector('[data-payment-notes]');

    if (!reference) {
      setPaymentOcrStatus('Enter or correct the reference before applying.', true);
      return;
    }

    const currentMethod = methodSelect?.value || 'EWallet';
    if (methodSelect && !isDigitalPaymentMethod(currentMethod)) {
      methodSelect.value = 'EWallet';
    } else if (methodSelect && currentMethod === 'BankTransfer') {
      methodSelect.value = 'EWallet';
    }
    if (ext) ext.value = reference;
    if (channelHidden) channelHidden.value = channel;
    if (bank && !bank.value.trim()) {
      bank.value = reference;
    }

    const balanceDue = Math.max(0, Number(paymentPriceContext.balanceDue) || 0);
    let appliedAmount = amountValue;
    let capped = false;
    if (amountValue > 0 && balanceDue > 0 && amountValue > balanceDue + 0.009) {
      appliedAmount = Math.round(balanceDue * 100) / 100;
      capped = true;
    }

    if (appliedAmount > 0 && epayAmount) {
      epayAmount.value = appliedAmount.toFixed(2);
      updateCashChangeUi();
    }

    const partyBits = [];
    partyBits.push(`Channel: ${channel}`);
    if (transferFrom) partyBits.push(`From: ${transferFrom}`);
    if (transferTo) partyBits.push(`To: ${transferTo}`);
    if (amountValue > 0) {
      partyBits.push(
        capped
          ? `Receipt amount: ${money(amountValue)} \u00B7 Will apply ${money(appliedAmount)} (excess not posted)`
          : `Receipt amount: ${money(amountValue)}`
      );
    }
    if (partyBits.length && notes) {
      const stamp = `Digital OCR \u00B7 ${partyBits.join(' \u00B7 ')}`;
      const existing = (notes.value || '').trim();
      notes.value = existing.includes('Digital OCR \u00B7') || existing.includes('E-wallet OCR \u00B7')
        ? existing.replace(/(?:Digital|E-wallet) OCR \u00B7[^\n]*/i, stamp)
        : existing
          ? `${existing}\n${stamp}`
          : stamp;
    }

    syncPaymentMethodPanels();
    paymentOcrNeedsApply = false;
    closePaymentAddPopup();
    setPaymentAddBanner('');
    if (capped) {
      setPaymentOcrStatus(
        `Applied ${channel} \u00B7 ${reference}. Receipt ${money(amountValue)} exceeds balance \u2014 will post ${money(appliedAmount)} only.`
      );
    } else {
      const amountNote = amountValue > 0 ? ` \u00B7 ${money(amountValue)}` : '';
      setPaymentOcrStatus(`Applied ${channel} \u00B7 ${reference}${amountNote}. Save payment when ready.`);
    }
  }

  function discardPaymentOcrResult() {
    resetPaymentOcrUi();
    setPaymentOcrStatus('Scan discarded. You can upload again or type the reference.');
  }

  function setPaymentCameraStatus(message, isError) {
    const status = paymentCameraModal?.querySelector('[data-payment-camera-status]');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('is-error');
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function setPaymentCameraGuideState(state, label) {
    if (paymentCameraGuideFrame) {
      paymentCameraGuideFrame.classList.toggle('is-scanning', state === 'scanning');
      paymentCameraGuideFrame.classList.toggle('is-ready', state === 'ready');
    }
    if (paymentCameraGuideLabel && label) {
      paymentCameraGuideLabel.textContent = label;
    }
  }

  function stopPaymentCameraAutoScan() {
    if (paymentCameraAutoTimer) {
      window.clearTimeout(paymentCameraAutoTimer);
      paymentCameraAutoTimer = 0;
    }
    paymentCameraScanBusy = false;
    paymentCameraGoodHits = 0;
    paymentCameraLastGoodRef = '';
    setPaymentCameraGuideState('', 'Mobile receipt');
  }

  async function disposePaymentCameraScanWorker() {
    if (!paymentCameraScanWorker) return;
    const worker = paymentCameraScanWorker;
    paymentCameraScanWorker = null;
    try {
      await worker.terminate();
    } catch {
      // ignore terminate errors
    }
  }

  async function ensurePaymentCameraScanWorker() {
    if (paymentCameraScanWorker) return paymentCameraScanWorker;
    try {
      await ensureTesseractLoaded();
    } catch {
      return null;
    }
    if (typeof Tesseract === 'undefined' || typeof Tesseract.createWorker !== 'function') {
      return null;
    }
    const worker = await Tesseract.createWorker('eng', 1);
    await worker.setParameters({
      // Sparse text is faster for phone receipt screenshots.
      tessedit_pageseg_mode: '11',
      preserve_interword_spaces: '1',
    });
    paymentCameraScanWorker = worker;
    return worker;
  }

  function stopPaymentCamera() {
    stopPaymentCameraAutoScan();
    disposePaymentCameraScanWorker();
    if (paymentCameraStream) {
      paymentCameraStream.getTracks().forEach((track) => track.stop());
      paymentCameraStream = null;
    }
    if (paymentCameraVideo) {
      paymentCameraVideo.srcObject = null;
    }
  }

  function closePaymentCameraModal() {
    paymentCameraAutoCaptureLock = false;
    stopPaymentCamera();
    setPaymentCameraStatus('');
    if (paymentCameraModal) paymentCameraModal.hidden = true;
  }

  function getPaymentCameraOcrCanvas() {
    if (!paymentCameraOcrCanvas) paymentCameraOcrCanvas = document.createElement('canvas');
    return paymentCameraOcrCanvas;
  }

  function grabPaymentCameraGuideSample() {
    if (!paymentCameraVideo || !paymentCameraCanvas) return null;
    const width = paymentCameraVideo.videoWidth || 0;
    const height = paymentCameraVideo.videoHeight || 0;
    if (!(width > 40 && height > 40)) return null;

    // Match the tall portrait phone frame (~86% width, 9:19.5) on object-fit:cover video.
    const frameAspect = 9 / 19.5;
    const cropW = Math.round(width * 0.82);
    let cropH = Math.round(cropW / frameAspect);
    if (cropH > height * 0.94) {
      cropH = Math.round(height * 0.94);
    }
    const sx = Math.max(0, Math.round((width - cropW) / 2));
    const sy = Math.max(0, Math.round((height - cropH) / 2));
    const sw = Math.min(cropW, width - sx);
    const sh = Math.min(cropH, height - sy);

    paymentCameraCanvas.width = sw;
    paymentCameraCanvas.height = sh;
    const ctx = paymentCameraCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(paymentCameraVideo, sx, sy, sw, sh, 0, 0, sw, sh);
    const image = ctx.getImageData(0, 0, sw, sh);
    return { width: sw, height: sh, image, canvas: paymentCameraCanvas };
  }

  function buildLiveOcrBlob(sample) {
    const maxW = 420;
    const src = sample.canvas;
    const scale = Math.min(1, maxW / Math.max(1, src.width));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const ocrCanvas = getPaymentCameraOcrCanvas();
    ocrCanvas.width = w;
    ocrCanvas.height = h;
    const ctx = ocrCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    return new Promise((resolve) => {
      ocrCanvas.toBlob((result) => resolve(result), 'image/jpeg', 0.52);
    });
  }

  function measureFrameSharpness(imageData) {
    const { data, width, height } = imageData;
    if (width < 8 || height < 8) return 0;
    // Coarser downsample for faster live checks.
    const stepX = Math.max(1, Math.floor(width / 90));
    const stepY = Math.max(1, Math.floor(height / 120));
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    let edge = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const i = (y * width + x) * 4;
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const right = data[i + stepX * 4] * 0.299
          + data[i + stepX * 4 + 1] * 0.587
          + data[i + stepX * 4 + 2] * 0.114;
        const below = data[((y + stepY) * width + x) * 4] * 0.299
          + data[((y + stepY) * width + x) * 4 + 1] * 0.587
          + data[((y + stepY) * width + x) * 4 + 2] * 0.114;
        const lap = Math.abs(right - gray) + Math.abs(below - gray);
        edge += lap;
        sum += gray;
        sumSq += gray * gray;
        count += 1;
      }
    }
    if (!count) return 0;
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    const contrast = Math.sqrt(variance);
    const sharpness = edge / count;
    if (contrast < 16) return sharpness * 0.35;
    return sharpness;
  }

  function receiptDetailsLookClear(parsed, text) {
    if (!parsed) return false;
    const reference = String(parsed.reference || '').replace(/\s+/g, '');
    const hasRef = reference.length >= 6;
    const hasAmount = parsed.amount != null && Number(parsed.amount) > 0;
    const hasWallet = Boolean(parsed.wallet && parsed.wallet !== 'Other');
    const hasKeywords = /GCASH|MAYA|INSTAPAY|PAYPAL|REF\s*NO|AMOUNT|TRANSACTION|EXPRESS\s*SEND/i.test(
      String(text || '')
    );
    return (hasRef && hasAmount) || (hasRef && hasWallet && hasKeywords);
  }

  function schedulePaymentCameraAutoScan(delayMs = 320) {
    if (paymentCameraAutoTimer) window.clearTimeout(paymentCameraAutoTimer);
    paymentCameraAutoTimer = window.setTimeout(() => {
      paymentCameraAutoTimer = 0;
      runPaymentCameraAutoScanTick();
    }, delayMs);
  }

  async function runPaymentCameraAutoScanTick() {
    if (
      !paymentCameraModal
      || paymentCameraModal.hidden
      || paymentCameraAutoCaptureLock
      || !paymentCameraStream
    ) {
      return;
    }
    if (paymentCameraScanBusy) {
      schedulePaymentCameraAutoScan(220);
      return;
    }

    const sample = grabPaymentCameraGuideSample();
    if (!sample) {
      setPaymentCameraStatus('Waiting for camera preview\u2026');
      setPaymentCameraGuideState('scanning', 'Mobile receipt');
      schedulePaymentCameraAutoScan(280);
      return;
    }

    const sharpness = measureFrameSharpness(sample.image);
    if (sharpness < 12) {
      paymentCameraGoodHits = 0;
      paymentCameraLastGoodRef = '';
      setPaymentCameraGuideState('scanning', 'Hold phone upright');
      setPaymentCameraStatus('Center the upright mobile receipt in the portrait frame\u2026');
      schedulePaymentCameraAutoScan(280);
      return;
    }

    if (typeof Tesseract === 'undefined') {
      try {
        await ensureTesseractLoaded();
      } catch {
        setPaymentCameraGuideState('ready', 'Looking clear \u2014 tap Capture');
        setPaymentCameraStatus('Image looks clear. OCR unavailable \u2014 tap Capture photo.');
        schedulePaymentCameraAutoScan(900);
        return;
      }
    }

    paymentCameraScanBusy = true;
    setPaymentCameraGuideState('scanning', 'Reading\u2026');
    setPaymentCameraStatus('Clear image \u2014 checking receipt details\u2026');
    try {
      // Warm worker in parallel with downscale when possible.
      const [worker, blob] = await Promise.all([
        ensurePaymentCameraScanWorker(),
        buildLiveOcrBlob(sample),
      ]);
      let text = '';
      if (worker && blob) {
        const result = await worker.recognize(blob);
        text = result?.data?.text || '';
      } else if (sample.canvas) {
        const result = await Tesseract.recognize(sample.canvas, 'eng');
        text = result?.data?.text || '';
      }

      if (paymentCameraModal.hidden || paymentCameraAutoCaptureLock) return;

      const parsed = parseEwalletOcrText(text);
      const clear = receiptDetailsLookClear(parsed, text);
      if (clear) {
        const refKey = String(parsed.reference || '').replace(/\s+/g, '').toUpperCase();
        if (refKey && refKey === paymentCameraLastGoodRef) {
          paymentCameraGoodHits += 1;
        } else {
          paymentCameraLastGoodRef = refKey;
          paymentCameraGoodHits = 1;
        }

        setPaymentCameraGuideState('ready', 'Details clear');
        // Capture sooner: one strong read, or two matching reads.
        if (paymentCameraGoodHits >= 2 || (paymentCameraGoodHits >= 1 && sharpness >= 16)) {
          setPaymentCameraStatus('Details clear \u2014 capturing\u2026');
          paymentCameraAutoCaptureLock = true;
          stopPaymentCameraAutoScan();
          await capturePaymentCameraPhoto({ auto: true });
          return;
        }
        setPaymentCameraStatus('Details found \u2014 hold steady\u2026');
      } else {
        paymentCameraGoodHits = 0;
        paymentCameraLastGoodRef = '';
        setPaymentCameraGuideState('scanning', 'Need clearer details');
        setPaymentCameraStatus('Receipt in frame \u2014 move closer until ref/amount are sharp\u2026');
      }
    } catch {
      setPaymentCameraStatus('Still scanning\u2026 keep the receipt inside the frame.');
    } finally {
      paymentCameraScanBusy = false;
      if (!paymentCameraAutoCaptureLock && paymentCameraModal && !paymentCameraModal.hidden) {
        schedulePaymentCameraAutoScan(360);
      }
    }
  }

  async function startPaymentCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API is not available in this browser.');
    }
    stopPaymentCameraAutoScan();
    if (paymentCameraStream) {
      paymentCameraStream.getTracks().forEach((track) => track.stop());
      paymentCameraStream = null;
    }
    if (paymentCameraVideo) paymentCameraVideo.srcObject = null;

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: paymentCameraFacingMode },
        // Prefer portrait for mobile payment receipts (GCash / Maya).
        aspectRatio: { ideal: 9 / 16 },
        width: { ideal: 720 },
        height: { ideal: 1280 },
      },
    };
    paymentCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (paymentCameraVideo) {
      paymentCameraVideo.srcObject = paymentCameraStream;
      await paymentCameraVideo.play().catch(() => {});
    }
  }

  function openNativeReceiptCapture() {
    const captureInput = paymentAddModal?.querySelector('[data-payment-receipt-capture]');
    if (captureInput) {
      captureInput.value = '';
      captureInput.click();
      return;
    }
    paymentAddModal?.querySelector('[data-payment-receipt-upload]')?.click();
  }

  async function openPaymentCamera() {
    if (!paymentAddModal || paymentAddModal.hidden) return;
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setPaymentOcrStatus('Camera needs HTTPS (or localhost). Opening device capture\u2026', true);
      openNativeReceiptCapture();
      return;
    }

    if (!paymentCameraModal || !paymentCameraVideo) {
      openNativeReceiptCapture();
      return;
    }

    paymentCameraFacingMode = 'environment';
    paymentCameraAutoCaptureLock = false;
    paymentCameraModal.hidden = false;
    setPaymentCameraStatus('Starting camera\u2026');
    setPaymentCameraGuideState('scanning', 'Mobile receipt');
    // Pre-warm OCR worker while the camera stream starts.
    ensurePaymentCameraScanWorker().catch(() => {});
    try {
      await startPaymentCameraStream();
      setPaymentCameraStatus('Portrait scan on \u2014 hold the phone upright in the frame.');
      schedulePaymentCameraAutoScan(450);
    } catch (error) {
      closePaymentCameraModal();
      const message = error instanceof Error ? error.message : 'Unable to open camera.';
      setPaymentOcrStatus(`${message} Opening device camera instead\u2026`, true);
      openNativeReceiptCapture();
    }
  }

  async function switchPaymentCamera() {
    paymentCameraFacingMode = paymentCameraFacingMode === 'environment' ? 'user' : 'environment';
    paymentCameraAutoCaptureLock = false;
    stopPaymentCameraAutoScan();
    setPaymentCameraStatus('Switching camera\u2026');
    try {
      await startPaymentCameraStream();
      setPaymentCameraStatus(
        paymentCameraFacingMode === 'environment'
          ? 'Rear camera \u2014 auto-scan on.'
          : 'Front camera \u2014 auto-scan on.'
      );
      schedulePaymentCameraAutoScan(400);
    } catch {
      paymentCameraFacingMode = paymentCameraFacingMode === 'environment' ? 'user' : 'environment';
      setPaymentCameraStatus('Could not switch camera on this device.', true);
      try {
        await startPaymentCameraStream();
        schedulePaymentCameraAutoScan(400);
      } catch {
        closePaymentCameraModal();
        openNativeReceiptCapture();
      }
    }
  }

  async function capturePaymentCameraPhoto(options = {}) {
    if (!paymentCameraVideo || !paymentCameraCanvas || !paymentCameraStream) {
      setPaymentCameraStatus('Camera is not ready yet.', true);
      paymentCameraAutoCaptureLock = false;
      return;
    }
    const width = paymentCameraVideo.videoWidth || 1280;
    const height = paymentCameraVideo.videoHeight || 720;
    if (!(width > 0 && height > 0)) {
      setPaymentCameraStatus('Wait for the camera preview, then try again.', true);
      paymentCameraAutoCaptureLock = false;
      if (!options.auto) schedulePaymentCameraAutoScan(320);
      return;
    }

    stopPaymentCameraAutoScan();
    paymentCameraAutoCaptureLock = true;
    setPaymentCameraStatus(options.auto ? 'Auto-capturing clear receipt\u2026' : 'Capturing\u2026');

    paymentCameraCanvas.width = width;
    paymentCameraCanvas.height = height;
    const ctx = paymentCameraCanvas.getContext('2d');
    if (!ctx) {
      setPaymentCameraStatus('Unable to capture this frame.', true);
      paymentCameraAutoCaptureLock = false;
      schedulePaymentCameraAutoScan(320);
      return;
    }
    ctx.drawImage(paymentCameraVideo, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      paymentCameraCanvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
    });
    if (!blob) {
      setPaymentCameraStatus('Could not create the photo. Try again.', true);
      paymentCameraAutoCaptureLock = false;
      schedulePaymentCameraAutoScan(320);
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `receipt-camera-${stamp}.jpg`, { type: 'image/jpeg' });
    closePaymentCameraModal();
    await attachPaymentReceipt(file);
  }

  async function attachPaymentReceipt(file) {
    if (!paymentAddModal || !file) return;
    paymentOcrBusy = true;
    paymentOcrNeedsApply = false;
    const pathInput = paymentAddModal.querySelector('[data-payment-receipt-path]');
    const preview = paymentAddModal.querySelector('[data-payment-receipt-preview]');
    const previewWrap = paymentAddModal.querySelector('[data-payment-receipt-preview-wrap]');
    setPaymentOcrStatus('Uploading receipt\u2026');
    try {
      if (paymentOcrObjectUrl) URL.revokeObjectURL(paymentOcrObjectUrl);
      paymentOcrObjectUrl = URL.createObjectURL(file);
      if (preview) {
        preview.src = paymentOcrObjectUrl;
        preview.alt = file.name || 'Uploaded receipt';
        enablePaymentOcrPhotoZoom(preview);
      }
      if (previewWrap) previewWrap.hidden = false;
      const resized = await resizeReceiptImage(file).catch(() => file);
      const result = await uploadPaymentReceiptFile(resized);
      if (pathInput) pathInput.value = result?.path || '';
      setPaymentOcrStatus('Receipt attached.');
      closePaymentAddPopup();
      setPaymentAddBanner('');
    } catch (error) {
      setPaymentOcrStatus(error instanceof Error ? error.message : 'Receipt upload failed.', true);
    } finally {
      paymentOcrBusy = false;
    }
  }

  function handleReceiptFileSelected(file, input) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPaymentOcrStatus('Choose an image file (JPG / PNG / WEBP).', true);
      if (input) input.value = '';
      return;
    }
    if (file.size > 8_000_000) {
      setPaymentOcrStatus('Receipt image must be under 8 MB.', true);
      if (input) input.value = '';
      return;
    }
    attachPaymentReceipt(file);
  }

  function setPaymentPricesExpanded(expanded) {
    const toggle = paymentAddModal?.querySelector('[data-payment-prices-toggle]');
    const body = paymentAddModal?.querySelector('[data-payment-prices-body]');
    if (!toggle || !body) return;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.classList.toggle('is-open', expanded);
    body.hidden = !expanded;
  }

  function updatePaymentPricesUi() {
    if (!paymentAddModal) return;
    const setText = (sel, value) => {
      const el = paymentAddModal.querySelector(sel);
      if (el) el.textContent = money(value);
    };
    setText('[data-price-stay]', paymentPriceContext.stayTotal);
    setText('[data-price-paid]', paymentPriceContext.amountPaid);
    const bal = Number(paymentPriceContext.balanceDue) || 0;
    const balanceEl = paymentAddModal.querySelector('[data-price-balance]');
    if (balanceEl) {
      balanceEl.textContent = money(bal < -0.009 ? Math.abs(bal) : Math.max(0, bal));
    }
    const preview = paymentAddModal.querySelector('[data-payment-prices-preview]');
    if (preview) {
      const label = bal < -0.009 ? 'Overpaid' : bal <= 0.009 ? 'Fully paid' : 'Balance due';
      preview.textContent = `${label} ${money(bal < -0.009 ? Math.abs(bal) : Math.max(0, bal))} \u00B7 closed by default`;
    }
  }

  function syncPaymentMethodPanels() {
    if (!paymentAddModal) return;
    const method = paymentAddModal.querySelector('[data-payment-method]')?.value || 'Cash';
    const cash = isCashPaymentMethod(method);
    const digital = isDigitalPaymentMethod(method);
    const cashPanel = paymentAddModal.querySelector('[data-payment-cash-panel]');
    const epayPanel = paymentAddModal.querySelector('[data-payment-epay-panel]');
    const hint = paymentAddModal.querySelector('[data-payment-epay-hint]');
    if (cashPanel) cashPanel.hidden = !cash;
    if (epayPanel) epayPanel.hidden = !digital;
    if (hint) {
      hint.textContent =
        'Guest pays via hotel InstaPay QR (e-wallet). Attach a photo of their receipt.';
    }
    updateCashChangeUi();
  }

  function updateCashChangeUi() {
    if (!paymentAddModal) return;
    const due = Number(paymentAddModal.querySelector('[data-payment-cash-due]')?.value || 0);
    const tendered = Number(paymentAddModal.querySelector('[data-payment-cash-tendered]')?.value || 0);
    const change = Math.max(0, Math.round((tendered - due) * 100) / 100);
    const changeEl = paymentAddModal.querySelector('[data-payment-cash-change]');
    const formula = paymentAddModal.querySelector('[data-payment-cash-formula]');
    const box = paymentAddModal.querySelector('[data-payment-change-box]');
    if (changeEl) changeEl.textContent = money(change);
    if (formula) {
      formula.textContent = `${money(tendered)} \u2212 ${money(due)} = ${money(change)} change`;
    }
    if (box) {
      box.classList.toggle('is-short', tendered > 0 && tendered < due);
      box.classList.toggle('is-ready', tendered >= due && due > 0);
    }
  }

  function applyPaymentPricePick(key) {
    const value = Number(paymentPriceContext[key] || 0);
    if (!(value >= 0)) return;
    const cashDue = paymentAddModal?.querySelector('[data-payment-cash-due]');
    const epayAmount = paymentAddModal?.querySelector('[data-payment-epay-amount]');
    if (cashDue) cashDue.value = value.toFixed(2);
    if (epayAmount) epayAmount.value = value.toFixed(2);
    updateCashChangeUi();
  }

  function fillPaymentSummaryFields(booking, summary) {
    paymentPriceContext = {
      stayTotal: Number(summary?.stayTotal ?? booking.totalAmount ?? 0),
      amountPaid: Number(summary?.amountPaid ?? 0),
      balanceDue: Number(
        summary?.balanceDue ?? booking.totalAmount ?? 0
      ),
      amountDueNow: Number(booking.amountDueNow ?? summary?.balanceDue ?? booking.totalAmount ?? 0),
    };
  }

  async function loadBookingPaymentSummary(booking) {
    fillPaymentSummaryFields(booking, null);
    try {
      return await apiFetch(`/api/admin/payments/booking/${booking.id}`);
    } catch {
      return null;
    }
  }

  async function openPaymentViewModal(booking) {
    if (!paymentViewModal || !booking) return;
    paymentBookingContext = booking;
    const ref = paymentViewModal.querySelector('[data-payment-view-ref]');
    const guest = paymentViewModal.querySelector('[data-payment-view-guest]');
    if (ref) ref.textContent = booking.reference;
    if (guest) guest.textContent = booking.guestName || 'Guest';
    if (paymentViewList) {
      paymentViewList.innerHTML =
        '<tr><td colspan="6" class="admin-bookings-loading">Loading\u2026</td></tr>';
    }
    if (paymentViewSummary) paymentViewSummary.replaceChildren();

    const summary = await loadBookingPaymentSummary(booking);
    if (summary) fillPaymentSummaryFields(booking, summary);

    if (paymentViewSummary) {
      [
        ['Stay total', money(paymentPriceContext.stayTotal)],
        ['Already paid', money(paymentPriceContext.amountPaid)],
        ['Balance due', money(paymentPriceContext.balanceDue)],
      ].forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        paymentViewSummary.append(dt, dd);
      });
    }

    if (paymentViewList) {
      paymentViewList.replaceChildren();
      const payments = (summary?.payments || []).filter((p) => p.status !== 'Voided');
      if (!payments.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'admin-bookings-loading';
        cell.textContent = 'No payments posted yet.';
        row.appendChild(cell);
        paymentViewList.appendChild(row);
      } else {
        payments.forEach((payment) => {
          const row = document.createElement('tr');
          const methodLabel = formatPaymentMethod(payment.method);
          const methodWithRef = payment.externalReference
            ? `${methodLabel}\n${payment.externalReference}`
            : methodLabel;
          [
            formatDateTime(payment.paidAtUtc),
            payment.receiptNumber,
            formatPaymentEvent(payment.eventType),
            methodWithRef,
            money(payment.amount),
            payment.receivedBy,
          ].forEach((text, index) => {
            const td = document.createElement('td');
            td.textContent = text;
            if (index === 3) td.className = 'admin-payment-method-cell';
            row.appendChild(td);
          });
          if (payment.receiptImagePath) {
            const last = row.lastElementChild;
            if (last) {
              const link = document.createElement('a');
              link.href = payment.receiptImagePath;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.className = 'admin-payment-receipt-link';
              link.textContent = 'Receipt';
              last.appendChild(document.createElement('br'));
              last.appendChild(link);
            }
          }
          paymentViewList.appendChild(row);
        });
      }
    }

    const canAdd =
      canRecordPayment(booking) && paymentPriceContext.balanceDue > 0.009;
    if (paymentViewAddBtn) {
      paymentViewAddBtn.hidden = !canAdd;
    }
    paymentViewModal.hidden = false;
  }

  async function refreshOpenBookingDetails(bookingId) {
    if (!detailModal || detailModal.hidden) return;
    const id = Number(bookingId || selectedBooking?.id || 0);
    if (!id) return;
    if (selectedBooking && selectedBooking.id !== id) return;
    try {
      const booking = await apiFetch(`/api/admin/bookings/${id}`);
      selectedBooking = booking;
      if (paymentBookingContext?.id === id) {
        paymentBookingContext = booking;
      }
      await renderBookingDetails(booking);
    } catch {
      // Keep the open modal; list refresh still runs separately.
    }
  }

  function closePaymentViewModal() {
    if (paymentViewModal) paymentViewModal.hidden = true;
    const id = paymentBookingContext?.id || selectedBooking?.id;
    if (id) {
      refreshOpenBookingDetails(id);
    }
  }

  async function openAddPaymentModal(booking) {
    if (!paymentAddModal || !booking) return;
    if (booking.isArchived) {
      showBookingMessage('Archived bookings cannot take new payments.', true);
      return;
    }
    if (displayEnum(booking.status) !== 'Confirmed') {
      showBookingMessage(
        'Confirm the booking first. Payments can only be recorded after confirmation.',
        true
      );
      return;
    }
    paymentBookingContext = booking;
    const summary = await loadBookingPaymentSummary(booking);
    if (summary) fillPaymentSummaryFields(booking, summary);

    if (paymentPriceContext.balanceDue <= 0.009) {
      showBookingMessage('This booking is already fully paid.', true);
      await openPaymentViewModal(booking);
      return;
    }

    closePaymentViewModal();

    const defaultAmount = paymentPriceContext.balanceDue;
    const ref = paymentAddModal.querySelector('[data-payment-add-ref]');
    const guestLine = paymentAddModal.querySelector('[data-payment-add-guest]');
    if (ref) ref.textContent = booking.reference;
    if (guestLine) guestLine.textContent = booking.guestName || 'Guest';

    const cashDue = paymentAddModal.querySelector('[data-payment-cash-due]');
    const epayAmount = paymentAddModal.querySelector('[data-payment-epay-amount]');
    const tendered = paymentAddModal.querySelector('[data-payment-cash-tendered]');
    if (cashDue) cashDue.value = defaultAmount.toFixed(2);
    if (epayAmount) epayAmount.value = defaultAmount.toFixed(2);
    if (tendered) tendered.value = '';

    const methodSelect = paymentAddModal.querySelector('[data-payment-method]');
    const hasIncidental = (booking.charges || []).some(
      (c) => String(c.chargeType) === 'Incidental' && Number(c.amount || 0) > 0
    );
    const cashOnlyPromo = Boolean(booking.cashOnlyPromo);
    if (methodSelect) {
      methodSelect.value = 'Cash';
      Array.from(methodSelect.options).forEach((opt) => {
        const lock = cashOnlyPromo && opt.value !== 'Cash';
        opt.disabled = lock;
        opt.hidden = lock;
      });
      methodSelect.disabled = cashOnlyPromo;
    }
    if (hasIncidental && methodSelect) {
      methodSelect.value = 'Cash';
    }
    const notes = paymentAddModal.querySelector('[data-payment-notes]');
    if (notes) {
      if (cashOnlyPromo) {
        notes.value = booking.specialOfferTitle
          ? `Special offer (${booking.specialOfferTitle}) \u2014 cash on arrival only.`
          : 'Special offer \u2014 cash on arrival only.';
      } else if (hasIncidental) {
        notes.value = 'Incidental (damage) on booking \u2014 collect in cash.';
      } else {
        notes.value = '';
      }
    }
    resetPaymentOcrUi();

    updatePaymentPricesUi();
    setPaymentPricesExpanded(false);
    syncPaymentMethodPanels();
    paymentAddModal.hidden = false;
  }

  function closeAddPaymentModal() {
    closePaymentCameraModal();
    closePaymentAddPopup();
    setPaymentAddBanner('');
    resetPaymentOcrUi();
    const methodSelect = paymentAddModal?.querySelector('[data-payment-method]');
    if (methodSelect) {
      methodSelect.disabled = false;
      Array.from(methodSelect.options).forEach((opt) => {
        opt.disabled = false;
        opt.hidden = false;
      });
    }
    if (paymentAddModal) paymentAddModal.hidden = true;
  }

  async function saveRecordedPayment() {
    if (!paymentBookingContext || !paymentAddModal) return;
    const eventType = 'ArrivalPayment';
    const method = paymentAddModal.querySelector('[data-payment-method]')?.value || 'Cash';
    const saveBtn = paymentAddModal.querySelector('[data-payment-add-save]');
    const cash = isCashPaymentMethod(method);

    let amount = cash
      ? Number(paymentAddModal.querySelector('[data-payment-cash-due]')?.value || 0)
      : Number(paymentAddModal.querySelector('[data-payment-epay-amount]')?.value || 0);

    let notes = (paymentAddModal.querySelector('[data-payment-notes]')?.value || '').trim();
    let digitalCapMessage = '';

    if (!cash && paymentOcrBusy) {
      showPaymentAddPopup('Wait for the receipt upload to finish before saving.', 'Still uploading');
      return;
    }

    if (!(amount > 0) && eventType !== 'Refund') {
      showPaymentAddPopup('Select an amount from Price details.', 'Missing amount');
      return;
    }

    if (cash && eventType !== 'Refund') {
      const tendered = Number(paymentAddModal.querySelector('[data-payment-cash-tendered]')?.value || 0);
      if (!(tendered > 0)) {
        showBookingMessage('Enter cash received from the guest.', true);
        return;
      }
      if (tendered + 0.001 < amount) {
        showBookingMessage('Cash from guest is less than the amount due.', true);
        return;
      }
      const change = Math.round((tendered - amount) * 100) / 100;
      const cashNote = `Cash tendered ${money(tendered)} \u00B7 Change ${money(change)}`;
      notes = notes ? `${notes}\n${cashNote}` : cashNote;
    } else if (!cash) {
      const receiptPath = (paymentAddModal.querySelector('[data-payment-receipt-path]')?.value || '').trim();
      if (!receiptPath) {
        showPaymentAddPopup('Attach a receipt photo for e-wallet payment.', 'Missing receipt');
        return;
      }

      // E-wallet (InstaPay QR) \u2014 post only balance due; note excess on the receipt.
      const balanceDue = Math.max(0, Number(paymentPriceContext.balanceDue) || 0);
      if (eventType !== 'Refund' && amount > balanceDue + 0.009) {
        if (!(balanceDue > 0.009)) {
          showPaymentAddPopup('This booking is already fully paid.', 'Already paid');
          return;
        }
        const receiptAmount = Math.round(amount * 100) / 100;
        const applied = Math.round(balanceDue * 100) / 100;
        const excess = Math.round((receiptAmount - applied) * 100) / 100;
        amount = applied;
        const epayAmount = paymentAddModal.querySelector('[data-payment-epay-amount]');
        if (epayAmount) epayAmount.value = applied.toFixed(2);
        const capNote =
          `Receipt/transfer ${money(receiptAmount)} \u00B7 Applied ${money(applied)} (excess ${money(excess)} not posted)`;
        if (!/Receipt\/transfer .* \u00B7 Applied /i.test(notes)) {
          notes = notes ? `${notes}\n${capNote}` : capNote;
        }
        const notesField = paymentAddModal.querySelector('[data-payment-notes]');
        if (notesField) notesField.value = notes;
        digitalCapMessage =
          `Posted ${money(applied)} of ${money(receiptAmount)} receipt (excess ${money(excess)} not posted).`;
      }
    }

    const receiptImagePath = cash
      ? null
      : (paymentAddModal.querySelector('[data-payment-receipt-path]')?.value || '').trim() || null;

    if (saveBtn) saveBtn.disabled = true;
    try {
      await apiFetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: paymentBookingContext.id,
          eventType,
          method,
          amount: eventType === 'Refund' ? -Math.abs(amount) : amount,
          externalReference: null,
          bankTransferReference: null,
          notes: notes || null,
          receiptImagePath,
        }),
      });
      const bookingId = paymentBookingContext.id;
      closeAddPaymentModal();
      showBookingMessage(
        digitalCapMessage
          ? `Payment saved. ${digitalCapMessage}`
          : 'Payment saved. Posted records cannot be edited.'
      );
      await Promise.all([refreshBookings(), refreshOpenBookingDetails(bookingId)]);
      if (paymentBookingContext) {
        await openPaymentViewModal(paymentBookingContext);
      } else if (selectedBooking?.id === bookingId) {
        await openPaymentViewModal(selectedBooking);
      }
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to record payment.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function setFlushLogExpanded(expanded) {
    if (!flushLogToggle || !flushLogBody) return;
    flushLogToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    flushLogBody.hidden = !expanded;
    flushLogToggle.classList.toggle('is-open', expanded);
    updateFlushLogCountLabel(flushLogsCache.length, expanded);
  }

  function updateFlushLogCountLabel(count, expanded) {
    if (!flushLogCount) return;
    const state = expanded ? 'Open' : 'Closed';
    if (!count) {
      flushLogCount.textContent = `${state} \u00B7 no export actions yet \u00B7 kept 7 days`;
      return;
    }
    flushLogCount.textContent = `${state} \u00B7 ${count} export action${count === 1 ? '' : 's'} \u00B7 kept 7 days`;
  }

  function openFlushDetail(log) {
    if (!flushDetailModal || !flushDetailBody) return;
    if (flushDetailFile) flushDetailFile.textContent = log.fileName || 'Export record';
    const lines = String(log.summary || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const fields = [
      ['When (PH)', formatDateTime(log.flushedAtUtc)],
      ['Performed by', log.performedBy || '\u2014'],
      ['Records deleted', String(log.recordCount ?? 0)],
      ['PDF softcopy', log.fileName || '\u2014'],
      ['Expires (PH)', formatDateTime(log.expiresAtUtc)],
    ];
    flushDetailBody.replaceChildren();
    const grid = document.createElement('dl');
    grid.className = 'admin-flush-detail-grid';
    fields.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      grid.append(dt, dd);
    });
    flushDetailBody.appendChild(grid);
    if (lines.length) {
      const title = document.createElement('h3');
      title.className = 'admin-flush-detail-subtitle';
      title.textContent = 'Important details';
      flushDetailBody.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'admin-flush-detail-points';
      lines.forEach((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      });
      flushDetailBody.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'No extra summary was stored for this data export.';
      flushDetailBody.appendChild(empty);
    }
    flushDetailModal.hidden = false;
  }

  function closeFlushDetail() {
    if (flushDetailModal) flushDetailModal.hidden = true;
  }

  async function refreshFlushLogs() {
    if (!flushLogList || !history) return;
    flushLogList.innerHTML =
      '<tr><td colspan="6" class="admin-bookings-loading">Loading export log\u2026</td></tr>';
    try {
      const logs = await apiFetch('/api/admin/bookings/history/flush-logs');
      flushLogsCache = Array.isArray(logs) ? logs : [];
      const isOpen = flushLogToggle?.getAttribute('aria-expanded') === 'true';
      updateFlushLogCountLabel(flushLogsCache.length, isOpen);
      flushLogList.replaceChildren();
      if (!flushLogsCache.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'admin-bookings-loading';
        cell.textContent = 'No export actions yet.';
        row.appendChild(cell);
        flushLogList.appendChild(row);
        return;
      }
      flushLogsCache.forEach((log) => {
        const row = document.createElement('tr');
        const cells = [
          formatDateTime(log.flushedAtUtc),
          log.performedBy || '\u2014',
          String(log.recordCount ?? 0),
          log.fileName || '\u2014',
          formatDateTime(log.expiresAtUtc),
        ];
        cells.forEach((text, index) => {
          const td = document.createElement('td');
          if (index === 3) {
            td.className = 'admin-export-file-cell';
            const file = document.createElement('span');
            file.className = 'admin-export-file-name';
            file.textContent = text;
            td.appendChild(file);
          } else {
            td.textContent = text;
          }
          row.appendChild(td);
        });
        const action = document.createElement('td');
        action.className = 'admin-booking-table-actions';
        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'View';
        view.addEventListener('click', () => openFlushDetail(log));
        action.appendChild(view);
        row.appendChild(action);
        flushLogList.appendChild(row);
      });
    } catch (error) {
      flushLogsCache = [];
      updateFlushLogCountLabel(0, flushLogToggle?.getAttribute('aria-expanded') === 'true');
      flushLogList.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'admin-bookings-loading';
      cell.textContent = error instanceof Error ? error.message : 'Unable to load export log.';
      row.appendChild(cell);
      flushLogList.appendChild(row);
    }
  }

  function openFlushModal() {
    if (!flushModal) return;
    if (flushByInput) {
      flushByInput.value = localStorage.getItem('moriHistoryFlushBy') || '';
      flushByInput.focus();
    }
    flushModal.hidden = false;
  }

  function closeFlushModal() {
    if (flushModal) flushModal.hidden = true;
  }

  async function confirmFlushHistory() {
    const performedBy = (flushByInput?.value || '').trim();
    if (performedBy.length < 2) {
      showBookingMessage('Enter the staff name who is exporting history.', true);
      flushByInput?.focus();
      return;
    }
    if (
      !window.confirm(
        'Export all history to a branded PDF, save it to this device, then permanently delete those history records?'
      )
    ) {
      return;
    }

    if (flushConfirmButton) {
      flushConfirmButton.disabled = true;
      flushConfirmButton.dataset.exportLabel = flushConfirmButton.textContent || '';
      flushConfirmButton.textContent = 'Exporting\u2026';
    }
    window.setAdminExportLoading?.(true, {
      title: 'Exporting history\u2026',
      detail: 'Building branded PDF softcopy and deleting archived history. Please wait.',
    });
    try {
      const result = await apiFetchBlob('/api/admin/bookings/history/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
        body: JSON.stringify({ performedBy }),
      });
      localStorage.setItem('moriHistoryFlushBy', performedBy);
      downloadBlob(result.blob, result.fileName);
      closeFlushModal();
      page = 1;
      await Promise.all([refreshBookings(), refreshFlushLogs()]);
      showBookingMessage(
        `History exported (${result.recordCount || 'all'} records). PDF saved as ${result.fileName}.`
      );
    } catch (error) {
      showBookingMessage(
        window.friendlyAdminExportError?.(error, 'Unable to export history.')
          || (error instanceof Error ? error.message : 'Unable to export history.'),
        true
      );
    } finally {
      window.setAdminExportLoading?.(false);
      if (flushConfirmButton) {
        flushConfirmButton.disabled = false;
        flushConfirmButton.textContent =
          flushConfirmButton.dataset.exportLabel || 'Export PDF & delete history';
        delete flushConfirmButton.dataset.exportLabel;
      }
    }
  }

  function displayEnum(value) {
    if (value === 'CheckedOut') return 'Checked out';
    if (typeof value === 'string') return value;
    return String(value ?? '');
  }

  const PH_TZ = 'Asia/Manila';
  const PH_LOCALE = 'en-PH';

  /** API DateTimes are UTC; EF often omits `Z`, so browsers would misread them as local. */
  function parseUtc(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const iso = hasZone || !/T/.test(raw) ? raw : `${raw}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function manilaParts(value) {
    const date = parseUtc(value);
    if (!date) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: PH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${get('hour')}:${get('minute')}`,
    };
  }

  function formatDate(value) {
    if (!value) return '\u2014';
    const date = parseUtc(value);
    return date
      ? date.toLocaleDateString(PH_LOCALE, {
          timeZone: PH_TZ,
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : String(value);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = parseUtc(value);
    return date
      ? date.toLocaleString(PH_LOCALE, {
          timeZone: PH_TZ,
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
  }

  function formatTime(value) {
    if (!value) return '\u2014';
    const date = parseUtc(value);
    return date
      ? date.toLocaleTimeString(PH_LOCALE, {
          timeZone: PH_TZ,
          hour: 'numeric',
          minute: '2-digit',
        })
      : '\u2014';
  }

  function formatStayRange(checkIn, checkOut) {
    return `${formatDateTime(checkIn) || formatDate(checkIn)} \u2192 ${formatDateTime(checkOut) || formatDate(checkOut)}`;
  }

  function daytimeCallStateKey(localDateIso, kind, bookingId) {
    const date = String(localDateIso || '').slice(0, 10);
    return `${date}|${kind}|${Number(bookingId || 0)}`;
  }

  function isDaytimeCallDone(localDateIso, kind, bookingId) {
    const key = daytimeCallStateKey(localDateIso, kind, bookingId);
    return Boolean(daytimeCallState[key]);
  }

  function setDaytimeCallDone(localDateIso, kind, bookingId, done) {
    const key = daytimeCallStateKey(localDateIso, kind, bookingId);
    if (done) daytimeCallState[key] = true;
    else delete daytimeCallState[key];
    writeDaytimeCallState(daytimeCallState);
  }

  function toManilaDateTimeIso(dateStr, timeStr) {
    const date = String(dateStr || '').slice(0, 10);
    const time = String(timeStr || '00:00').slice(0, 5);
    return `${date}T${time}:00+08:00`;
  }

  function money(value) {
    return `\u20B1${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setBadge(unread) {
    if (!badge) return;
    const count = Math.max(0, Number(unread || 0));
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    bell?.setAttribute(
      'aria-label',
      count ? `Open ${count} unread booking notifications` : 'Open booking notifications'
    );
  }

  function notificationNode(item) {
    const itemContainer = document.createElement('div');
    itemContainer.className = `admin-notification-item${item.isRead ? '' : ' is-unread'}`;

    const contentBtn = document.createElement('button');
    contentBtn.type = 'button';
    contentBtn.className = 'admin-notification-content';

    const title = document.createElement('strong');
    title.textContent = `${item.reference} \u00B7 ${item.guestName}`;
    const meta = document.createElement('span');
    meta.textContent = `${displayEnum(item.kind)} \u00B7 ${formatDateTime(item.checkInAtUtc || item.checkIn) || formatDate(item.checkInAtUtc || item.checkIn)}`;
    const time = document.createElement('small');
    time.textContent = formatDateTime(item.createdAtUtc);
    contentBtn.append(title, meta, time);

    if (item.message) {
      const msg = document.createElement('div');
      const isAlert = /warning|arrival|call guest|checkout|auto-cancelled/i.test(item.message);
      msg.className = `admin-notification-msg ${isAlert ? 'is-warning' : 'is-info'}`;
      msg.textContent = item.message;
      contentBtn.append(msg);
    }

    contentBtn.addEventListener('click', () => {
      void openBookingFromNotification(item);
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'admin-notification-dismiss';
    dismissBtn.setAttribute('aria-label', 'Clear notification');
    dismissBtn.title = 'Clear notification';
    dismissBtn.innerHTML = '&times;';
    dismissBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissBtn.disabled = true;
      try {
        await apiFetch(`/api/admin/bookings/${item.id}/read`, { method: 'POST' });
        itemContainer.remove();
        if (notificationItems && !notificationItems.querySelector('.admin-notification-item')) {
          notificationItems.replaceChildren();
          const empty = document.createElement('p');
          empty.className = 'admin-notification-empty';
          empty.textContent = 'No new notifications.';
          notificationItems.append(empty);
          setBadge(0);
        } else {
          const remaining = notificationItems?.querySelectorAll('.admin-notification-item.is-unread').length
            ?? notificationItems?.querySelectorAll('.admin-notification-item').length
            ?? 0;
          setBadge(remaining);
        }
      } catch (error) {
        dismissBtn.disabled = false;
        console.error('Failed to clear notification:', error);
        window.alert(error instanceof Error ? error.message : 'Could not clear this notification.');
      }
    });

    itemContainer.append(contentBtn, dismissBtn);
    return itemContainer;
  }

  async function refreshNotifications() {
    if (notificationItems && !notificationItems.querySelector('.admin-notification-item')) {
      renderNotificationsSkeleton();
    }
    try {
      const payload = await apiFetch('/api/admin/bookings/notifications?limit=10');
      setBadge(payload.unread);
      if (!notificationItems) return;
      notificationItems.replaceChildren();
      if (!payload.items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-notification-empty';
        empty.textContent = 'No new notifications.';
        notificationItems.append(empty);
        return;
      }
      payload.items.forEach((item) => notificationItems.append(notificationNode(item)));
    } catch (error) {
      if (notificationItems) {
        notificationItems.textContent = error instanceof Error ? error.message : 'Unable to load notifications.';
      }
    }
  }

  function showBookingMessage(message, isError = false) {
    if (!bookingMessage) return;
    bookingMessage.hidden = !message;
    bookingMessage.textContent = message || '';
    bookingMessage.classList.toggle('is-error', isError);
  }

  function setArrivalsMode(active) {
    if (!arrivalsPanel) return;
    if (active) {
      if (pendingCallsPanel) pendingCallsPanel.hidden = true;
      if (checkoutsPanel) checkoutsPanel.hidden = true;
      if (daytimeFlowPanel) daytimeFlowPanel.hidden = true;
    }
    arrivalsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function setPendingCallsMode(active) {
    if (!pendingCallsPanel) return;
    if (active) {
      if (arrivalsPanel) arrivalsPanel.hidden = true;
      if (checkoutsPanel) checkoutsPanel.hidden = true;
      if (daytimeFlowPanel) daytimeFlowPanel.hidden = true;
    }
    pendingCallsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function setCheckoutsMode(active) {
    if (!checkoutsPanel) return;
    if (active) {
      if (arrivalsPanel) arrivalsPanel.hidden = true;
      if (pendingCallsPanel) pendingCallsPanel.hidden = true;
      if (daytimeFlowPanel) daytimeFlowPanel.hidden = true;
    }
    checkoutsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function setDaytimeFlowMode(active) {
    if (!daytimeFlowPanel) return;
    if (active) {
      if (arrivalsPanel) arrivalsPanel.hidden = true;
      if (pendingCallsPanel) pendingCallsPanel.hidden = true;
      if (checkoutsPanel) checkoutsPanel.hidden = true;
    }
    daytimeFlowPanel.hidden = !active;
    if (daytimeFlowToolbar) daytimeFlowToolbar.hidden = !active;
    bookingsRoot
      ?.querySelector('[data-room-type-availability]')
      ?.toggleAttribute('hidden', Boolean(active));
    syncListChromeHidden();
  }

  function syncListChromeHidden() {
    const specialOpen = (arrivalsPanel && !arrivalsPanel.hidden)
      || (pendingCallsPanel && !pendingCallsPanel.hidden)
      || (checkoutsPanel && !checkoutsPanel.hidden)
      || (daytimeFlowPanel && !daytimeFlowPanel.hidden);
    if (daytimeFlowToolbar) daytimeFlowToolbar.hidden = !daytimeFlowPanel || daytimeFlowPanel.hidden;
    bookingsRoot?.querySelector('.admin-bookings-toolbar')?.toggleAttribute('hidden', specialOpen);
    bookingsRoot?.querySelector('.admin-bookings-table-wrap')?.toggleAttribute('hidden', specialOpen);
    bookingsRoot?.querySelector('.admin-bookings-pagination')?.toggleAttribute('hidden', specialOpen);
  }

  function arrivalCard(booking) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-arrival-card';
    const rooms = (booking.items || [])
      .flatMap((line) => {
        const assigned = (line.assignedRooms || []).map((room) => room.roomNumber).filter(Boolean);
        return assigned.length
          ? assigned
          : [`${line.quantity}\u00D7 ${line.roomTypeName}`];
      })
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} \u00B7 ${booking.guestName}`;
    const meta = document.createElement('span');
    meta.textContent = rooms || 'Rooms pending assignment';
    const time = document.createElement('small');
    time.textContent = `Check-in ${formatDateTime(booking.checkInAtUtc || booking.checkIn)}`;
    button.append(title, meta, time);
    button.addEventListener('click', () => openBookingDetails(booking.id, booking));
    return button;
  }

  function pendingCallCard(booking) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-arrival-card';
    const rooms = (booking.items || [])
      .map((line) => `${line.quantity}\u00D7 ${line.roomTypeName}`)
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} \u00B7 ${booking.guestName}`;
    const phone = document.createElement('span');
    phone.textContent = booking.guestPhone ? `Call ${booking.guestPhone}` : 'No phone on file';
    const meta = document.createElement('span');
    meta.textContent = rooms || 'No rooms';
    const time = document.createElement('small');
    time.textContent = `Check-in ${formatDateTime(booking.checkInAtUtc || booking.checkIn)}`;
    button.append(title, phone, meta, time);
    button.addEventListener('click', () => openBookingDetails(booking.id, booking));
    return button;
  }

  function checkoutCallCard(booking) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-arrival-card';
    const rooms = (booking.items || [])
      .flatMap((line) => {
        const assigned = (line.assignedRooms || []).map((room) => room.roomNumber).filter(Boolean);
        return assigned.length
          ? assigned
          : [`${line.quantity}\u00D7 ${line.roomTypeName}`];
      })
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} \u00B7 ${booking.guestName}`;
    const phone = document.createElement('span');
    phone.textContent = booking.guestPhone
      ? `Call ${booking.guestPhone} \u2014 ask about late checkout`
      : 'No phone on file \u2014 ask about late checkout';
    const meta = document.createElement('span');
    meta.textContent = rooms || 'Rooms pending assignment';
    const time = document.createElement('small');
    time.textContent = `Checkout ${formatDateTime(booking.checkoutTimeUtc || booking.checkOut)}`;
    button.append(title, phone, meta, time);
    button.addEventListener('click', () => openBookingDetails(booking.id, booking));
    return button;
  }

  function daytimeFlowCard(booking, kind, localDateIso) {
    const card = document.createElement('article');
    card.className = 'admin-arrival-card admin-daytime-card';
    const rooms = (booking.items || [])
      .flatMap((line) => {
        const assigned = (line.assignedRooms || []).map((room) => room.roomNumber).filter(Boolean);
        return assigned.length
          ? assigned
          : [`${line.quantity}\u00D7 ${line.roomTypeName}`];
      })
      .join(', ');
    const calledDone = isDaytimeCallDone(localDateIso, kind, booking.id);
    card.classList.toggle('is-needs-call', !calledDone);
    card.classList.toggle('is-call-done', calledDone);

    const topRow = document.createElement('div');
    topRow.className = 'admin-daytime-top';
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} \u00B7 ${booking.guestName}`;
    const timeBadge = document.createElement('span');
    timeBadge.className = 'admin-daytime-time-badge';
    timeBadge.textContent = kind === 'arrival'
      ? `Arrive at ${formatTime(booking.checkInAtUtc || booking.checkIn)}`
      : `Checkout at ${formatTime(booking.checkoutTimeUtc || booking.checkOut)}`;

    topRow.append(title, timeBadge);

    const callLine = document.createElement('span');
    callLine.className = 'admin-daytime-call-line';
    callLine.textContent = booking.guestPhone
      ? `Call ${booking.guestPhone}`
      : 'No phone number on file';

    const status = document.createElement('span');
    status.textContent = `Status: ${displayEnum(booking.status)}`;
    const meta = document.createElement('span');
    meta.textContent = rooms || 'Rooms pending assignment';
    const time = document.createElement('small');
    time.textContent = kind === 'arrival'
      ? `Check-in ${formatDateTime(booking.checkInAtUtc || booking.checkIn)}`
      : `Checkout ${formatDateTime(booking.checkoutTimeUtc || booking.checkOut)}`;

    const actions = document.createElement('div');
    actions.className = 'admin-daytime-actions';
    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'admin-daytime-action';
    detailsBtn.textContent = 'Open details';
    detailsBtn.addEventListener('click', () => {
      setDaytimeCallDone(localDateIso, kind, booking.id, true);
      syncMarkVisual(true);
      openBookingDetails(booking.id, booking);
    });

    const syncMarkVisual = (done) => {
      card.classList.toggle('is-needs-call', !done);
      card.classList.toggle('is-call-done', done);
    };
    syncMarkVisual(calledDone);

    actions.append(detailsBtn);
    card.append(topRow, callLine, status, meta, time, actions);
    return card;
  }

  async function refreshArrivals() {
    if (!arrivalsList) return;
    arrivalsList.innerHTML = '<p class="admin-bookings-loading">Loading arrivals\u2026</p>';
    try {
      const items = await apiFetch('/api/admin/bookings/arrivals?windowMinutes=20');
      arrivalsList.replaceChildren();
      if (!items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-bookings-empty';
        empty.textContent = 'No confirmed guests arriving in the next 20 minutes.';
        arrivalsList.append(empty);
        return;
      }
      items.forEach((booking) => arrivalsList.append(arrivalCard(booking)));
    } catch (error) {
      arrivalsList.textContent = error instanceof Error ? error.message : 'Unable to load arrivals.';
    }
  }

  async function refreshPendingCalls() {
    if (!pendingCallsList) return;
    pendingCallsList.innerHTML = '<p class="admin-bookings-loading">Loading pending calls\u2026</p>';
    try {
      const items = await apiFetch('/api/admin/bookings/pending-calls?windowMinutes=20');
      pendingCallsList.replaceChildren();
      if (!items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-bookings-empty';
        empty.textContent = 'No pending guests to call in the next 20 minutes.';
        pendingCallsList.append(empty);
        return;
      }
      items.forEach((booking) => pendingCallsList.append(pendingCallCard(booking)));
    } catch (error) {
      pendingCallsList.textContent = error instanceof Error ? error.message : 'Unable to load pending calls.';
    }
  }

  async function refreshCheckouts() {
    if (!checkoutsList) return;
    checkoutsList.innerHTML = '<p class="admin-bookings-loading">Loading checkouts\u2026</p>';
    try {
      const items = await apiFetch('/api/admin/bookings/checkouts?windowMinutes=20');
      checkoutsList.replaceChildren();
      if (!items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-bookings-empty';
        empty.textContent = 'No confirmed stays checking out in the next 20 minutes.';
        checkoutsList.append(empty);
        return;
      }
      items.forEach((booking) => checkoutsList.append(checkoutCallCard(booking)));
    } catch (error) {
      checkoutsList.textContent = error instanceof Error ? error.message : 'Unable to load checkouts.';
    }
  }

  function formatDaytimeDateLabel(localDateIso) {
    if (!localDateIso) return 'today';
    const dt = new Date(`${localDateIso}T00:00:00`);
    return Number.isNaN(dt.getTime())
      ? localDateIso
      : dt.toLocaleDateString(PH_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function refreshDaytimeFlow() {
    if (!daytimeArrivalsList || !daytimeCheckoutsList) return;
    daytimeArrivalsList.innerHTML = '<p class="admin-bookings-loading">Loading daytime arrivals\u2026</p>';
    daytimeCheckoutsList.innerHTML = '<p class="admin-bookings-loading">Loading daytime checkouts\u2026</p>';
    try {
      const payload = await apiFetch('/api/admin/bookings/daytime-flow?startHour=6&endHour=18');
      const arrivals = payload?.arrivals || [];
      const checkouts = payload?.checkouts || [];
      const dateLabel = formatDaytimeDateLabel(payload?.localDateIso);
      const startHour = Number(payload?.startHour ?? 6);
      const endHour = Number(payload?.endHour ?? 18);
      daytimeFlowLocalDateIso = String(payload?.localDateIso || '');

      if (daytimeArrivalsTitle) {
        daytimeArrivalsTitle.textContent = `Arrivals \u00B7 ${dateLabel} (${startHour}:00-${endHour}:59)`;
      }
      if (daytimeCheckoutsTitle) {
        daytimeCheckoutsTitle.textContent = `Checkouts \u00B7 ${dateLabel} (${startHour}:00-${endHour}:59)`;
      }

      daytimeArrivalsList.replaceChildren();
      const visibleArrivals = arrivals.filter((booking) => booking.status === 'Pending');
      if (!visibleArrivals.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-bookings-empty';
        empty.textContent = 'No daytime arrivals for today.';
        daytimeArrivalsList.append(empty);
      } else {
        visibleArrivals.forEach((booking) => daytimeArrivalsList.append(daytimeFlowCard(booking, 'arrival', daytimeFlowLocalDateIso)));
      }

      daytimeCheckoutsList.replaceChildren();
      const visibleCheckouts = checkouts.filter((booking) => booking.status === 'Pending');
      if (!visibleCheckouts.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-bookings-empty';
        empty.textContent = 'No daytime checkouts for today.';
        daytimeCheckoutsList.append(empty);
      } else {
        visibleCheckouts.forEach((booking) => daytimeCheckoutsList.append(daytimeFlowCard(booking, 'checkout', daytimeFlowLocalDateIso)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load daytime flow.';
      daytimeArrivalsList.textContent = message;
      daytimeCheckoutsList.textContent = message;
    }
  }

  async function openArrivalsSoon() {
    setArrivalsMode(true);
    await refreshArrivals();
  }

  async function openPendingCallsSoon() {
    setPendingCallsMode(true);
    await refreshPendingCalls();
  }

  async function openCheckoutsSoon() {
    setCheckoutsMode(true);
    await refreshCheckouts();
  }

  async function openDaytimeFlow() {
    setDaytimeFlowMode(true);
    await refreshDaytimeFlow();
  }

  function closeArrivalsSoon() {
    setArrivalsMode(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('arrivals')) {
      url.searchParams.delete('arrivals');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }

  function closePendingCallsSoon() {
    setPendingCallsMode(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('pendingCalls')) {
      url.searchParams.delete('pendingCalls');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }

  function closeCheckoutsSoon() {
    setCheckoutsMode(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('checkouts')) {
      url.searchParams.delete('checkouts');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }

  function closeDaytimeFlow() {
    setDaytimeFlowMode(false);
  }

  function refreshActiveBookingPanel() {
    if (isLeavingBookingsPage) return Promise.resolve();
    if (!arrivalsPanel?.hidden) return refreshArrivals();
    if (!pendingCallsPanel?.hidden) return refreshPendingCalls();
    if (!checkoutsPanel?.hidden) return refreshCheckouts();
    if (!daytimeFlowPanel?.hidden) return refreshDaytimeFlow();
    return refreshBookings();
  }

  async function processAutoCheckout() {
    try {
      await apiFetch('/api/admin/bookings/process-auto-checkout', { method: 'POST' });
    } catch {
      // Background service also processes; poll helper is best-effort.
    }
  }

  function bookingNeedsRooms(booking) {
    const status = displayEnum(booking.status);
    if (status !== 'Confirmed') return false;
    const items = booking.items || [];
    if (!items.length) return true;
    const needed = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const assigned = items.reduce(
      (sum, line) => sum + (line.assignedRooms || []).length,
      0
    );
    return assigned < needed;
  }

  /**
   * Confirmed + rooms assigned + in-house window (PH calendar).
   * Starts on the Manila arrival date once rooms are assigned (not only after 2:00 PM),
   * and ends at checkout time.
   */
  function isGuestOccupying(booking) {
    if (displayEnum(booking.status) !== 'Confirmed') return false;
    if (bookingNeedsRooms(booking)) return false;
    const checkOut = parseUtc(booking.checkoutTimeUtc || booking.checkOut);
    if (!checkOut) return false;
    if (Date.now() >= checkOut.getTime()) return false;
    const arrivalDate = manilaParts(booking.checkInAtUtc || booking.checkIn)?.date;
    if (!arrivalDate) return false;
    return manilaTodayIso() >= arrivalDate;
  }

  function bookingStatusPill(booking) {
    if (isGuestOccupying(booking)) {
      return {
        label: 'Occupying',
        className: 'is-occupying',
        title: 'Guest is currently in-house',
      };
    }
    const status = displayEnum(booking.status);
    const raw = String(booking.status || status).toLowerCase().replace(/\s+/g, '');
    return {
      label: status,
      className: `is-${raw}`,
      title: '',
    };
  }

  function manilaTodayIso() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: PH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  /** Rooms may be assigned from the Manila arrival date onward \u2014 not earlier. */
  function canAssignRoomsToday(booking) {
    const arrival = manilaParts(booking.checkInAtUtc || booking.checkIn)?.date;
    if (!arrival) return false;
    return manilaTodayIso() >= arrival;
  }

  function arrivalAssignMessage(booking) {
    const arrival = formatDate(booking.checkInAtUtc || booking.checkIn);
    return (
      `Assign rooms is locked until the check-in date (${arrival}, Philippines time). ` +
      `Payment can be recorded anytime after confirmation. ` +
      `If the guest arrives earlier, use Adjust stay to move check-in \u2014 then assign rooms once that date is today and the stay is fully paid.`
    );
  }

  function isBookingFullyPaid(booking, summary = null) {
    if (summary) {
      fillPaymentSummaryFields(booking, summary);
    }
    return Number(paymentPriceContext.balanceDue) <= 0.009;
  }

  function canRecordPayment(booking) {
    if (!booking || booking.isArchived) return false;
    return displayEnum(booking.status) === 'Confirmed';
  }

  function formatBookingRooms(booking) {
    const items = booking.items || [];
    if (!items.length) return 'No rooms';

    const parts = items.map((line) => {
      const assigned = (line.assignedRooms || [])
        .map((room) => room.roomNumber)
        .filter(Boolean);
      const qty = Number(line.quantity || 0);
      const typeName = line.roomTypeName || 'Room';
      if (assigned.length) {
        return assigned.length === 1
          ? `${typeName} ${assigned[0]}`
          : `${typeName}: ${assigned.join(', ')}`;
      }
      return `${qty}\u00D7 ${typeName}`;
    });

    let label = parts.join(' \u00B7 ');
    if (bookingNeedsRooms(booking)) {
      label += ' \u00B7 not assigned';
    }
    return label;
  }

  function bookingRow(booking) {
    const row = document.createElement('tr');
    const status = displayEnum(booking.status);
    const needsRooms = bookingNeedsRooms(booking);
    const occupying = isGuestOccupying(booking);
    const statusPill = bookingStatusPill(booking);
    row.dataset.bookingId = String(booking.id);
    row.className = `is-${status.toLowerCase()}${needsRooms ? ' is-needs-rooms' : ''}${occupying ? ' is-occupying' : ''}`;

    const roomLabel = formatBookingRooms(booking);

    [
      ['Reference', booking.reference],
      ['Guest', booking.guestName],
      ['Stay', formatStayRange(booking.checkInAtUtc || booking.checkIn, booking.checkoutTimeUtc || booking.checkOut)],
      ['Rooms', roomLabel],
      ['Type', displayEnum(booking.kind)],
      ['Total', money(booking.totalAmount)],
    ].forEach(([label, value], index) => {
      const cell = document.createElement('td');
      cell.dataset.label = label;
      if (label === 'Guest') {
        cell.className = 'admin-booking-guest-cell';
        const name = document.createElement('span');
        name.textContent = value;
        cell.append(name);
        if (booking.specialOfferId || booking.cashOnlyPromo) {
          const tag = document.createElement('span');
          tag.className = 'admin-booking-status is-special-offer';
          tag.textContent = booking.cashOnlyPromo ? 'Special offer \u00B7 Cash' : 'Special offer';
          tag.title = booking.specialOfferTitle
            ? `Special offer: ${booking.specialOfferTitle}`
            : 'Guest booked a special offer';
          cell.append(tag);
        }
        if (booking.exceedsAvailableInventory) {
          const warn = document.createElement('span');
          warn.className = 'admin-booking-status is-inventory-warning';
          warn.textContent = displayEnum(booking.kind) === 'Reservation' ? 'Over capacity' : 'Overbooked';
          warn.title =
            'This stay requests more rooms than inventory allows for these dates (pending and confirmed holds).';
          cell.append(warn);
        }
      } else {
        cell.textContent = value;
      }
      if (index === 0) cell.className = 'admin-booking-reference';
      if (label === 'Rooms' && needsRooms) {
        cell.classList.add('is-needs-rooms-cell');
      }
      row.append(cell);
    });

    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Status';
    statusCell.className = 'admin-booking-status-cell';
    const pill = document.createElement('span');
    pill.className = `admin-booking-status ${statusPill.className}`;
    pill.textContent = statusPill.label;
    if (statusPill.title) pill.title = statusPill.title;
    statusCell.append(pill);
    if (needsRooms) {
      const flag = document.createElement('span');
      flag.className = 'admin-booking-status is-needs-rooms';
      flag.textContent = canAssignRoomsToday(booking) ? 'Assign rooms' : 'Ready on arrival';
      flag.title = canAssignRoomsToday(booking)
        ? 'Confirmed \u2014 finish payment if needed, then assign room numbers'
        : arrivalAssignMessage(booking);
      statusCell.append(flag);
    }

    const actionCell = document.createElement('td');
    actionCell.className = 'admin-booking-table-actions';
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.textContent =
      needsRooms && canAssignRoomsToday(booking) ? 'Manage booking' : 'View details';
    viewButton.addEventListener('click', () => openBookingDetails(booking.id, booking));
    actionCell.append(viewButton);

    row.append(statusCell, actionCell);
    return row;
  }

  function closeBookingDetails() {
    if (!detailModal) return;
    detailModal.hidden = true;
    selectedBooking = null;
    // Keep receptionExtrasStageBookingId so reopening the same guest stays on Checkout (step 5).
    clearReceptionFlowPath();
    hideCheckoutConfirmModal();
    hideExtrasStageIntro();
    document.body.classList.remove('admin-booking-modal-open');
    calendarDayModal?.removeAttribute('inert');
  }

  /** Field row for guest details \u2014 plain label/value blocks (never dl/dt/dd). */
  function detailField(label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-booking-detail-field';
    const term = document.createElement('span');
    term.className = 'admin-booking-detail-field-label';
    term.textContent = label;
    const detail = document.createElement('div');
    detail.className = 'admin-booking-detail-field-value';
    if (value != null && typeof value === 'object' && value.nodeType) {
      detail.append(value);
      if (!detail.textContent.trim() && detail.childElementCount === 0) {
        detail.textContent = '\u2014';
      }
    } else {
      const text = String(value ?? '').trim();
      detail.textContent = text || '\u2014';
    }
    wrapper.append(term, detail);
    return wrapper;
  }

  function actionIconButton({ label, icon, onClick, className = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `admin-booking-action-icon ${className}`.trim();
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `
      <span class="admin-booking-action-glyph" aria-hidden="true">${icon}</span>
      <span class="admin-booking-action-tip">${label}</span>
    `;
    button.addEventListener('click', onClick);
    return button;
  }

  /** Primary next-step control with step badge, optional icon, and visible text. */
  function actionFlowButton({ step, label, onClick, className = '', icon = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `admin-booking-flow-btn ${className}`.trim();
    button.setAttribute('aria-label', label);
    if (step) {
      const badge = document.createElement('span');
      badge.className = 'admin-booking-flow-btn-step';
      badge.textContent = String(step);
      button.append(badge);
    }
    if (icon) {
      const glyph = document.createElement('span');
      glyph.className = 'admin-booking-flow-btn-icon';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.innerHTML = icon;
      button.append(glyph);
    }
    const text = document.createElement('span');
    text.className = 'admin-booking-flow-btn-label';
    text.textContent = label;
    button.append(text);
    button.addEventListener('click', onClick);
    return button;
  }

  function resolveReceptionFlowStep({
    status,
    balanceDue,
    hasAssignedRooms,
    isArchived,
    occupying = false,
    extrasStage = false,
  }) {
    const steps = [
      { id: 'confirm', label: 'Confirm', short: '1', icon: 'confirm' },
      { id: 'pay', label: 'Payment', short: '2', icon: 'pay' },
      { id: 'rooms', label: 'Room', short: '3', icon: 'rooms' },
      { id: 'fees', label: 'Fees', short: '4', icon: 'fees' },
      { id: 'checkout', label: 'Checkout', short: '5', icon: 'checkout' },
      { id: 'archive', label: 'Archive', short: '6', icon: 'archive' },
    ];

    let current = 'confirm';
    if (isArchived || status === 'CheckedOut' || status === 'Cancelled' || status === 'Rejected') {
      current = 'archive';
    } else if (status === 'Pending') {
      current = 'confirm';
    } else if (status === 'Confirmed') {
      if (occupying && hasAssignedRooms) {
        // Fees until receptionist continues -> Checkout (incidental / snacks), then Archive.
        current = extrasStage ? 'checkout' : 'fees';
      } else if (balanceDue > 0.009) current = 'pay';
      else if (!hasAssignedRooms) current = 'rooms';
      else current = 'fees';
    }

    const currentIndex = Math.max(0, steps.findIndex((s) => s.id === current));
    let hint = 'Follow the highlighted step.';
    if (isArchived) {
      hint = 'Booking archived.';
    } else if (status === 'Pending') {
      hint = 'Next: confirm \u2014 payment unlocks after confirmation.';
    } else if (current === 'pay') {
      hint = `Next: record payment \u00B7 due ${money(balanceDue)}.`;
    } else if (current === 'rooms') {
      hint = 'Next: assign room (fully paid).';
    } else if (current === 'fees') {
      hint = occupying
        ? 'Add stay fees and snack & beverage if needed, then continue to Checkout for incidental damages.'
        : 'Add stay fees and snack & beverage if needed. Incidental damages record at Checkout.';
    } else if (current === 'checkout') {
      hint =
        balanceDue > 0.009
          ? `Record incidental damages if any, then settle balance ${money(balanceDue)} before Archive.`
          : 'Record incidental damages if any, then Archive (fully paid).';
    } else if (current === 'archive') {
      hint = 'Ready to archive this stay.';
    }

    return { steps, current, currentIndex, hint };
  }

  const FLOW_STEP_ICONS = {
    confirm:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3H3V7zm0 5h18v7H3v-7zm3 2.5h6v2H6v-2z" fill="currentColor"/></svg>',
    rooms:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9H4v-9zm2-4h12l1 4H5l1-4zm4 8h6v2h-6v-2z" fill="currentColor"/></svg>',
    fees: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 12h10M7 17h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/></svg>',
    checkout:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v14h-5M10 12H3m0 0 3-3M3 12l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    archive:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v3H4V7zm1 3h14v9H5v-9zm4 3h6v2H9v-2z" fill="currentColor"/></svg>',
    done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /** Slim header progress path with icon + label steps. Room step can reopen assign. */
  function updateReceptionFlowPath(options) {
    const path = detailModal?.querySelector('[data-detail-flow-path]');
    if (!path) return;

    const { steps, currentIndex, hint } = resolveReceptionFlowStep(options);
    const onRoomsStepClick = typeof options.onRoomsStepClick === 'function'
      ? options.onRoomsStepClick
      : null;
    const stepNumber = currentIndex + 1;
    // Fill to the current step center so the teal segment sits over the active tick.
    const fillPercent = Math.round(((currentIndex + 0.5) / steps.length) * 100);

    path.hidden = false;
    path.setAttribute('aria-valuemin', '1');
    path.setAttribute('aria-valuemax', String(steps.length));
    path.setAttribute('aria-valuenow', String(stepNumber));
    path.setAttribute(
      'aria-valuetext',
      `Step ${stepNumber} of ${steps.length}: ${steps[currentIndex].label}. ${hint}`
    );
    path.title = hint;

    path.replaceChildren();

    const rail = document.createElement('div');
    rail.className = 'admin-booking-flow-path-rail';
    rail.setAttribute('aria-hidden', 'true');

    const track = document.createElement('div');
    track.className = 'admin-booking-flow-path-track';
    const fill = document.createElement('div');
    fill.className = 'admin-booking-flow-path-fill';
    fill.style.width = `${fillPercent}%`;
    track.append(fill);

    const ticks = document.createElement('ol');
    ticks.className = 'admin-booking-flow-path-ticks';
    ticks.style.gridTemplateColumns = `repeat(${steps.length}, minmax(0, 1fr))`;
    steps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'admin-booking-flow-path-tick';
      if (index < currentIndex) item.classList.add('is-done');
      if (index === currentIndex) {
        item.classList.add('is-current');
        item.setAttribute('aria-current', 'step');
      }
      const mark = document.createElement('span');
      mark.className = 'admin-booking-flow-path-dot';
      const iconKey = index < currentIndex ? 'done' : step.icon;
      mark.innerHTML = FLOW_STEP_ICONS[iconKey] || step.short;
      mark.setAttribute('data-step', step.short);
      const label = document.createElement('span');
      label.className = 'admin-booking-flow-path-label';
      label.textContent = step.label;
      item.append(mark, label);

      if (step.id === 'rooms' && onRoomsStepClick) {
        item.classList.add('is-actionable');
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.title = 'Open Assign rooms (step 3)';
        item.addEventListener('click', (event) => {
          event.preventDefault();
          onRoomsStepClick();
        });
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onRoomsStepClick();
          }
        });
      }

      ticks.append(item);
    });

    rail.append(track, ticks);

    const status = document.createElement('p');
    status.className = 'admin-booking-flow-path-status';
    status.innerHTML = `<span class="admin-booking-flow-path-stepnum">Step ${stepNumber} of ${steps.length}</span> \u00B7 ${escapeHtml(hint)}`;

    path.append(rail, status);
  }

  function clearReceptionFlowPath() {
    const path = detailModal?.querySelector('[data-detail-flow-path]');
    if (!path) return;
    path.hidden = true;
    path.replaceChildren();
    path.removeAttribute('aria-valuetext');
    path.setAttribute('aria-valuenow', '1');
  }

  const ACTION_ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5-4-4L4 16v4zm12.7-13.3 1.8-1.8a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-1.8 1.8-2.6-2.6z" fill="currentColor"/></svg>',
    payments: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3H3V7zm0 5h18v7H3v-7zm3 2.5h6v2H6v-2z" fill="currentColor"/></svg>',
    addPay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    confirm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    assign: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9H4v-9zm2-4h12l1 4H5l1-4zm4 8h6v2h-6v-2z" fill="currentColor"/></svg>',
    checkout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v14h-5M10 12H3m0 0 3-3M3 12l3 3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  };

  function skel(className = '') {
    const el = document.createElement('span');
    el.className = `admin-skel ${className}`.trim();
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function renderBookingsTableSkeleton(rows = 6) {
    if (!bookingList) return;
    bookingList.replaceChildren();
    for (let i = 0; i < rows; i += 1) {
      const row = document.createElement('tr');
      row.className = 'admin-skel-table-row';
      row.setAttribute('aria-hidden', 'true');
      for (let c = 0; c < 8; c += 1) {
        const cell = document.createElement('td');
        cell.append(skel(`admin-skel-line${c === 0 || c === 7 ? ' is-short' : ''}`));
        row.append(cell);
      }
      bookingList.append(row);
    }
  }

  function renderNotificationsSkeleton(count = 4) {
    if (!notificationItems) return;
    notificationItems.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const item = document.createElement('div');
      item.className = 'admin-skel-notification';
      item.setAttribute('aria-hidden', 'true');
      item.append(
        skel('admin-skel-line is-lg'),
        skel('admin-skel-line is-meta'),
        skel('admin-skel-line is-time is-sm')
      );
      notificationItems.append(item);
    }
  }

  function showBookingDetailsSkeleton(hint = null) {
    if (!detailModal || !detailBody) return;
    detailModal.hidden = false;
    document.body.classList.add('admin-booking-modal-open');
    if (calendarDayModal && !calendarDayModal.hidden) {
      calendarDayModal.setAttribute('inert', '');
    }
    const refEl = detailModal.querySelector('[data-detail-reference]');
    const guestEl = detailModal.querySelector('[data-detail-guest]');
    if (refEl) refEl.textContent = hint?.reference || 'Loading\u2026';
    if (guestEl) {
      guestEl.textContent = hint?.guestName || 'Guest details';
      guestEl.title = hint?.guestName || '';
    }

    const rootEl = document.createElement('div');
    rootEl.className = 'admin-skel-detail';
    rootEl.setAttribute('role', 'status');
    rootEl.setAttribute('aria-live', 'polite');
    rootEl.setAttribute('aria-label', 'Loading booking details');

    const summary = document.createElement('div');
    summary.className = 'admin-skel-detail-summary';
    summary.append(skel('admin-skel-pill'), skel('admin-skel-line is-lg'));
    summary.lastChild.style.width = '6rem';

    const grid = document.createElement('div');
    grid.className = 'admin-skel-detail-grid';
    for (let i = 0; i < 6; i += 1) {
      const field = document.createElement('div');
      field.className = 'admin-skel-field';
      field.append(skel('admin-skel-line is-sm'), skel('admin-skel-line'));
      grid.append(field);
    }

    const fees = document.createElement('div');
    fees.className = 'admin-skel-fees';
    const chips = document.createElement('div');
    chips.className = 'admin-skel-fee-chips';
    for (let i = 0; i < 6; i += 1) chips.append(skel('admin-skel-fee-chip'));
    fees.append(skel('admin-skel-line is-lg'), skel('admin-skel-line is-sm'), chips, skel('admin-skel-panel'));

    rootEl.append(summary, grid, fees, skel('admin-skel-panel'));
    detailBody.replaceChildren(rootEl);

    if (detailActions) {
      const actions = document.createElement('div');
      actions.className = 'admin-skel-actions';
      actions.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i += 1) actions.append(skel('admin-skel-icon'));
      detailActions.replaceChildren(actions);
    }
  }

  async function renderBookingDetails(booking, options = {}) {
    if (!detailModal || !detailBody || !detailActions) return;
    selectedBooking = booking;
    detailModal.querySelector('[data-detail-reference]').textContent = booking.reference;
    const guestEl = detailModal.querySelector('[data-detail-guest]');
    guestEl.textContent = booking.guestName;
    guestEl.title = booking.guestName || '';
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const paymentSummary =
      options.paymentSummary !== undefined
        ? options.paymentSummary
        : await loadBookingPaymentSummary(booking);
    if (paymentSummary) fillPaymentSummaryFields(booking, paymentSummary);
    else fillPaymentSummaryFields(booking, null);

    const stayTotal = paymentPriceContext.stayTotal;
    const amountPaid = paymentPriceContext.amountPaid;
    const balanceDue = paymentPriceContext.balanceDue;
    const payments = (paymentSummary?.payments || []).filter((p) => p.status !== 'Voided');

    const status = displayEnum(booking.status);
    const needsRooms = bookingNeedsRooms(booking);
    const statusPill = bookingStatusPill(booking);
    const summary = document.createElement('div');
    summary.className = 'admin-booking-detail-summary';
    const statusGroup = document.createElement('div');
    statusGroup.className = 'admin-booking-status-cell';
    const pill = document.createElement('span');
    pill.className = `admin-booking-status ${statusPill.className}`;
    pill.textContent = statusPill.label;
    if (statusPill.title) pill.title = statusPill.title;
    statusGroup.append(pill);
    if (needsRooms) {
      const flag = document.createElement('span');
      flag.className = 'admin-booking-status is-needs-rooms';
      flag.textContent = canAssignRoomsToday(booking) ? 'Assign rooms' : 'Ready on arrival';
      flag.title = canAssignRoomsToday(booking)
        ? 'Confirmed \u2014 finish payment if needed, then assign room numbers'
        : arrivalAssignMessage(booking);
      statusGroup.append(flag);
    }
    if (booking.specialOfferId || booking.cashOnlyPromo) {
      const offerFlag = document.createElement('span');
      offerFlag.className = 'admin-booking-status is-special-offer';
      offerFlag.textContent = booking.cashOnlyPromo ? 'Special offer \u00B7 Cash only' : 'Special offer';
      offerFlag.title = booking.specialOfferTitle
        ? `Special offer: ${booking.specialOfferTitle}`
        : 'Guest booked a special offer';
      statusGroup.append(offerFlag);
    }

    const balanceBlock = document.createElement('div');
    balanceBlock.className = 'admin-booking-balance-due';
    const balanceLabel = document.createElement('span');
    balanceLabel.textContent = 'Balance due';
    const balanceValue = document.createElement('strong');
    if (balanceDue < -0.009) {
      balanceBlock.classList.add('is-paid');
      balanceLabel.textContent = 'Overpaid';
      balanceValue.textContent = money(Math.abs(balanceDue));
      balanceBlock.append(balanceLabel, balanceValue);
      summary.append(statusGroup, balanceBlock);
    } else if (balanceDue > 0.009) {
      balanceValue.textContent = money(balanceDue);
      balanceBlock.append(balanceLabel, balanceValue);
      summary.append(statusGroup, balanceBlock);
    } else {
      balanceBlock.classList.add('is-paid', 'is-fully-paid');
      balanceLabel.textContent = 'Fully paid';
      balanceBlock.append(balanceLabel);
      summary.append(statusGroup, balanceBlock);
    }

    const nights = Math.max(
      1,
      (() => {
        const inDate = manilaParts(booking.checkInAtUtc || booking.checkIn)?.date;
        const outDate = manilaParts(booking.checkoutTimeUtc || booking.checkOut)?.date;
        if (!inDate || !outDate) return 1;
        const start = new Date(`${inDate}T12:00:00`);
        const end = new Date(`${outDate}T12:00:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1;
        return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      })()
    );
    const charges = booking.charges || [];
    const billableCharges = charges.filter((c) => String(c.chargeType) !== 'StayExtension');
    const feesTotal = billableCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
    const roomStayTotal = Math.max(0, Number(stayTotal) - feesTotal);
    const hasEarly = charges.some((c) => String(c.chargeType) === 'EarlyCheckIn');
    const lateCharge = charges.find((c) => String(c.chargeType) === 'LateCheckout');
    const lateHours = lateCharge ? Number(lateCharge.quantity || 0) : 0;
    const extraCharge = charges.find((c) => String(c.chargeType) === 'ExtraPerson');
    const extraPersons = extraCharge ? Number(extraCharge.quantity || 0) : 0;
    const extraRoomInputs = [];
    const extraPersonsForFees = () => extraRoomInputs.filter((input) => input.checked).length;

    function stayFeeRoomSlots() {
      const guestRooms = booking.guestRooms || booking.GuestRooms || [];
      const itemSlots = [];
      (booking.items || []).forEach((line) => {
        const qty = Math.max(0, Number(line.quantity || 0));
        const assigned = line.assignedRooms || line.AssignedRooms || [];
        for (let i = 0; i < qty; i += 1) {
          itemSlots.push({
            typeName: line.roomTypeName || line.RoomTypeName || 'Room',
            roomNumber: assigned[i]?.roomNumber || assigned[i]?.RoomNumber || '',
          });
        }
      });
      const count = Math.max(itemSlots.length, guestRooms.length, 1);
      const slots = [];
      for (let i = 0; i < count; i += 1) {
        const guest = guestRooms[i] || {};
        const item = itemSlots[i] || {};
        const adults = Number(guest.adults ?? guest.Adults ?? 0);
        const children = Number(guest.children ?? guest.Children ?? 0);
        const occupancy = adults + children;
        const flagged = Boolean(guest.extraPerson ?? guest.ExtraPerson);
        slots.push({
          index: i,
          typeName: item.typeName || 'Room',
          roomNumber: item.roomNumber || '',
          occupancy,
          flagged,
          suggested: occupancy > 2,
        });
      }
      const anyFlag = slots.some((slot) => slot.flagged);
      slots.forEach((slot, index) => {
        if (anyFlag) {
          slot.checked = slot.flagged;
          return;
        }
        if (extraPersons <= 0) {
          slot.checked = false;
          return;
        }
        const suggested = slots.filter((row) => row.suggested);
        slot.checked = suggested.length >= extraPersons
          ? suggested.slice(0, extraPersons).includes(slot)
          : index < extraPersons;
      });
      return slots;
    }
    const incidentalCharges = charges.filter((c) => String(c.chargeType) === 'Incidental');
    const snackCharges = charges.filter((c) => String(c.chargeType) === 'SnackBeverage');
    const extensionCharge = charges.find((c) => String(c.chargeType) === 'StayExtension');
    const extensionNights = extensionCharge ? Number(extensionCharge.quantity || 0) : 0;
    const parseIncidentalNoteFromLabel = (label) => {
      const text = String(label || '');
      const marker = '\u00B7 cash \u00B7 ';
      const idx = text.indexOf(marker);
      return idx >= 0 ? text.slice(idx + marker.length).trim() : '';
    };
    let incidentalLineSeq = 0;
    const incidentalLines = incidentalCharges
      .filter((c) => Number(c.amount || 0) > 0)
      .map((charge) => ({
        key: `inc-${charge.id || ++incidentalLineSeq}`,
        amount: Math.max(0, Number(charge.amount || 0)),
        note: parseIncidentalNoteFromLabel(charge.label),
      }));
    const parseSnackFromLabel = (label) => {
      const text = String(label || '');
      const prefix = 'Snack & beverage \u00B7 ';
      if (!text.startsWith(prefix)) {
        return { product: '', takenDate: manilaTodayIso() };
      }
      const rest = text.slice(prefix.length);
      const takenMatch = rest.match(/(?:^| \u00B7 )([A-Z][a-z]{2} \d{1,2}, \d{4}) \u00B7 \d+\s*\u00D7/);
      let takenDate = manilaTodayIso();
      if (takenMatch) {
        const parsed = new Date(`${takenMatch[1]} 12:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).formatToParts(parsed);
          const get = (type) => parts.find((p) => p.type === type)?.value || '';
          takenDate = `${get('year')}-${get('month')}-${get('day')}`;
        }
      }
      const productMatch = rest.match(/^(.*) \u00B7 [A-Z][a-z]{2} \d{1,2}, \d{4} \u00B7 \d+\s*\u00D7/);
      if (productMatch) {
        return { product: productMatch[1].trim(), takenDate };
      }
      const legacyProduct = rest.match(/^(.*) \u00B7 \d+\s*\u00D7/);
      return {
        product: legacyProduct ? legacyProduct[1].trim() : '',
        takenDate,
      };
    };
    let snackLineSeq = 0;
    const snackLines = snackCharges.map((charge) => {
      const parsed = parseSnackFromLabel(charge.label);
      return {
        key: `snack-${charge.id || ++snackLineSeq}`,
        product: parsed.product,
        takenDate: parsed.takenDate,
        qty: Math.max(0, Number(charge.quantity || 0)),
        unitAmount: Math.max(0, Number(charge.unitAmount || 0)),
      };
    });
    const parseMoneyInput = (value) => {
      const n = Number(String(value ?? '').replace(/,/g, '').trim());
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const parseIntInput = (value) => {
      const n = Number.parseInt(String(value ?? '').replace(/,/g, '').trim(), 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const allowsExtraPerson = true;

    const checkInRaw = booking.checkInAtUtc || booking.checkIn;
    const checkOutRaw = booking.checkoutTimeUtc || booking.checkOut;
    const checkInLabel = formatDateTime(checkInRaw) || formatDate(checkInRaw) || '\u2014';
    const checkOutLabel = formatDateTime(checkOutRaw) || formatDate(checkOutRaw) || '\u2014';
    const hasAssignedRooms = (booking.items || []).some(
      (line) => (line.assignedRooms || []).length > 0
    );
    const occupyingGuestEarly = isGuestOccupying(booking);
    const extrasStageEarly =
      occupyingGuestEarly && Number(receptionExtrasStageBookingId) === Number(booking.id);
    const onFeesStageEarly =
      !booking.isArchived
      && status === 'Confirmed'
      && hasAssignedRooms
      && !extrasStageEarly;
    // Payment step: confirmed with balance due, before in-house fees/checkout.
    const onPayStageEarly =
      !booking.isArchived
      && status === 'Confirmed'
      && balanceDue > 0.009
      && !(occupyingGuestEarly && hasAssignedRooms);
    const postPaymentLock = balanceDue <= 0.009 && hasAssignedRooms;
    const stayBadges = [];
    if (hasEarly) stayBadges.push('Early 11:30 AM');
    if (lateHours > 0) stayBadges.push(`Late +${lateHours}h`);
    if (extensionNights > 0) {
      stayBadges.push(`+${extensionNights} night${extensionNights === 1 ? '' : 's'}`);
    }
    const arrivalDiscountLabel = displayEnum(booking.arrivalDiscountRequest);
    // After payment, hide Senior/PWD claim from the next stages (Rooms / Fees).
    if (!postPaymentLock) {
      if (arrivalDiscountLabel === 'SeniorCitizen') stayBadges.push('Senior Citizen');
      if (arrivalDiscountLabel === 'Pwd') stayBadges.push('PWD');
    }
    const staySummary =
      stayBadges.length > 0
        ? `${checkInLabel} \u2192 ${checkOutLabel} (${stayBadges.join(' \u00B7 ')})`
        : `${checkInLabel} \u2192 ${checkOutLabel}`;
    const roomSummary = formatBookingRooms(booking) || '\u2014';

    const fields = document.createElement('div');
    fields.className = 'admin-booking-detail-grid admin-booking-guest-details-grid';
    fields.append(
      detailField('Guest', booking.guestName || '\u2014'),
      detailField('Phone', booking.guestPhone || '\u2014'),
      detailField('Email', booking.guestEmail || '\u2014'),
      detailField('Check-in', checkInLabel),
      detailField('Check-out', checkOutLabel),
      detailField('Stay', staySummary),
      detailField('Nights', String(nights)),
      detailField('Rooms', roomSummary),
      detailField(
        'Guest head count',
        (() => {
          const adults = Number(booking.adultCount ?? booking.AdultCount ?? 0);
          const children = Number(booking.childCount ?? booking.ChildCount ?? 0);
          const rooms = booking.guestRooms || booking.GuestRooms;
          if (Array.isArray(rooms) && rooms.length) {
            const a = rooms.reduce((s, r) => s + Number(r.adults ?? r.Adults ?? 0), 0);
            const c = rooms.reduce((s, r) => s + Number(r.children ?? r.Children ?? 0), 0);
            const total = a + c;
            if (total > 0) {
              return `${total} (${a} adult${a === 1 ? '' : 's'}, ${c} child${c === 1 ? '' : 'ren'} \u00B7 ${rooms.length} room card${rooms.length === 1 ? '' : 's'})`;
            }
          }
          if (adults + children > 0) {
            return `${adults + children} (${adults} adult${adults === 1 ? '' : 's'}, ${children} child${children === 1 ? '' : 'ren'})`;
          }
          return 'Not recorded';
        })()
      ),
      detailField('Request type', displayEnum(booking.kind) || '\u2014'),
      detailField('Payment option', displayEnum(booking.paymentOption) || '\u2014'),
      detailField(
        'Special offer',
        booking.specialOfferId
          ? `${booking.specialOfferTitle || 'Yes'}${booking.cashOnlyPromo ? ' \u00B7 Cash only' : ''}`
          : '\u2014'
      ),
      detailField(
        'Senior / PWD',
        (() => {
          if (postPaymentLock) return '\u2014';
          const v = displayEnum(booking.arrivalDiscountRequest);
          if (v === 'SeniorCitizen') return 'Senior Citizen (\u221220% \u00B7 verify ID)';
          if (v === 'Pwd') return 'PWD (\u221220% \u00B7 verify ID)';
          return 'None';
        })()
      ),
      detailField('Stay total', money(stayTotal)),
      detailField('Reference', booking.reference || '\u2014'),
      detailField('Submitted', formatDateTime(booking.createdAtUtc) || formatDate(booking.createdAtUtc) || '\u2014')
    );

    const extraPersonLocked = Boolean(booking.isArchived);
    const feesDisabled =
      Boolean(booking.isArchived) || displayEnum(booking.status) !== 'Confirmed';
    const occupyingGuest = occupyingGuestEarly;
    const extrasStage = extrasStageEarly;
    const onFeesStage = onFeesStageEarly;
    const onPayStage = onPayStageEarly;
    // Step 3 \u00B7 Assign rooms: confirmed, rooms not assigned yet (paid or still collecting).
    const onAssignRoomsStage =
      !booking.isArchived
      && status === 'Confirmed'
      && !hasAssignedRooms
      && !extrasStage;
    // Incidental on Checkout; snack on Fees (step 4) and Checkout \u2014 not on Payment.
    const showCheckoutExtras = extrasStage;
    const showSnackFees = !feesDisabled && !onPayStage;
    const roomCount = Math.max(
      1,
      (booking.items || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    );

    const guestDetails = document.createElement('section');
    guestDetails.className = 'admin-booking-guest-details';
    const guestToggle = document.createElement('button');
    guestToggle.type = 'button';
    guestToggle.className = 'admin-booking-guest-details-toggle';
    const guestDetailsOpenByDefault = !(onFeesStage || extrasStage);
    guestToggle.setAttribute('aria-expanded', guestDetailsOpenByDefault ? 'true' : 'false');
    const guestPreview = [booking.guestName, booking.guestPhone, booking.guestEmail]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' \u00B7 ');
    guestToggle.innerHTML =
      `<span class="admin-booking-guest-details-toggle-label"><span class="admin-booking-guest-details-toggle-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14z" fill="currentColor"/></svg></span><span class="admin-booking-guest-details-toggle-text"><strong>Guest details</strong><small class="admin-booking-guest-details-preview">${escapeHtml(guestPreview || 'No contact on file')}</small></span></span><span class="admin-booking-guest-details-chevron" aria-hidden="true">\u25BE</span>`;
    const guestBody = document.createElement('div');
    guestBody.className = 'admin-booking-guest-details-body';
    guestBody.append(fields);
    guestToggle.addEventListener('click', () => {
      const open = !guestDetails.classList.contains('is-open');
      guestDetails.classList.toggle('is-open', open);
      guestToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      guestBody.hidden = !open;
    });
    if (guestDetailsOpenByDefault) {
      guestDetails.classList.add('is-open');
      guestBody.hidden = false;
    } else {
      guestBody.hidden = true;
    }
    guestDetails.append(guestToggle, guestBody);

    const feesPanel = document.createElement('section');
    feesPanel.className = 'admin-booking-fees-panel';
    if (onFeesStage) feesPanel.classList.add('is-fees-priority');
    if (extrasStage) feesPanel.dataset.extrasFees = '1';

    const feesHead = document.createElement('div');
    feesHead.className = 'admin-booking-fees-head';
    const feesHeadText = document.createElement('div');
    feesHeadText.className = 'admin-booking-fees-head-text';
    const feesTitle = document.createElement('h3');
    feesTitle.textContent = extrasStage ? 'Checkout \u00B7 incidental & snacks' : 'Stay fees';
    const feesLede = document.createElement('p');
    feesLede.className = 'admin-booking-fees-lede';
    feesLede.textContent = extraPersonLocked
      ? 'Stay fees are locked for this booking.'
      : feesDisabled
        ? 'Confirm the booking first to add early / late / extend stay. You can still choose which rooms have an extra guest.'
        : extrasStage
          ? 'Record incidental damages (multiple allowed) or more snacks. Settle any balance under Price & payments, then Archive when fully paid.'
          : onPayStage
            ? 'On Payment: early check-in, extra person, and Senior/PWD if needed. Late checkout, extend stay, and snacks unlock after rooms are assigned.'
            : onAssignRoomsStage
              ? 'On Assign rooms: early check-in, extra person, Senior/PWD, and snack if needed. Late checkout and extend stay unlock on Fees after rooms are assigned.'
              : onFeesStage
                ? 'On Fees: late checkout, extend stay, extra person, and snack & beverage. Early check-in and Senior/PWD are set earlier. Continue to Checkout for incidental damages.'
                : postPaymentLock
                  ? 'Stay fees after payment: late checkout, extend stay, and snack & beverage. Early check-in, extra person, and Senior/PWD are locked.'
                  : occupyingGuest
                    ? 'Add late / extra person / extend stay and snack & beverage here. Continue to Checkout for incidental damages.'
                    : 'Add late / extra person / extend stay and snack & beverage here. Incidental damages unlock at Checkout.';
    feesHeadText.append(feesTitle, feesLede);

    const feesManageBtn = document.createElement('button');
    feesManageBtn.type = 'button';
    feesManageBtn.className = 'admin-booking-fees-manage-btn';
    feesManageBtn.setAttribute('aria-label', 'Manage all fees');
    feesManageBtn.setAttribute('aria-expanded', 'false');
    feesManageBtn.title = 'Manage all added fees';
    feesManageBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const feesManageBadge = document.createElement('span');
    feesManageBadge.className = 'admin-booking-fees-manage-badge';
    feesManageBadge.hidden = true;
    feesManageBtn.append(feesManageBadge);
    feesHead.append(feesHeadText, feesManageBtn);

    const feesManageList = document.createElement('div');
    feesManageList.className = 'admin-booking-fees-manage-list';
    feesManageList.dataset.feesManageList = '1';
    feesManageList.hidden = true;
    feesManageList.setAttribute('role', 'region');
    feesManageList.setAttribute('aria-label', 'All added fees');

    const feesLayout = document.createElement('div');
    feesLayout.className = 'admin-booking-fees-layout';

    const feeTriggers = document.createElement('div');
    feeTriggers.className = 'admin-fee-dd-triggers';
    feeTriggers.setAttribute('role', 'tablist');
    feeTriggers.setAttribute('aria-label', 'Stay fee categories');

    const feePanels = document.createElement('div');
    feePanels.className = 'admin-fee-dd-panels';

    const makeFeeField = (labelText, inputEl, optional = false) => {
      const label = document.createElement('label');
      label.className = 'admin-booking-fee-field';
      const caption = document.createElement('span');
      caption.append(labelText);
      if (optional) {
        caption.append(' ', Object.assign(document.createElement('em'), { textContent: 'optional' }));
      }
      label.append(caption, inputEl);
      return label;
    };

    const setPanelControlsEnabled = (panel, enabled) => {
      panel.querySelectorAll('input, select, textarea, button').forEach((el) => {
        if (el.dataset.keepDisabled === '1') {
          el.disabled = true;
          return;
        }
        el.disabled = !enabled;
      });
    };

    const closeAllFeeDropdowns = () => {
      feeTriggers.querySelectorAll('.admin-fee-dd-trigger').forEach((btn) => {
        btn.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      });
      feePanels.querySelectorAll('.admin-fee-dd-panel').forEach((panel) => {
        panel.hidden = true;
        panel.classList.remove('is-open');
        setPanelControlsEnabled(panel, false);
      });
    };

    const openFeeDropdown = (id) => {
      const trigger = feeTriggers.querySelector(`[data-fee-dd="${id}"]`);
      const panel = feePanels.querySelector(`[data-fee-panel="${id}"]`);
      if (!trigger || !panel) return;
      const alreadyOpen = trigger.classList.contains('is-open');
      closeAllFeeDropdowns();
      if (alreadyOpen) return;
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      panel.classList.add('is-open');
      const stayLocked = trigger.dataset.feeLockWithStayFees !== '0' && feesDisabled;
      const locked = trigger.classList.contains('is-locked') || stayLocked;
      setPanelControlsEnabled(panel, !locked);
    };

    const feeCategories = [];

    const registerFeeCategory = ({
      id,
      title,
      hint,
      locked = false,
      canDelete = true,
      buildBody,
      getMeta,
      showTrigger = true,
      lockWithStayFees = true,
      headAction = null,
    }) => {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'admin-fee-dd-trigger';
      trigger.dataset.feeDd = id;
      trigger.dataset.feeLockWithStayFees = lockWithStayFees ? '1' : '0';
      trigger.setAttribute('role', 'tab');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `fee-panel-${id}`);
      if (locked || (lockWithStayFees && feesDisabled)) trigger.classList.add('is-locked');
      if (!showTrigger) trigger.hidden = true;

      const triggerLabel = document.createElement('span');
      triggerLabel.className = 'admin-fee-dd-trigger-label';
      triggerLabel.textContent = title;
      const triggerMeta = document.createElement('span');
      triggerMeta.className = 'admin-fee-dd-trigger-meta';
      triggerMeta.dataset.feeDdMeta = id;
      const triggerChevron = document.createElement('span');
      triggerChevron.className = 'admin-fee-dd-trigger-chevron';
      triggerChevron.setAttribute('aria-hidden', 'true');
      triggerChevron.textContent = '\u25BE';
      trigger.append(triggerLabel, triggerMeta, triggerChevron);

      const panel = document.createElement('div');
      panel.className = 'admin-fee-dd-panel';
      panel.id = `fee-panel-${id}`;
      panel.dataset.feePanel = id;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;

      const panelHead = document.createElement('div');
      panelHead.className = 'admin-fee-dd-panel-head';
      const panelHeadCopy = document.createElement('div');
      panelHeadCopy.className = 'admin-fee-dd-panel-head-copy';
      panelHeadCopy.append(Object.assign(document.createElement('strong'), { textContent: title }));
      if (hint) {
        panelHeadCopy.append(Object.assign(document.createElement('span'), { textContent: hint }));
      }
      panelHead.append(panelHeadCopy);
      if (headAction) {
        const actions = document.createElement('div');
        actions.className = 'admin-fee-dd-panel-head-actions';
        actions.append(headAction);
        panelHead.append(actions);
      }
      const body = document.createElement('div');
      body.className = 'admin-fee-dd-panel-body';
      const controls = buildBody();
      body.append(...(Array.isArray(controls) ? controls : [controls]));
      panel.append(panelHead, body);
      setPanelControlsEnabled(panel, false);

      const refreshMeta = () => {
        const meta = getMeta ? getMeta() : { active: false, text: '' };
        triggerMeta.textContent = meta.text || '';
        trigger.classList.toggle('is-active', Boolean(meta.active));
      };

      trigger.addEventListener('click', () => openFeeDropdown(id));
      feeTriggers.append(trigger);
      feePanels.append(panel);
      feeCategories.push({
        id,
        title,
        canDelete: Boolean(canDelete) && !locked,
        getMeta,
        refreshMeta,
        showTrigger: Boolean(showTrigger),
        lockWithStayFees: Boolean(lockWithStayFees),
        locked: Boolean(locked),
      });
      refreshMeta();
      return { trigger, panel, refreshMeta };
    };

    const earlyInput = document.createElement('input');
    earlyInput.type = 'checkbox';
    earlyInput.dataset.feeEarly = '1';
    earlyInput.checked = hasEarly;
    earlyInput.disabled = true;
    if (postPaymentLock) earlyInput.dataset.keepDisabled = '1';

    const lateSelect = document.createElement('select');
    lateSelect.dataset.feeLate = '1';
    lateSelect.disabled = true;
    [
      ['0', '12:00 PM \u2014 no fee'],
      ['1', '+1 hour \u00B7 \u20B1100 / room'],
      ['2', '+2 hours \u00B7 \u20B1200 / room'],
      ['3', '+3 hours \u00B7 \u20B1300 / room'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      lateSelect.append(opt);
    });
    lateSelect.value = String(Math.min(3, Math.max(0, lateHours)));

    const extraRoomLocked = !allowsExtraPerson || postPaymentLock;

    const onSpecialOffer = Boolean(booking.specialOfferId || booking.cashOnlyPromo);
    const arrivalSelect = document.createElement('select');
    arrivalSelect.dataset.feeArrivalDiscount = '1';
    arrivalSelect.disabled = true;
    [
      ['None', 'None'],
      ['SeniorCitizen', 'Senior Citizen (20% off stay \u00B7 verify ID)'],
      ['Pwd', 'PWD (20% off stay \u00B7 verify ID)'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      arrivalSelect.append(opt);
    });
    const arrivalCurrent = displayEnum(booking.arrivalDiscountRequest) || 'None';
    arrivalSelect.value =
      arrivalCurrent === 'SeniorCitizen' || arrivalCurrent === 'Pwd' ? arrivalCurrent : 'None';
    if (onSpecialOffer || postPaymentLock) {
      if (postPaymentLock) arrivalSelect.value = 'None';
      arrivalSelect.dataset.keepDisabled = '1';
    }

    const incidentalAmountInput = Object.assign(document.createElement('input'), {
      type: 'text',
      inputMode: 'decimal',
      autocomplete: 'off',
      placeholder: '0.00',
      value: '',
      disabled: true,
    });
    incidentalAmountInput.dataset.feeIncidentalAmount = '1';

    const incidentalNoteInput = Object.assign(document.createElement('input'), {
      type: 'text',
      maxLength: 80,
      placeholder: 'e.g. broken lamp',
      value: '',
      disabled: true,
    });
    incidentalNoteInput.dataset.feeIncidentalNote = '1';

    const incidentalLinesList = document.createElement('ul');
    incidentalLinesList.className = 'admin-booking-fee-snack-items';

    const incidentalCartHint = Object.assign(document.createElement('p'), {
      className: 'admin-booking-fees-hint',
      textContent: 'Add each damage as its own line, then Save stay fees. Collect in cash.',
    });

    const incidentalAddBtn = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'admin-booking-fee-snack-add',
      textContent: 'Add damage',
      disabled: true,
    });

    const incidentalLinesTotal = () =>
      incidentalLines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);

    const formatIncidentalLineText = (line) => {
      const note = (line.note || '').trim();
      return note ? `${money(line.amount)} \u00B7 ${note}` : money(line.amount);
    };

    const renderIncidentalLines = () => {
      incidentalLinesList.replaceChildren();
      if (!incidentalLines.length) {
        incidentalLinesList.append(
          Object.assign(document.createElement('li'), {
            className: 'admin-booking-fee-snack-empty',
            textContent: 'No incidental damages yet.',
          })
        );
        return;
      }
      incidentalLines.forEach((line) => {
        const item = document.createElement('li');
        item.className = 'admin-booking-fee-snack-item';
        item.append(
          Object.assign(document.createElement('span'), {
            textContent: formatIncidentalLineText(line),
          })
        );
        const removeBtn = Object.assign(document.createElement('button'), {
          type: 'button',
          className: 'admin-booking-fee-snack-remove',
          textContent: 'Remove',
          disabled: feesDisabled,
        });
        removeBtn.addEventListener('click', () => {
          const idx = incidentalLines.findIndex((row) => row.key === line.key);
          if (idx >= 0) incidentalLines.splice(idx, 1);
          renderIncidentalLines();
          refreshAllFeeMeta();
        });
        item.append(removeBtn);
        incidentalLinesList.append(item);
      });
    };

    const clearIncidentalDraft = () => {
      incidentalAmountInput.value = '';
      incidentalNoteInput.value = '';
    };

    const pushIncidentalDraft = (opts = {}) => {
      const amount = parseMoneyInput(incidentalAmountInput.value);
      if (amount <= 0) {
        if (!opts.silent) {
          incidentalCartHint.textContent = 'Enter a damage amount before adding.';
        }
        return false;
      }
      incidentalLines.push({
        key: `inc-draft-${Date.now()}-${++incidentalLineSeq}`,
        amount,
        note: (incidentalNoteInput.value || '').trim(),
      });
      clearIncidentalDraft();
      renderIncidentalLines();
      if (!opts.silent) {
        incidentalCartHint.textContent =
          'Add each damage as its own line, then Save stay fees. Collect in cash.';
        refreshAllFeeMeta();
      }
      return true;
    };

    incidentalAddBtn.addEventListener('click', () => {
      pushIncidentalDraft();
    });
    renderIncidentalLines();

    const snackProductListId = `fee-snack-products-${booking.id}`;
    const snackProductInput = Object.assign(document.createElement('input'), {
      type: 'text',
      maxLength: 80,
      autocomplete: 'off',
      placeholder: 'e.g. Bottled water, coffee, turon',
      value: '',
      disabled: true,
    });
    snackProductInput.dataset.feeSnackProduct = '1';
    snackProductInput.setAttribute('list', snackProductListId);
    const snackProductDatalist = document.createElement('datalist');
    snackProductDatalist.id = snackProductListId;
    [
      'Bottled water',
      'Coffee',
      'Iced tea',
      'Softdrinks',
      'Turon',
      'Banana cue',
      'Fish crackers',
      'Chippy',
      'Piattos',
      'Skyflakes',
      'Pancit canton',
      'Cup noodles',
    ].forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      snackProductDatalist.append(opt);
    });

    const snackTakenInput = Object.assign(document.createElement('input'), {
      type: 'date',
      value: manilaTodayIso(),
      disabled: true,
    });
    snackTakenInput.dataset.feeSnackTaken = '1';

    const snackQtyInput = Object.assign(document.createElement('input'), {
      type: 'text',
      inputMode: 'numeric',
      autocomplete: 'off',
      placeholder: '0',
      value: '',
      disabled: true,
    });
    snackQtyInput.dataset.feeSnackQty = '1';

    const snackUnitInput = Object.assign(document.createElement('input'), {
      type: 'text',
      inputMode: 'decimal',
      autocomplete: 'off',
      placeholder: '0.00',
      value: '',
      disabled: true,
    });
    snackUnitInput.dataset.feeSnackUnit = '1';

    const snackLinesList = document.createElement('ul');
    snackLinesList.className = 'admin-booking-fee-snack-items';

    const snackPreview = Object.assign(document.createElement('p'), {
      className: 'admin-booking-fees-hint',
      textContent: 'Line total: \u20B10.00',
    });

    const snackCartHint = Object.assign(document.createElement('p'), {
      className: 'admin-booking-fees-hint',
      textContent: 'Add each product with the date it was taken, then Save stay fees.',
    });

    const snackAddBtn = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'admin-booking-fee-snack-add',
      textContent: 'Add item',
      disabled: true,
    });

    const snackLinesTotal = () =>
      snackLines.reduce(
        (sum, line) => sum + Math.max(0, line.qty) * Math.max(0, line.unitAmount),
        0
      );

    const formatSnackLineText = (line) => {
      const total = Math.max(0, line.qty) * Math.max(0, line.unitAmount);
      const product = (line.product || '').trim();
      const taken = line.takenDate
        ? formatDate(`${line.takenDate}T12:00:00`) || line.takenDate
        : '\u2014';
      const qtyPart = `${line.qty} \u00D7 ${money(line.unitAmount)}`;
      return product
        ? `${product} \u00B7 ${taken} \u00B7 ${qtyPart} = ${money(total)}`
        : `${taken} \u00B7 ${qtyPart} = ${money(total)}`;
    };

    const renderSnackLines = () => {
      snackLinesList.replaceChildren();
      if (!snackLines.length) {
        snackLinesList.append(
          Object.assign(document.createElement('li'), {
            className: 'admin-booking-fee-snack-empty',
            textContent: 'No snack items yet.',
          })
        );
        return;
      }
      snackLines.forEach((line) => {
        const item = document.createElement('li');
        item.className = 'admin-booking-fee-snack-item';
        item.append(
          Object.assign(document.createElement('span'), {
            textContent: formatSnackLineText(line),
          })
        );
        const removeBtn = Object.assign(document.createElement('button'), {
          type: 'button',
          className: 'admin-booking-fee-snack-remove',
          textContent: 'Remove',
          disabled: feesDisabled,
        });
        removeBtn.addEventListener('click', () => {
          const idx = snackLines.findIndex((row) => row.key === line.key);
          if (idx >= 0) snackLines.splice(idx, 1);
          renderSnackLines();
          refreshAllFeeMeta();
        });
        item.append(removeBtn);
        snackLinesList.append(item);
      });
    };

    const clearSnackDraft = () => {
      snackProductInput.value = '';
      snackQtyInput.value = '';
      snackUnitInput.value = '';
      snackTakenInput.value = manilaTodayIso();
      syncSnackPreview();
    };

    const readSnackDraft = () => {
      const product = (snackProductInput.value || '').trim();
      const qty = parseIntInput(snackQtyInput.value);
      const unitAmount = parseMoneyInput(snackUnitInput.value);
      const takenDate = String(snackTakenInput.value || '').trim() || manilaTodayIso();
      return { product, qty, unitAmount, takenDate, total: qty * unitAmount };
    };

    const pushSnackDraft = (opts = {}) => {
      const draft = readSnackDraft();
      if (draft.qty <= 0 || draft.unitAmount <= 0) {
        if (!opts.silent) {
          snackCartHint.textContent = 'Enter qty and unit price before adding a snack item.';
        }
        return false;
      }
      if (!draft.takenDate) {
        if (!opts.silent) {
          snackCartHint.textContent = 'Choose the date the snack or beverage was taken.';
        }
        return false;
      }
      snackLines.push({
        key: `snack-new-${++snackLineSeq}`,
        product: draft.product,
        takenDate: draft.takenDate,
        qty: draft.qty,
        unitAmount: draft.unitAmount,
      });
      clearSnackDraft();
      renderSnackLines();
      if (!opts.silent) {
        snackCartHint.textContent =
          'Add each product with the date it was taken, then Save stay fees.';
        refreshAllFeeMeta();
      }
      return true;
    };

    snackAddBtn.addEventListener('click', () => {
      pushSnackDraft();
    });

    renderSnackLines();

    const extendInput = Object.assign(document.createElement('input'), {
      type: 'text',
      inputMode: 'numeric',
      autocomplete: 'off',
      placeholder: '0',
      value: '',
      disabled: true,
    });
    extendInput.dataset.feeExtend = '1';

    let pendingRevertExtend = false;

    const syncExtendPreview = () => {
      if (pendingRevertExtend) {
        const add = parseIntInput(extendInput.value);
        extendPreview.textContent =
          add > 0
            ? `On Save: remove current +${extensionNights} night${extensionNights === 1 ? '' : 's'}, then add +${add}.`
            : `On Save: remove +${extensionNights} night${extensionNights === 1 ? '' : 's'} and roll checkout back.`;
        return;
      }
      extendPreview.textContent =
        extensionNights > 0
          ? `Already extended +${extensionNights} night${extensionNights === 1 ? '' : 's'}.`
          : 'Moves checkout date forward and adds Extra night(s) in the breakdown.';
    };

    const extendPreview = Object.assign(document.createElement('p'), {
      className: 'admin-booking-fees-hint',
      textContent: '',
    });
    syncExtendPreview();

    const isoDayDiff = (fromIso, toIso) => {
      const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromIso || ''));
      const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toIso || ''));
      if (!a || !b) return 0;
      const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
      const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
      return Math.round((end - start) / 86400000);
    };

    const formatIsoDay = (iso) => {
      if (!iso) return '\u2014';
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!match) return iso;
      const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
      return dt.toLocaleDateString(PH_LOCALE, {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

    const closeExtendCalendarPopup = () => {
      const popup = detailModal?.querySelector('[data-extend-calendar-popup]');
      if (popup) popup.hidden = true;
    };

    const openExtendCalendarPopup = () => {
      const popup = detailModal?.querySelector('[data-extend-calendar-popup]');
      if (!popup) return;
      const checkInDate = manilaParts(booking.checkInAtUtc || booking.checkIn)?.date || '';
      const currentOut = manilaParts(booking.checkoutTimeUtc || booking.checkOut)?.date || '';
      const minOut = currentOut ? addIsoDays(currentOut, 1) : '';
      const maxOut = currentOut ? addIsoDays(currentOut, 30) : '';
      if (!currentOut || !minOut) return;

      const minViewYm = (checkInDate || currentOut).slice(0, 7);
      const maxViewYm = maxOut.slice(0, 7);
      let viewYm = currentOut.slice(0, 7);
      let selectedIso = '';
      const existingAdd = parseIntInput(extendInput.value);
      if (existingAdd > 0) {
        selectedIso = addIsoDays(currentOut, existingAdd);
        if (selectedIso) viewYm = selectedIso.slice(0, 7);
      }

      const currentEl = popup.querySelector('[data-extend-calendar-current]');
      const monthEl = popup.querySelector('[data-extend-calendar-month]');
      const gridEl = popup.querySelector('[data-extend-calendar-grid]');
      const previewEl = popup.querySelector('[data-extend-calendar-preview]');
      const applyBtn = popup.querySelector('[data-extend-calendar-apply]');
      const prevBtn = popup.querySelector('[data-extend-calendar-prev]');
      const nextBtn = popup.querySelector('[data-extend-calendar-next]');
      const cancelBtn = popup.querySelector('[data-extend-calendar-cancel]');

      if (currentEl) {
        const stayLabel = checkInDate
          ? `Booked ${formatIsoDay(checkInDate)} \u2192 ${formatIsoDay(currentOut)}`
          : `Current checkout ${formatIsoDay(currentOut)}`;
        currentEl.textContent = `${stayLabel} \u00B7 pick a later checkout (max +30 nights)`;
      }

      const syncPreview = () => {
        const nightsAdd = selectedIso ? isoDayDiff(currentOut, selectedIso) : 0;
        if (previewEl) {
          previewEl.textContent =
            nightsAdd > 0
              ? `+${nightsAdd} night${nightsAdd === 1 ? '' : 's'} \u00B7 new checkout ${formatIsoDay(selectedIso)}`
              : 'Select a checkout date on the calendar.';
        }
        if (applyBtn) applyBtn.disabled = nightsAdd < 1 || nightsAdd > 30;
      };

      const paintMonth = () => {
        if (!gridEl || !monthEl) return;
        const [yStr, mStr] = viewYm.split('-');
        const year = Number(yStr);
        const month = Number(mStr);
        const monthDate = new Date(Date.UTC(year, month - 1, 1, 12));
        monthEl.textContent = monthDate.toLocaleDateString(PH_LOCALE, {
          timeZone: 'UTC',
          month: 'long',
          year: 'numeric',
        });
        gridEl.replaceChildren();
        const firstDow = monthDate.getUTCDay();
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let i = 0; i < firstDow; i += 1) {
          gridEl.append(Object.assign(document.createElement('span'), { className: 'is-pad' }));
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'admin-extend-calendar-day';
          btn.textContent = String(day);
          btn.dataset.iso = iso;
          const selectable = iso >= minOut && iso <= maxOut;
          btn.disabled = !selectable;

          const inBookedStay =
            Boolean(checkInDate) && iso >= checkInDate && iso <= currentOut;
          if (inBookedStay) btn.classList.add('is-booked');
          if (iso === checkInDate) btn.classList.add('is-checkin');
          if (iso === currentOut) btn.classList.add('is-checkout');

          if (selectedIso && iso > currentOut && iso <= selectedIso) {
            btn.classList.add('is-extend');
            if (iso === selectedIso) btn.classList.add('is-selected');
            else btn.classList.add('is-extend-mid');
          }

          if (selectable) {
            btn.addEventListener('click', () => {
              selectedIso = iso;
              paintMonth();
              syncPreview();
            });
          }
          gridEl.append(btn);
        }
        if (prevBtn) {
          const prevYm = addIsoDays(`${viewYm}-01`, -1).slice(0, 7);
          prevBtn.disabled = !prevYm || prevYm < minViewYm;
        }
        if (nextBtn) {
          const nextYm = addIsoDays(`${viewYm}-28`, 5).slice(0, 7);
          nextBtn.disabled = !nextYm || nextYm > maxViewYm;
        }
      };

      if (prevBtn) {
        prevBtn.onclick = () => {
          viewYm = addIsoDays(`${viewYm}-01`, -1).slice(0, 7);
          paintMonth();
        };
      }
      if (nextBtn) {
        nextBtn.onclick = () => {
          viewYm = addIsoDays(`${viewYm}-28`, 5).slice(0, 7);
          paintMonth();
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = () => closeExtendCalendarPopup();
      }
      if (applyBtn) {
        applyBtn.onclick = () => {
          const nightsAdd = selectedIso ? isoDayDiff(currentOut, selectedIso) : 0;
          if (nightsAdd < 1 || nightsAdd > 30) return;
          extendInput.value = String(nightsAdd);
          pendingRevertExtend = false;
          syncExtendPreview();
          refreshAllFeeMeta();
          closeExtendCalendarPopup();
        };
      }
      popup.onclick = (event) => {
        if (event.target === popup) closeExtendCalendarPopup();
      };

      paintMonth();
      syncPreview();
      popup.hidden = false;
      applyBtn?.focus();
    };

    const extendCalendarBtn = document.createElement('button');
    extendCalendarBtn.type = 'button';
    extendCalendarBtn.className = 'admin-fee-extend-calendar-btn';
    extendCalendarBtn.title = 'Pick new checkout on calendar';
    extendCalendarBtn.setAttribute('aria-label', 'Open extend stay calendar');
    extendCalendarBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    extendCalendarBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openExtendCalendarPopup();
    });

    const feeClearControls = [];
    const FEE_ICON_CLEAR =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 3h6m-8 4h10m-9 0 .7 12.2c0 .6.5 1.1 1.1 1.1h5.4c.6 0 1.1-.5 1.1-1.1L17 7M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const FEE_ICON_UNDO =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 8H5V4M5.5 12a7 7 0 1 0 1.4-4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const FEE_ICON_EDIT =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4l10.5-10.5a1.8 1.8 0 0 0-2.5-2.5L5.5 17.5 4 20zM13 6l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const FEE_ICON_SAVE =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 3h11l3 3v15H5V3zM8 3v6h7V3M8 13h8M8 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const paintFeeActionButton = (btn, { icon, label, mode = 'clear' }) => {
      btn.classList.toggle('is-undo', mode === 'undo');
      btn.innerHTML =
        `<span class="admin-fee-action-icon" aria-hidden="true">${icon}</span>` +
        `<span class="admin-fee-action-label">${label}</span>`;
    };

    const makeFeeClearRow = (id, getState) => {
      const row = document.createElement('div');
      row.className = 'admin-booking-fee-clear-row';
      row.hidden = true;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-booking-fee-clear-btn';
      paintFeeActionButton(btn, { icon: FEE_ICON_CLEAR, label: 'Clear', mode: 'clear' });
      row.append(btn);
      feeClearControls.push({ id, row, btn, getState });
      return row;
    };

    const extendClearRow = makeFeeClearRow('extend', () => {
      if (pendingRevertExtend && extensionNights > 0) {
        return {
          visible: true,
          mode: 'undo',
          label: `Keep extension (+${extensionNights} night${extensionNights === 1 ? '' : 's'})`,
        };
      }
      const add = parseIntInput(extendInput.value);
      if (add > 0) {
        return {
          visible: true,
          mode: 'clear',
          label: `Clear added nights (+${add})`,
        };
      }
      if (extensionNights > 0) {
        return {
          visible: true,
          mode: 'clear',
          label: `Clear extension (+${extensionNights} night${extensionNights === 1 ? '' : 's'})`,
        };
      }
      return { visible: false };
    });

    // Register every fee category so Manage fees lists them on Fees and Checkout.
    // Only stage-relevant triggers stay visible in the pill row.
    registerFeeCategory({
      id: 'early',
      title: 'Early check-in',
      hint: postPaymentLock
        ? 'Locked after payment'
        : '11:30 AM \u00B7 \u20B1500 / room',
      locked: postPaymentLock,
      // Payment / Assign rooms only \u2014 hide on Fees and Checkout.
      showTrigger: !extrasStage && !onFeesStage,
      buildBody: () => {
        const row = document.createElement('label');
        row.className = 'admin-booking-fee-option';
        row.append(
          earlyInput,
          Object.assign(document.createElement('span'), {
            textContent: postPaymentLock
              ? 'Early check-in is locked after payment'
              : 'Apply early check-in fee for this stay',
          })
        );
        return [
          row,
          makeFeeClearRow('early', () =>
            earlyInput.checked && !postPaymentLock
              ? { visible: true, mode: 'clear', label: 'Clear early check-in' }
              : { visible: false }
          ),
        ];
      },
      getMeta: () =>
        earlyInput.checked
          ? { active: true, text: money(500 * roomCount) }
          : { active: false, text: '' },
    });

    registerFeeCategory({
      id: 'late',
      title: 'Late check-out',
      hint: '\u20B1100 / hour / room \u00B7 max 3 hours',
      // Fees stage only \u2014 hide on Payment and Assign rooms.
      showTrigger: onFeesStage,
      buildBody: () => {
        const row = document.createElement('label');
        row.className = 'admin-booking-fee-option';
        row.append(Object.assign(document.createElement('span'), { textContent: 'Checkout time' }), lateSelect);
        return [
          row,
          makeFeeClearRow('late', () => {
            const hours = Number(lateSelect.value || 0);
            return hours > 0
              ? { visible: true, mode: 'clear', label: `Clear late check-out (+${hours}h)` }
              : { visible: false };
          }),
        ];
      },
      getMeta: () => {
        const hours = Number(lateSelect.value || 0);
        return hours > 0
          ? { active: true, text: `+${hours}h \u00B7 ${money(100 * hours * roomCount)}` }
          : { active: false, text: '' };
      },
    });

    registerFeeCategory({
      id: 'extra',
      title: 'Extra person',
      hint: postPaymentLock
        ? 'Locked after payment'
        : '\u20B1200 / night \u00B7 choose a room for each extra guest',
      locked: !allowsExtraPerson || extraPersonLocked || postPaymentLock,
      lockWithStayFees: false,
      showTrigger: !extrasStage,
      buildBody: () => {
        extraRoomInputs.length = 0;
        const list = document.createElement('div');
        list.className = 'admin-booking-fee-room-list';
        stayFeeRoomSlots().forEach((slot) => {
          const row = document.createElement('label');
          row.className = `admin-booking-fee-option admin-booking-fee-room${allowsExtraPerson && !postPaymentLock ? '' : ' is-disabled'}`;
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.dataset.feeExtraRoom = String(slot.index);
          input.checked = Boolean(slot.checked);
          input.disabled = extraPersonLocked || extraRoomLocked;
          if (extraPersonLocked || extraRoomLocked) input.dataset.keepDisabled = '1';
          input.addEventListener('change', () => refreshAllFeeMeta());
          extraRoomInputs.push(input);
          const copy = document.createElement('span');
          const title = [slot.typeName, slot.roomNumber ? `#${slot.roomNumber}` : '']
            .filter(Boolean)
            .join(' ');
          copy.innerHTML =
            `<strong>Room ${slot.index + 1}${title ? ` \u00B7 ${escapeHtml(title)}` : ''}</strong>` +
            `<small>${
              slot.suggested
                ? '3 guests recorded \u00B7 \u20B1200 / night'
                : 'Add one extra guest \u00B7 \u20B1200 / night'
            }</small>`;
          row.append(input, copy);
          list.append(row);
        });
        if (!allowsExtraPerson) {
          const empty = document.createElement('p');
          empty.className = 'admin-booking-fees-manage-empty';
          empty.textContent = 'Not available for this room setup.';
          return [empty];
        }
        if (postPaymentLock) {
          const note = document.createElement('p');
          note.className = 'admin-booking-fees-hint';
          note.textContent = 'Extra person rooms are locked after payment.';
          return [list, note];
        }
        return [
          list,
          makeFeeClearRow('extra', () => {
            const extras = extraPersonsForFees();
            return extras > 0
              ? {
                  visible: true,
                  mode: 'clear',
                  label: extras > 1 ? `Clear extra person (${extras} rooms)` : 'Clear extra person',
                }
              : { visible: false };
          }),
        ];
      },
      getMeta: () => {
        const extras = extraPersonsForFees();
        return extras > 0
          ? { active: true, text: money(200 * nights * extras) }
          : { active: false, text: '' };
      },
    });

    registerFeeCategory({
      id: 'extend',
      title: 'Extend stay',
      hint: 'Adds nights and moves checkout date',
      // Fees stage only \u2014 hide on Payment and Assign rooms.
      showTrigger: onFeesStage,
      headAction: extendCalendarBtn,
      buildBody: () => [makeFeeField('Add nights', extendInput), extendPreview, extendClearRow],
      getMeta: () => {
        const add = parseIntInput(extendInput.value);
        if (pendingRevertExtend && add <= 0) return { active: false, text: '' };
        if (add > 0) return { active: true, text: `+${add} night${add === 1 ? '' : 's'}` };
        if (!pendingRevertExtend && extensionNights > 0) {
          return {
            active: true,
            text: `+${extensionNights} night${extensionNights === 1 ? '' : 's'}`,
          };
        }
        return { active: false, text: '' };
      },
    });

    registerFeeCategory({
      id: 'incidental',
      title: 'Incidental',
      hint: 'Multiple damages \u00B7 collect in cash',
      showTrigger: Boolean(showCheckoutExtras),
      buildBody: () => {
        const draftRow = document.createElement('div');
        draftRow.className = 'admin-booking-fee-snack-row';
        draftRow.append(
          makeFeeField('Amount (\u20B1)', incidentalAmountInput),
          makeFeeField('Note', incidentalNoteInput, true)
        );
        const draftBlock = document.createElement('div');
        draftBlock.className = 'admin-booking-fee-snack-draft';
        draftBlock.append(draftRow, incidentalAddBtn);
        return [
          incidentalCartHint,
          incidentalLinesList,
          draftBlock,
          makeFeeClearRow('incidental', () => {
            const draftAmount = parseMoneyInput(incidentalAmountInput.value);
            const has = incidentalLines.length > 0 || draftAmount > 0;
            return has
              ? { visible: true, mode: 'clear', label: 'Clear all incidental damages' }
              : { visible: false };
          }),
        ];
      },
      getMeta: () => {
        const draftAmount = parseMoneyInput(incidentalAmountInput.value);
        const total = incidentalLinesTotal() + Math.max(0, draftAmount);
        const count = incidentalLines.length + (draftAmount > 0 ? 1 : 0);
        if (total <= 0) return { active: false, text: '' };
        if (count === 1) return { active: true, text: money(total) };
        return { active: true, text: `${count} damages \u00B7 ${money(total)}` };
      },
    });

    registerFeeCategory({
      id: 'snack',
      title: 'Snack & beverage',
      hint: 'Products with date taken \u00B7 qty \u00D7 unit price',
      showTrigger: Boolean(showSnackFees),
      buildBody: () => {
        const snackRow = document.createElement('div');
        snackRow.className = 'admin-booking-fee-snack-row';
        snackRow.append(
          makeFeeField('Taken date', snackTakenInput),
          makeFeeField('Qty', snackQtyInput),
          makeFeeField('Unit price (\u20B1)', snackUnitInput)
        );
        const draftBlock = document.createElement('div');
        draftBlock.className = 'admin-booking-fee-snack-draft';
        draftBlock.append(
          makeFeeField('Product', snackProductInput),
          snackProductDatalist,
          Object.assign(document.createElement('p'), {
            className: 'admin-booking-fees-hint',
            textContent: 'Suggestions: Bottled water, coffee, or Filipino snacks.',
          }),
          snackRow,
          snackPreview,
          snackAddBtn
        );
        return [
          snackCartHint,
          snackLinesList,
          draftBlock,
          makeFeeClearRow('snack', () => {
            const draft = readSnackDraft();
            const draftActive = draft.qty > 0 && draft.unitAmount > 0;
            const has = snackLines.length > 0 || draftActive;
            return has
              ? { visible: true, mode: 'clear', label: 'Clear all snacks' }
              : { visible: false };
          }),
        ];
      },
      getMeta: () => {
        const draft = readSnackDraft();
        const draftActive = draft.qty > 0 && draft.unitAmount > 0;
        const total = snackLinesTotal() + (draftActive ? draft.total : 0);
        const count = snackLines.length + (draftActive ? 1 : 0);
        if (total <= 0) return { active: false, text: '' };
        if (count === 1 && snackLines[0] && !draftActive) {
          const product = (snackLines[0].product || '').trim();
          return {
            active: true,
            text: product ? `${product} \u00B7 ${money(total)}` : money(total),
          };
        }
        if (count === 1 && draftActive && !snackLines.length) {
          return {
            active: true,
            text: draft.product ? `${draft.product} \u00B7 ${money(total)}` : money(total),
          };
        }
        return { active: true, text: `${count} items \u00B7 ${money(total)}` };
      },
    });

    registerFeeCategory({
      id: 'arrivalDiscount',
      title: 'Senior / PWD',
      hint: postPaymentLock
        ? 'Removed after payment'
        : onSpecialOffer
          ? 'Unavailable while special offer is active'
          : '20% off stay when saved \u00B7 verify ID \u00B7 not with special offer',
      locked: onSpecialOffer || postPaymentLock,
      // Payment / Assign rooms only \u2014 hide on Fees and Checkout.
      showTrigger: !extrasStage && !postPaymentLock && !onFeesStage,
      buildBody: () => {
        const hint = Object.assign(document.createElement('p'), {
          className: 'admin-booking-fees-hint',
          textContent: postPaymentLock
            ? 'Senior / PWD claim is cleared from Fees after payment. The paid stay total is unchanged.'
            : onSpecialOffer
              ? 'This stay has a special offer. Senior Citizen / PWD cannot be combined with the promo rate.'
              : 'Applies 20% off the room stay subtotal when you save (or when the booking is confirmed). Reception still verifies ID on arrival.',
        });
        return [
          makeFeeField('Discount claim', arrivalSelect),
          hint,
          makeFeeClearRow('arrivalDiscount', () => {
            if (postPaymentLock || onSpecialOffer || arrivalSelect.dataset.keepDisabled) {
              return { visible: false };
            }
            const value = arrivalSelect.value || 'None';
            if (value === 'SeniorCitizen' || value === 'Pwd') {
              return {
                visible: true,
                mode: 'clear',
                label: value === 'Pwd' ? 'Clear PWD discount' : 'Clear Senior discount',
              };
            }
            return { visible: false };
          }),
        ];
      },
      getMeta: () => {
        if (postPaymentLock) return { active: false, text: '' };
        const value = arrivalSelect.value || 'None';
        if (value === 'SeniorCitizen') return { active: true, text: 'Senior \u00B7 \u221220%' };
        if (value === 'Pwd') return { active: true, text: 'PWD \u00B7 \u221220%' };
        return { active: false, text: '' };
      },
    });

    const syncSnackPreview = () => {
      const draft = readSnackDraft();
      snackPreview.textContent = `Draft line: ${money(Math.max(0, draft.total))}`;
    };
    snackQtyInput.addEventListener('input', syncSnackPreview);
    snackUnitInput.addEventListener('input', syncSnackPreview);
    snackProductInput.addEventListener('input', syncSnackPreview);
    snackTakenInput.addEventListener('change', syncSnackPreview);
    syncSnackPreview();

    const clearFeeCategory = (id) => {
      if (id === 'early') earlyInput.checked = false;
      if (id === 'late') lateSelect.value = '0';
      if (id === 'extra') extraRoomInputs.forEach((input) => { input.checked = false; });
      if (id === 'incidental') {
        incidentalLines.splice(0, incidentalLines.length);
        clearIncidentalDraft();
        renderIncidentalLines();
      }
      if (id === 'snack') {
        snackLines.splice(0, snackLines.length);
        clearSnackDraft();
        renderSnackLines();
      }
      if (id === 'extend') {
        extendInput.value = '';
        pendingRevertExtend = extensionNights > 0;
        syncExtendPreview();
      }
      if (id === 'arrivalDiscount' && !arrivalSelect.dataset.keepDisabled) {
        arrivalSelect.value = 'None';
      }
    };

    const syncFeeClearControls = () => {
      feeClearControls.forEach((ctrl) => {
        const cat = feeCategories.find((item) => item.id === ctrl.id);
        const catLocked =
          Boolean(cat?.locked)
          || Boolean(extraPersonLocked)
          || (cat?.lockWithStayFees !== false && feesDisabled);
        const state = typeof ctrl.getState === 'function' ? ctrl.getState() : { visible: false };
        const show = Boolean(state?.visible) && !catLocked;
        const mode = state?.mode === 'undo' ? 'undo' : 'clear';
        ctrl.row.hidden = !show;
        ctrl.btn.disabled = !show;
        paintFeeActionButton(ctrl.btn, {
          icon: mode === 'undo' ? FEE_ICON_UNDO : FEE_ICON_CLEAR,
          label: state?.label || 'Clear',
          mode,
        });
        ctrl.btn.title =
          mode === 'undo'
            ? 'Cancel the clear and keep the saved extension'
            : 'Clear this fee \u2014 then click Save stay fees';
      });
    };

    feeClearControls.forEach((ctrl) => {
      ctrl.btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const state = typeof ctrl.getState === 'function' ? ctrl.getState() : null;
        if (state?.mode === 'undo' && ctrl.id === 'extend') {
          pendingRevertExtend = false;
          syncExtendPreview();
          refreshAllFeeMeta();
          feesMsg.hidden = false;
          feesMsg.textContent = 'Extension kept. No save needed for this undo.';
          return;
        }
        clearFeeCategory(ctrl.id);
        refreshAllFeeMeta();
        feesMsg.hidden = false;
        feesMsg.textContent = feesDisabled
          ? 'Cleared \u2014 click Save extra person rooms to apply.'
          : ctrl.id === 'extend' && pendingRevertExtend
            ? 'Extension marked for removal \u2014 click Save stay fees to roll checkout back.'
            : 'Cleared \u2014 click Save stay fees to apply.';
      });
    });

    const refreshFeeManageList = () => {
      feesManageList.replaceChildren();
      const active = feeCategories.filter((cat) => {
        const meta = cat.getMeta ? cat.getMeta() : { active: false };
        return Boolean(meta.active);
      });
      feesManageBadge.hidden = active.length < 1;
      feesManageBadge.textContent = active.length > 0 ? String(active.length) : '';
      feesManageBtn.classList.toggle('has-fees', active.length > 0);

      if (!active.length) {
        feesManageList.append(
          Object.assign(document.createElement('p'), {
            className: 'admin-booking-fees-manage-empty',
            textContent: 'No fees added yet.',
          })
        );
        return;
      }

      const list = document.createElement('ul');
      list.className = 'admin-booking-fees-manage-items';
      active.forEach((cat) => {
        const meta = cat.getMeta();
        const item = document.createElement('li');
        item.className = 'admin-booking-fees-manage-item';
        const info = document.createElement('div');
        info.className = 'admin-booking-fees-manage-info';
        info.append(
          Object.assign(document.createElement('strong'), { textContent: cat.title }),
          Object.assign(document.createElement('span'), { textContent: meta.text || '' })
        );
        if (!cat.showTrigger) {
          info.append(
            Object.assign(document.createElement('small'), {
              className: 'admin-booking-fees-manage-stage',
              textContent: extrasStage
                ? 'From Stay fees \u00B7 Edit opens here'
                : 'From Checkout \u00B7 Edit opens here',
            })
          );
        }
        const actions = document.createElement('div');
        actions.className = 'admin-booking-fees-manage-actions';

        const catLocked =
          Boolean(cat.locked)
          || extraPersonLocked
          || (cat.lockWithStayFees !== false && feesDisabled);
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-booking-fees-manage-edit';
        paintFeeActionButton(editBtn, { icon: FEE_ICON_EDIT, label: 'Edit', mode: 'clear' });
        editBtn.disabled = catLocked;
        editBtn.addEventListener('click', () => {
          feesManageList.hidden = true;
          feesManageBtn.setAttribute('aria-expanded', 'false');
          openFeeDropdown(cat.id);
        });
        actions.append(editBtn);

        if (cat.canDelete) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'admin-booking-fees-manage-delete';
          paintFeeActionButton(deleteBtn, { icon: FEE_ICON_CLEAR, label: 'Clear', mode: 'clear' });
          deleteBtn.disabled = catLocked;
          deleteBtn.addEventListener('click', () => {
            clearFeeCategory(cat.id);
            refreshAllFeeMeta();
            feesMsg.hidden = false;
            feesMsg.textContent = feesDisabled
              ? 'Cleared \u2014 click Save extra person rooms to apply.'
              : cat.id === 'extend' && pendingRevertExtend
                ? 'Extension marked for removal \u2014 click Save stay fees to roll checkout back.'
                : 'Cleared \u2014 click Save stay fees to apply.';
          });
          actions.append(deleteBtn);
        } else {
          actions.append(
            Object.assign(document.createElement('span'), {
              className: 'admin-booking-fees-manage-locked',
              textContent: 'Checkout date already moved',
            })
          );
        }

        item.append(info, actions);
        list.append(item);
      });
      feesManageList.append(list);
    };

    const refreshAllFeeMeta = () => {
      syncExtendPreview();
      feeCategories.forEach((cat) => cat.refreshMeta());
      refreshFeeManageList();
      syncFeeClearControls();
    };

    [
      earlyInput,
      lateSelect,
      arrivalSelect,
      incidentalAmountInput,
      incidentalNoteInput,
      snackProductInput,
      snackTakenInput,
      snackQtyInput,
      snackUnitInput,
      extendInput,
    ].forEach((el) => {
      el.addEventListener('input', refreshAllFeeMeta);
      el.addEventListener('change', refreshAllFeeMeta);
    });

    feesManageBtn.addEventListener('click', () => {
      const open = feesManageList.hidden;
      feesManageList.hidden = !open;
      feesManageBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        closeAllFeeDropdowns();
        refreshFeeManageList();
      }
    });
    if (extraPersonLocked) feesManageBtn.disabled = true;

    feesLayout.append(feeTriggers, feePanels);

    const feesMsg = document.createElement('p');
    feesMsg.className = 'admin-booking-fees-msg';
    feesMsg.dataset.feeMsg = '1';
    feesMsg.hidden = true;

    refreshFeeManageList();
    syncFeeClearControls();
    feesPanel.append(feesHead, feesManageList, feesLayout, feesMsg);

    const collectStayFeesPayload = () => {
      pushIncidentalDraft({ silent: true });
      pushSnackDraft({ silent: true });
      return {
        earlyCheckIn: Boolean(earlyInput.checked),
        lateCheckoutHours: Number(lateSelect.value || 0),
        extraPersons: extraPersonsForFees(),
        extraPersonRoomIndexes: extraRoomInputs
          .filter((input) => input.checked)
          .map((input) => Number(input.dataset.feeExtraRoom)),
        incidentalAmount: 0,
        incidentalNote: null,
        incidentals: incidentalLines.map((line) => ({
          amount: Math.max(0, line.amount),
          note: (line.note || '').trim() || null,
        })),
        serviceFeeAmount: 0,
        snackBeverages: snackLines.map((line) => ({
          product: (line.product || '').trim() || null,
          qty: Math.max(0, line.qty),
          unitAmount: Math.max(0, line.unitAmount),
          takenDate: line.takenDate || manilaTodayIso(),
        })),
        snackBeverageQty: 0,
        snackBeverageUnitAmount: 0,
        snackBeverageProduct: null,
        extendStayNights: Math.min(30, parseIntInput(extendInput.value)),
        revertStayExtension: Boolean(pendingRevertExtend),
        arrivalDiscountRequest: postPaymentLock
          ? (arrivalCurrent === 'SeniorCitizen' || arrivalCurrent === 'Pwd' ? arrivalCurrent : 'None')
          : onSpecialOffer
            ? 'None'
            : String(arrivalSelect.value || 'None'),
      };
    };

    const buildAdditionalFeesSummary = (payload, updatedBooking) => {
      const lines = [];
      const updatedCharges = updatedBooking?.charges || [];
      const findCharge = (type) =>
        updatedCharges.find((c) => String(c.chargeType) === type);

      if (payload.earlyCheckIn) {
        const charge = findCharge('EarlyCheckIn');
        lines.push({
          label: 'Early check-in (11:30 AM)',
          amount: charge ? Number(charge.amount || 0) : 500 * roomCount,
        });
      }
      if (payload.lateCheckoutHours > 0) {
        const charge = findCharge('LateCheckout');
        lines.push({
          label: `Late check-out (+${payload.lateCheckoutHours}h)`,
          amount: charge
            ? Number(charge.amount || 0)
            : 100 * payload.lateCheckoutHours * roomCount,
        });
      }
      if (payload.extraPersons > 0) {
        const charge = findCharge('ExtraPerson');
        lines.push({
          label:
            payload.extraPersons > 1
              ? `Extra person \u00B7 ${payload.extraPersons}`
              : 'Extra person',
          amount: charge
            ? Number(charge.amount || 0)
            : 200 * nights * payload.extraPersons,
        });
      }
      if (payload.arrivalDiscountRequest === 'SeniorCitizen' || payload.arrivalDiscountRequest === 'Pwd') {
        const charge = findCharge('ArrivalDiscount');
        const estimated =
          roomStayTotal > 0
            ? -Math.round(roomStayTotal * 0.2 * 100) / 100
            : 0;
        const amount = charge ? Number(charge.amount || 0) : estimated;
        lines.push({
          label:
            payload.arrivalDiscountRequest === 'SeniorCitizen'
              ? 'Senior Citizen discount (20%)'
              : 'PWD discount (20%)',
          amount,
        });
      }
      if (Array.isArray(payload.incidentals) && payload.incidentals.length) {
        payload.incidentals.forEach((line) => {
          const amount = Math.max(0, Number(line.amount || 0));
          if (amount <= 0) return;
          const note = (line.note || '').trim();
          lines.push({
            label: note ? `Incidental (cash) \u00B7 ${note}` : 'Incidental (cash)',
            amount,
          });
        });
      } else if (payload.incidentalAmount > 0) {
        const note = payload.incidentalNote ? ` \u00B7 ${payload.incidentalNote}` : '';
        lines.push({
          label: `Incidental (cash)${note}`,
          amount: payload.incidentalAmount,
        });
      }
      const snackLinesPayload = Array.isArray(payload.snackBeverages) ? payload.snackBeverages : [];
      if (snackLinesPayload.length) {
        snackLinesPayload.forEach((line) => {
          const qty = Math.max(0, Number(line.qty || 0));
          const unit = Math.max(0, Number(line.unitAmount || 0));
          const total = qty * unit;
          if (total <= 0) return;
          const product = (line.product || '').trim();
          const taken = line.takenDate
            ? formatDate(`${line.takenDate}T12:00:00`) || line.takenDate
            : '';
          const takenPart = taken ? ` \u00B7 ${taken}` : '';
          lines.push({
            label: product
              ? `Snack & beverage \u00B7 ${product}${takenPart} \u00B7 ${qty} \u00D7 ${money(unit)}`
              : `Snack & beverage${takenPart} \u00B7 ${qty} \u00D7 ${money(unit)}`,
            amount: total,
          });
        });
      } else {
        const snackTotal =
          Math.max(0, payload.snackBeverageQty) * Math.max(0, payload.snackBeverageUnitAmount);
        if (snackTotal > 0) {
          const product = payload.snackBeverageProduct
            ? `${payload.snackBeverageProduct} \u00B7 `
            : '';
          lines.push({
            label: `Snack & beverage \u00B7 ${product}${payload.snackBeverageQty} \u00D7 ${money(payload.snackBeverageUnitAmount)}`,
            amount: snackTotal,
          });
        }
      }
      const extendCharge = findCharge('StayExtension');
      const extendQty = extendCharge
        ? Number(extendCharge.quantity || 0)
        : pendingRevertExtend
          ? Math.max(0, payload.extendStayNights)
          : extensionNights + Math.max(0, payload.extendStayNights);
      if (extendQty > 0 || payload.extendStayNights > 0) {
        lines.push({
          label: `Extend stay \u00B7 +${Math.max(extendQty, payload.extendStayNights)} night${
            Math.max(extendQty, payload.extendStayNights) === 1 ? '' : 's'
          }`,
          amount: extendCharge ? Number(extendCharge.amount || 0) : null,
          note: 'Included in room stay',
        });
      } else if (payload.revertStayExtension && extensionNights > 0) {
        lines.push({
          label: `Extend stay removed \u00B7 \u2212${extensionNights} night${extensionNights === 1 ? '' : 's'}`,
          amount: null,
          note: 'Checkout rolled back',
        });
      }
      return lines;
    };

    const showFeesSavedPopup = (lines, onOk) => {
      const popup = detailModal?.querySelector('[data-fees-saved-popup]');
      const list = detailModal?.querySelector('[data-fees-saved-list]');
      const empty = detailModal?.querySelector('[data-fees-saved-empty]');
      const okBtn = detailModal?.querySelector('[data-fees-saved-ok]');
      if (!popup || !list || !okBtn) {
        onOk?.();
        return;
      }
      list.replaceChildren();
      if (!lines.length) {
        if (empty) empty.hidden = false;
        list.hidden = true;
      } else {
        if (empty) empty.hidden = true;
        list.hidden = false;
        lines.forEach((line) => {
          const item = document.createElement('li');
          const label = document.createElement('span');
          label.textContent = line.label;
          if (line.note) {
            label.append(
              Object.assign(document.createElement('small'), { textContent: ` (${line.note})` })
            );
          }
          const value = document.createElement('strong');
          value.textContent = line.amount == null ? '\u2014' : money(line.amount);
          item.append(label, value);
          list.append(item);
        });
      }
      popup.hidden = false;
      const finish = () => {
        popup.hidden = true;
        okBtn.removeEventListener('click', finish);
        onOk?.();
      };
      okBtn.addEventListener('click', finish);
      okBtn.focus();
    };

    if (!extraPersonLocked) {
      const saveFeesBtn = document.createElement('button');
      saveFeesBtn.type = 'button';
      saveFeesBtn.className = 'admin-booking-fees-save';
      paintFeeActionButton(saveFeesBtn, {
        icon: FEE_ICON_SAVE,
        label: feesDisabled ? 'Save extra person rooms' : 'Save stay fees',
        mode: 'clear',
      });
      saveFeesBtn.addEventListener('click', async () => {
        saveFeesBtn.disabled = true;
        closeAllFeeDropdowns();
        const payload = collectStayFeesPayload();
        try {
          const updated = await apiFetch(`/api/admin/bookings/${booking.id}/charges`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const summaryLines = buildAdditionalFeesSummary(payload, updated);
          showFeesSavedPopup(summaryLines, () => openBookingDetails(updated.id, updated));
        } catch (error) {
          feesMsg.hidden = false;
          feesMsg.textContent = error instanceof Error ? error.message : 'Unable to save stay fees.';
          saveFeesBtn.disabled = false;
        }
      });
      feesPanel.append(saveFeesBtn);
    }
    let itemLinesHtml = '';
    (booking.items || []).forEach((line) => {
      const qty = Number(line.quantity || 0);
      const rate = Number(line.pricePerNight || 0);
      const lineTotal = qty * rate * nights;
      const regular = Number(
        line.regularPricePerNight
          ?? booking.specialOfferRegularPricePerNight
          ?? 0
      );
      const showCompare =
        (booking.specialOfferId || booking.cashOnlyPromo) && regular > rate;
      const rateHtml = showCompare
        ? `<small>(<s>${money(regular)}</s> \u2192 ${money(rate)}/night \u00D7 ${nights} night${nights === 1 ? '' : 's'})</small>`
        : `<small>(${money(rate)}/night \u00D7 ${nights} night${nights === 1 ? '' : 's'})</small>`;
      itemLinesHtml += `
        <div class="admin-breakdown-row">
          <span>${qty}\u00D7 ${escapeHtml(line.roomTypeName || 'Room')} ${rateHtml}</span>
          <strong>${money(lineTotal)}</strong>
        </div>
      `;
    });
    if (extensionCharge) {
      itemLinesHtml += `
        <div class="admin-breakdown-row is-sub is-extension">
          <span>${escapeHtml(extensionCharge.label || `Extra night(s) \u00B7 +${extensionNights}`)} <small>(included in room stay)</small></span>
          <strong>${money(extensionCharge.amount)}</strong>
        </div>
      `;
    }

    let feeLinesHtml = '';
    if (!billableCharges.length) {
      feeLinesHtml = `
        <div class="admin-breakdown-row is-sub">
          <span>No stay fees</span>
          <strong>${money(0)}</strong>
        </div>
      `;
    } else {
      billableCharges.forEach((charge) => {
        feeLinesHtml += `
          <div class="admin-breakdown-row is-sub">
            <span>${escapeHtml(charge.label || charge.chargeType || 'Fee')}</span>
            <strong>${money(charge.amount)}</strong>
          </div>
        `;
      });
    }

    let paymentLinesHtml = '';
    if (!payments.length) {
      paymentLinesHtml = `
        <div class="admin-breakdown-row is-sub">
          <span>No payments posted yet</span>
          <strong>${money(0)}</strong>
        </div>
      `;
    } else {
      payments.forEach((payment) => {
        paymentLinesHtml += `
          <div class="admin-breakdown-row is-sub">
            <span>${escapeHtml(formatDateTime(payment.paidAtUtc))} \u00B7 ${escapeHtml(formatPaymentMethod(payment.method))} <small>${escapeHtml(payment.receiptNumber || '')}</small></span>
            <strong>${money(payment.amount)}</strong>
          </div>
        `;
      });
    }

    const breakdownPanel = document.createElement('section');
    breakdownPanel.className = 'admin-booking-breakdown';
    breakdownPanel.setAttribute('data-price-breakdown', '1');

    const breakdownToggle = document.createElement('button');
    breakdownToggle.type = 'button';
    breakdownToggle.className = 'admin-breakdown-toggle';
    breakdownToggle.setAttribute('data-breakdown-toggle', '1');
    breakdownToggle.setAttribute('aria-expanded', 'false');

    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'admin-breakdown-toggle-label';
    toggleLabel.textContent = `Price & payments (${nights} night${nights === 1 ? '' : 's'})`;

    const toggleMeta = document.createElement('span');
    toggleMeta.className = 'admin-breakdown-toggle-meta';
    const toggleTotal = document.createElement('strong');
    toggleTotal.textContent = money(stayTotal);
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'admin-breakdown-icon';
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggleIcon.textContent = '\u25BE';
    toggleMeta.append(toggleTotal, toggleIcon);
    breakdownToggle.append(toggleLabel, toggleMeta);

    const breakdownBody = document.createElement('div');
    breakdownBody.className = 'admin-breakdown-card';
    breakdownBody.setAttribute('data-breakdown-body', '1');
    breakdownBody.innerHTML = `
      <p class="admin-breakdown-section-title">Room stay</p>
      <div class="admin-breakdown-lines">
        ${itemLinesHtml || `<div class="admin-breakdown-row"><span>Stay</span><strong>${money(roomStayTotal)}</strong></div>`}
      </div>
      <div class="admin-breakdown-row is-sub">
        <span>Room subtotal${roomCount ? ` \u00B7 ${roomCount} room${roomCount === 1 ? '' : 's'}` : ''}</span>
        <strong>${money(roomStayTotal)}</strong>
      </div>
      <div class="admin-breakdown-divider"></div>
      <p class="admin-breakdown-section-title">Stay fees</p>
      <div class="admin-breakdown-lines">
        ${feeLinesHtml}
      </div>
      <div class="admin-breakdown-divider"></div>
      <div class="admin-breakdown-row is-total">
        <span>Stay total</span>
        <strong>${money(stayTotal)}</strong>
      </div>
      <div class="admin-breakdown-divider"></div>
      <p class="admin-breakdown-section-title">Payment history</p>
      <div class="admin-breakdown-lines">
        ${paymentLinesHtml}
      </div>
      <div class="admin-breakdown-row is-sub">
        <span>Already paid</span>
        <strong>${money(amountPaid)}</strong>
      </div>
      <div class="admin-breakdown-divider"></div>
      <div class="admin-breakdown-row is-total is-balance">
        <span>${
          balanceDue < -0.009 ? 'Overpaid' : balanceDue <= 0.009 ? 'Fully paid' : 'Balance due'
        }</span>
        <strong>${money(balanceDue < -0.009 ? Math.abs(balanceDue) : Math.max(0, balanceDue))}</strong>
      </div>
    `;

    breakdownToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = !breakdownPanel.classList.contains('is-open');
      breakdownPanel.classList.toggle('is-open', open);
      breakdownToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      breakdownBody.hidden = !open;
    });
    breakdownBody.hidden = true;

    breakdownPanel.append(breakdownToggle, breakdownBody);

    const roomsBlock = document.createElement('section');
    roomsBlock.className = 'admin-booking-rooms-block';
    const onRoomsStep =
      !booking.isArchived && status === 'Confirmed' && !hasAssignedRooms
        ? () => renderConfirmAssign(booking, { assignOnly: true })
        : null;

    const heading = document.createElement('h3');
    heading.textContent =
      onRoomsStep ? 'Step 3 \u00B7 Assign rooms' : 'Rooms';
    const lines = document.createElement('ul');
    lines.className = 'admin-booking-lines';
    (booking.items || []).forEach((line) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const assigned = (line.assignedRooms || [])
        .map((room) => room.roomNumber)
        .filter(Boolean);
      name.textContent = assigned.length
        ? `${line.quantity}\u00D7 ${line.roomTypeName} \u2192 ${assigned.join(', ')}`
        : `${line.quantity}\u00D7 ${line.roomTypeName}${status === 'Confirmed' ? ' \u00B7 rooms not assigned yet' : ''}`;
      const rate = document.createElement('strong');
      const promo = Number(line.pricePerNight || 0);
      const regular = Number(
        line.regularPricePerNight
          ?? booking.specialOfferRegularPricePerNight
          ?? 0
      );
      if ((booking.specialOfferId || booking.cashOnlyPromo) && regular > promo) {
        rate.innerHTML = `<s class="admin-rate-was">${money(regular)}</s> \u2192 ${money(promo)} / night`;
      } else {
        rate.textContent = `${money(promo)} / night`;
      }
      item.append(name, rate);
      lines.append(item);
    });
    roomsBlock.append(heading, lines);

    if (onRoomsStep) {
      roomsBlock.classList.add('is-step-assign');
      const stepLede = document.createElement('p');
      stepLede.className = 'admin-booking-rooms-step-lede';
      if (balanceDue > 0.009) {
        stepLede.textContent =
          `Finish payment first (balance ${money(balanceDue)}), then use Assign rooms. Reopen anytime if the picker closed.`;
      } else if (!canAssignRoomsToday(booking)) {
        stepLede.textContent =
          `Check-in is ${formatDate(booking.checkInAtUtc || booking.checkIn)} (not today yet), so room numbers cannot be assigned. ` +
          `Use Adjust stay if the guest called to arrive earlier \u2014 Assign rooms unlocks on the new check-in date when fully paid.`;
      } else {
        stepLede.textContent =
          'Pick room numbers for this stay. If the assign screen closes or the system restarts, reopen Assign rooms here.';
      }

      const stepActions = document.createElement('div');
      stepActions.className = 'admin-booking-rooms-step-actions';

      const adjustStayBtn = document.createElement('button');
      adjustStayBtn.type = 'button';
      adjustStayBtn.className = 'admin-booking-rooms-adjust-btn';
      adjustStayBtn.textContent = 'Adjust stay';
      adjustStayBtn.title = 'Change check-in / check-out when the guest reschedules';
      adjustStayBtn.addEventListener('click', () =>
        renderBookingEdit(booking, { adjustStay: true })
      );

      const assignStepBtn = actionFlowButton({
        step: 3,
        label: 'Assign rooms',
        icon: FLOW_STEP_ICONS.rooms,
        className: 'admin-booking-confirm admin-booking-rooms-assign-btn',
        onClick: onRoomsStep,
      });
      stepActions.append(adjustStayBtn, assignStepBtn);
      roomsBlock.append(stepLede, stepActions);
    }

    const receptionFlow = resolveReceptionFlowStep({
      status,
      balanceDue,
      hasAssignedRooms,
      isArchived: Boolean(booking.isArchived),
      occupying: occupyingGuest,
      extrasStage,
    });
    updateReceptionFlowPath({
      status,
      balanceDue,
      hasAssignedRooms,
      isArchived: Boolean(booking.isArchived),
      occupying: occupyingGuest,
      extrasStage,
      onRoomsStepClick: onRoomsStep,
    });

    detailBody.replaceChildren();
    if (receptionFlow.current === 'rooms') {
      detailBody.append(summary, guestDetails, roomsBlock, feesPanel, breakdownPanel);
    } else if (receptionFlow.current === 'fees') {
      // Fees stage: stay fees first; guest details stay collapsed by default.
      detailBody.append(summary, feesPanel, guestDetails, breakdownPanel, roomsBlock);
    } else {
      detailBody.append(summary, guestDetails, feesPanel, breakdownPanel, roomsBlock);
    }

    // Secondary actions (left / first)
    if (!booking.isArchived && status !== 'Confirmed') {
      detailActions.append(
        actionIconButton({
          label: 'Edit booking',
          icon: ACTION_ICONS.edit,
          onClick: () => renderBookingEdit(booking),
        })
      );
    } else if (!booking.isArchived && status === 'Confirmed' && !hasAssignedRooms) {
      // Step 3: guest may call to reschedule arrival before rooms are assigned.
      detailActions.append(
        actionIconButton({
          label: 'Adjust stay',
          icon: ACTION_ICONS.edit,
          onClick: () => renderBookingEdit(booking, { adjustStay: true }),
        })
      );
    } else if (!booking.isArchived && status === 'Confirmed' && hasAssignedRooms) {
      // Guest schedule error after rooms assigned \u2014 contact + dates only.
      detailActions.append(
        actionIconButton({
          label: 'Correct guest / stay',
          icon: ACTION_ICONS.edit,
          onClick: () => renderBookingEdit(booking, { hardEdit: true }),
        })
      );
    }

    // Cancel only on Confirm / Payment steps \u2014 not Rooms, Fees, Extras, or Checkout.
    if (
      !booking.isArchived &&
      (receptionFlow.current === 'confirm' || receptionFlow.current === 'pay')
    ) {
      detailActions.append(
        actionIconButton({
          label: 'Cancel booking',
          icon: ACTION_ICONS.cancel,
          className: 'admin-booking-delete',
          onClick: (event) => cancelBooking(booking, event.currentTarget),
        })
      );
    }

    // Payments only after confirmation \u2014 hidden while Pending.
    if (canRecordPayment(booking)) {
      const canTakePayment = balanceDue > 0.009;
      if (canTakePayment && !hasAssignedRooms) {
        detailActions.append(
          actionFlowButton({
            step: 2,
            label: 'Record payment',
            icon: FLOW_STEP_ICONS.pay,
            className: 'admin-booking-confirm',
            onClick: () => openPaymentViewModal(booking),
          })
        );
      } else {
        detailActions.append(
          actionIconButton({
            label: 'Payments \u2014 view record',
            icon: ACTION_ICONS.payments,
            onClick: () => openPaymentViewModal(booking),
          })
        );
      }
    }

    // Primary next-step CTA last (rightmost)
    if (!booking.isArchived && status === 'Confirmed') {
      if (!hasAssignedRooms) {
        // Always keep Assign rooms on step 3 so staff can reopen after a crash / closed picker.
        detailActions.append(
          actionFlowButton({
            step: 3,
            label: 'Assign rooms',
            icon: FLOW_STEP_ICONS.rooms,
            className: 'admin-booking-confirm',
            onClick: () => renderConfirmAssign(booking, { assignOnly: true }),
          })
        );
        if (balanceDue > 0.009) {
          const note = document.createElement('p');
          note.className = 'admin-booking-assign-tip';
          note.textContent = `Step 2: record full payment before assigning rooms. Balance due: ${money(balanceDue)}.`;
          detailBody.append(note);
        } else if (!canAssignRoomsToday(booking)) {
          const note = document.createElement('p');
          note.className = 'admin-booking-assign-tip';
          note.textContent = arrivalAssignMessage(booking);
          detailBody.append(note);
        }
      } else if (occupyingGuest && !extrasStage) {
        detailActions.append(
          actionFlowButton({
            step: 5,
            label: 'Continue to checkout',
            icon: FLOW_STEP_ICONS.checkout,
            className: 'admin-booking-confirm is-emphasized',
            onClick: () => enterReceptionExtrasStage(booking),
          })
        );
      } else {
        if (extrasStage) {
          detailActions.append(
            actionIconButton({
              label: 'Back to fees',
              icon: FLOW_STEP_ICONS.back,
              className: 'admin-booking-flow-back-icon',
              onClick: () => leaveReceptionExtrasStage(booking),
            })
          );
          if (balanceDue > 0.009) {
            detailActions.append(
              actionFlowButton({
                step: 2,
                label: 'Record payment',
                icon: FLOW_STEP_ICONS.pay,
                className: 'admin-booking-confirm is-emphasized',
                onClick: () => openAddPaymentModal(booking),
              })
            );
          } else {
            detailActions.append(
              actionFlowButton({
                step: 6,
                label: 'Archive guest',
                icon: FLOW_STEP_ICONS.archive,
                className: 'admin-booking-confirm is-emphasized',
                onClick: (event) => checkoutBooking(booking, event.currentTarget),
              })
            );
          }
        } else {
          detailActions.append(
            actionFlowButton({
              step: 6,
              label: 'Archive guest',
              icon: FLOW_STEP_ICONS.archive,
              className: 'admin-booking-confirm',
              onClick: (event) => checkoutBooking(booking, event.currentTarget),
            })
          );
        }
      }
    }

    if (!booking.isArchived && status === 'Pending') {
      detailActions.append(
        actionFlowButton({
          step: 1,
          label: 'Confirm booking',
          icon: FLOW_STEP_ICONS.confirm,
          className: 'admin-booking-confirm',
          onClick: () => renderConfirmAssign(booking),
        })
      );
    }
  }

  async function renderConfirmAssign(booking, options = {}) {
    if (!detailBody || !detailActions) return;
    const assignOnly = Boolean(options.assignOnly);
    const canAssign = canAssignRoomsToday(booking);
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const paymentSummary = await loadBookingPaymentSummary(booking);
    if (paymentSummary) fillPaymentSummaryFields(booking, paymentSummary);
    else fillPaymentSummaryFields(booking, null);
    const fullyPaid = isBookingFullyPaid(booking, paymentSummary);

    // Pending confirm: confirm the booking only \u2014 rooms come after full payment.
    if (!assignOnly) {
      const intro = document.createElement('p');
      intro.className = 'admin-booking-assign-intro';
      intro.textContent = fullyPaid && canAssign
        ? 'Guest is fully paid. Confirm and assign room numbers now.'
        : 'Confirm this booking now. Record payment only after confirmation, then assign rooms when fully paid'
          + (canAssign ? '.' : ` (and from arrival date ${formatDate(booking.checkInAtUtc || booking.checkIn)}).`);
      detailBody.append(intro);

      if (!fullyPaid) {
        const tip = document.createElement('p');
        tip.className = 'admin-booking-assign-tip';
        tip.textContent =
          `Balance due ${money(paymentPriceContext.balanceDue)}. After you confirm, record payment \u2014 rooms unlock when fully paid.`;
        detailBody.append(tip);
      }

      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.textContent = 'Back';
      backButton.addEventListener('click', () => renderBookingDetails(booking));

      if (!(fullyPaid && canAssign)) {
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'admin-booking-confirm';
        confirmButton.textContent = 'Confirm booking';
        confirmButton.addEventListener('click', async () => {
          confirmButton.disabled = true;
          try {
            await updateStatus(booking, 'Confirmed', confirmButton, [], { stayOnBookings: true });
          } catch (error) {
            showBookingMessage(error instanceof Error ? error.message : 'Unable to confirm booking.', true);
            confirmButton.disabled = false;
          }
        });
        detailActions.append(backButton, confirmButton);
        return;
      }
      // Fully paid + can assign today: fall through to required room picker below.
    }

    if (assignOnly && !canAssign) {
      const blocked = document.createElement('p');
      blocked.className = 'admin-booking-assign-error';
      blocked.setAttribute('role', 'alert');
      blocked.textContent = arrivalAssignMessage(booking);
      const backEarly = document.createElement('button');
      backEarly.type = 'button';
      backEarly.textContent = 'Back';
      backEarly.addEventListener('click', () => renderBookingDetails(booking));
      detailBody.append(blocked);
      detailActions.append(backEarly);
      return;
    }

    if (assignOnly && !fullyPaid) {
      const blocked = document.createElement('p');
      blocked.className = 'admin-booking-assign-error';
      blocked.setAttribute('role', 'alert');
      blocked.textContent = `Guest must be fully paid before assigning rooms. Balance due: ${money(paymentPriceContext.balanceDue)}.`;
      const backEarly = document.createElement('button');
      backEarly.type = 'button';
      backEarly.textContent = 'Back';
      backEarly.addEventListener('click', () => renderBookingDetails(booking));
      const payButton = document.createElement('button');
      payButton.type = 'button';
      payButton.className = 'admin-booking-confirm';
      payButton.textContent = 'Record payment';
      payButton.addEventListener('click', () => openAddPaymentModal(booking));
      detailBody.append(blocked);
      detailActions.append(backEarly, payButton);
      return;
    }

    if (assignOnly) {
      const intro = document.createElement('p');
      intro.className = 'admin-booking-assign-intro';
      intro.textContent = 'Pick room numbers for this fully paid stay.';
      detailBody.append(intro);
    } else if (!detailBody.querySelector('.admin-booking-assign-intro')) {
      const intro = document.createElement('p');
      intro.className = 'admin-booking-assign-intro';
      intro.textContent = 'Pick room numbers, then confirm.';
      detailBody.append(intro);
    }

    const form = document.createElement('form');
    form.className = 'admin-booking-assign-form';
    form.setAttribute('novalidate', '');
    const groups = document.createElement('div');
    groups.className = 'admin-booking-assign-groups';
    const localError = document.createElement('p');
    localError.className = 'admin-booking-assign-error';
    localError.hidden = true;
    localError.setAttribute('role', 'alert');

    function setAssignError(message) {
      localError.hidden = !message;
      localError.textContent = message || '';
    }

    try {
      const assignable = await apiFetch(`/api/admin/bookings/${booking.id}/assignable-rooms`);
      if (!assignable?.length) {
        groups.textContent = 'No room types found on this booking.';
      } else {
        assignable.forEach((group) => {
          const section = document.createElement('section');
          section.className = 'admin-booking-assign-group';
          section.dataset.roomTypeId = String(group.roomTypeId);

          const title = document.createElement('h3');
          title.textContent = `${group.roomTypeName} \u00B7 pick ${group.quantityNeeded}`;
          section.append(title);

          if (!group.rooms?.length) {
            const empty = document.createElement('p');
            empty.className = 'admin-booking-assign-empty';
            empty.textContent = `No free ${group.roomTypeName} rooms for these dates (held by overlapping bookings or already occupied).`;
            section.append(empty);
          } else {
            for (let index = 0; index < group.quantityNeeded; index += 1) {
              const field = document.createElement('label');
              const caption = document.createElement('span');
              caption.textContent =
                group.quantityNeeded > 1 ? `Room ${index + 1}` : 'Room number';
              const select = document.createElement('select');
              select.required = true;
              select.name = `room-${group.roomTypeId}-${index}`;
              select.dataset.roomTypeId = String(group.roomTypeId);
              const placeholder = document.createElement('option');
              placeholder.value = '';
              placeholder.textContent = 'Select room\u2026';
              select.append(placeholder);
              group.rooms.forEach((room) => {
                const option = document.createElement('option');
                option.value = String(room.roomId);
                option.textContent = room.roomNumber;
                select.append(option);
              });
              select.addEventListener('change', () => {
                select.classList.remove('is-invalid');
                setAssignError('');
                syncAssignOptions(groups);
              });
              field.append(caption, select);
              section.append(field);
            }
          }

          groups.append(section);
        });
      }
    } catch (error) {
      groups.textContent = error instanceof Error ? error.message : 'Unable to load rooms.';
    }

    form.append(groups);
    detailBody.append(form, localError);

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.addEventListener('click', () => renderBookingDetails(booking));

    function collectAssignments(requireComplete) {
      const payloadAssignments = [];
      const used = new Set();
      let valid = true;

      groups.querySelectorAll('.admin-booking-assign-group').forEach((section) => {
        const roomTypeId = Number(section.dataset.roomTypeId);
        const selects = Array.from(section.querySelectorAll('select'));
        const roomIds = [];
        selects.forEach((select) => {
          const value = Number(select.value);
          if (!value) {
            if (requireComplete) {
              valid = false;
              select.classList.add('is-invalid');
            }
            return;
          }
          select.classList.remove('is-invalid');
          if (used.has(value)) {
            valid = false;
            select.classList.add('is-invalid');
            return;
          }
          used.add(value);
          roomIds.push(value);
        });
        if (requireComplete && roomIds.length !== selects.length) {
          valid = false;
        }
        if (roomIds.length) {
          payloadAssignments.push({ roomTypeId, roomIds });
        }
      });

      return { payloadAssignments, valid };
    }

    if (assignOnly) {
      const assignButton = document.createElement('button');
      assignButton.type = 'button';
      assignButton.className = 'admin-booking-confirm';
      assignButton.textContent = 'Assign rooms';
      assignButton.addEventListener('click', async () => {
        const { payloadAssignments, valid } = collectAssignments(true);
        if (!valid || !payloadAssignments.length) {
          setAssignError('Select a unique available room for each booking quantity.');
          return;
        }
        setAssignError('');
        await assignRoomsToBooking(booking, assignButton, payloadAssignments);
      });
      detailActions.append(backButton, assignButton);
    } else {
      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'admin-booking-confirm';
      confirmButton.textContent = 'Confirm & assign rooms';
      confirmButton.addEventListener('click', async () => {
        const { payloadAssignments, valid } = collectAssignments(true);
        if (!valid || !payloadAssignments.length) {
          setAssignError('Select a room for each line before confirming.');
          return;
        }
        setAssignError('');
        await updateStatus(booking, 'Confirmed', confirmButton, payloadAssignments);
      });
      detailActions.append(backButton, confirmButton);
    }

    syncAssignOptions(groups);
  }

  function syncAssignOptions(groupsRoot) {
    if (!groupsRoot) return;
    const selected = new Set(
      Array.from(groupsRoot.querySelectorAll('select'))
        .map((select) => select.value)
        .filter(Boolean)
    );

    groupsRoot.querySelectorAll('select').forEach((select) => {
      const current = select.value;
      Array.from(select.options).forEach((option) => {
        if (!option.value) return;
        option.disabled = selected.has(option.value) && option.value !== current;
      });
    });
  }

  function editField(label, name, type, value, fullWidth = false) {
    const field = document.createElement('label');
    if (fullWidth) field.className = 'is-full-width';
    const caption = document.createElement('span');
    const input = document.createElement('input');
    caption.textContent = label;
    input.name = name;
    input.type = type;
    input.value = value || '';
    input.required = true;
    const key = String(name || '').toLowerCase();
    if (key.includes('phone')) {
      input.setAttribute('data-mori-filter', 'phone');
      input.setAttribute('inputmode', 'tel');
      input.maxLength = 40;
      input.autocomplete = 'tel';
    } else if (key.includes('email')) {
      input.setAttribute('data-mori-filter', 'email');
      input.setAttribute('inputmode', 'email');
      input.maxLength = 254;
      input.autocomplete = 'email';
    } else if (key.includes('name')) {
      input.setAttribute('data-mori-filter', 'person-name');
      input.maxLength = 120;
      input.autocomplete = 'name';
    }
    field.append(caption, input);
    return field;
  }

  function editSelectField(label, name, options, selectedValue) {
    const field = document.createElement('label');
    const caption = document.createElement('span');
    const select = document.createElement('select');
    caption.textContent = label;
    select.name = name;
    select.required = true;
    options.forEach((option) => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      if (String(option.value) === String(selectedValue)) node.selected = true;
      select.append(node);
    });
    field.append(caption, select);
    return field;
  }

  let editRoomTypeCatalog = [];

  async function loadEditRoomTypeCatalog() {
    if (editRoomTypeCatalog.length) return editRoomTypeCatalog;
    const rows = await apiFetch('/api/rooms/types');
    editRoomTypeCatalog = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        roomTypeId: Number(row.roomTypeId ?? row.RoomTypeId),
        name: String(row.name ?? row.Name ?? 'Room'),
        pricePerNight: Number(row.pricePerNight ?? row.PricePerNight ?? 0),
        availableCount: Number(row.availableCount ?? row.AvailableCount ?? 0),
      }))
      .filter((row) => row.roomTypeId > 0);
    return editRoomTypeCatalog;
  }

  function createEditRoomLine(roomTypes, roomTypeId, quantity, options = {}) {
    const needsType = Boolean(options.needsType);
    const row = document.createElement('div');
    row.className = 'admin-booking-edit-room-line';
    row.dataset.editRoomLine = '1';
    if (needsType) {
      row.dataset.needsType = '1';
      row.classList.add('is-needs-type');
    }

    const indexEl = document.createElement('strong');
    indexEl.className = 'admin-booking-edit-room-index';
    indexEl.dataset.editRoomIndex = '1';
    indexEl.textContent = 'Room';

    const typeLabel = document.createElement('label');
    typeLabel.className = 'admin-booking-edit-room-type';
    const typeCaption = document.createElement('span');
    typeCaption.dataset.editRoomTypeCaption = '1';
    typeCaption.textContent = 'Room type';
    const typeSelect = document.createElement('select');
    typeSelect.dataset.roomTypeSelect = '1';
    typeSelect.required = true;
    if (needsType || !roomTypeId) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select room type';
      placeholder.selected = true;
      typeSelect.append(placeholder);
    }
    roomTypes.forEach((type) => {
      const opt = document.createElement('option');
      opt.value = String(type.roomTypeId);
      opt.textContent = type.name;
      opt.dataset.roomTypeName = type.name;
      if (!needsType && Number(type.roomTypeId) === Number(roomTypeId)) opt.selected = true;
      typeSelect.append(opt);
    });
    typeLabel.append(typeCaption, typeSelect);

    const qtyInput = document.createElement('input');
    qtyInput.type = 'hidden';
    qtyInput.value = String(Math.max(1, Number(quantity) || 1));
    qtyInput.dataset.roomQty = '1';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'admin-booking-edit-room-remove';
    removeBtn.dataset.removeRoomLine = '1';
    removeBtn.textContent = 'Remove';
    removeBtn.hidden = true;

    row.append(indexEl, typeLabel, qtyInput, removeBtn);
    return row;
  }

  function numberEditRoomLines(form) {
    if (!form) return;
    form.querySelectorAll('[data-edit-room-line]').forEach((row, index) => {
      const label = row.querySelector('[data-edit-room-index]');
      const selected = row.querySelector('[data-room-type-select] option:checked');
      const chosen =
        selected?.value && (selected.dataset.roomTypeName || selected.textContent || '').trim();
      if (label) label.textContent = `Room ${index + 1}`;
      const caption = row.querySelector('[data-edit-room-type-caption]');
      if (caption) caption.textContent = chosen || 'Room type';
    });
  }

  function readEditRoomLines(form) {
    return Array.from(form.querySelectorAll('[data-edit-room-line]')).map((row) => {
      const roomTypeId = Number(row.querySelector('[data-room-type-select]')?.value || 0);
      const quantity = Math.max(1, Number(row.querySelector('[data-room-qty]')?.value || 1));
      const selected = row.querySelector('[data-room-type-select] option:checked');
      const roomTypeName =
        selected?.dataset.roomTypeName?.trim() || selected?.textContent?.trim() || 'Room';
      const needsType = row.dataset.needsType === '1' || !roomTypeId;
      return { roomTypeId, quantity, roomTypeName, needsType };
    });
  }

  function aggregateEditRoomLines(lines) {
    const byType = new Map();
    (lines || []).forEach((line) => {
      if (!line?.roomTypeId || line.quantity <= 0) return;
      const current = byType.get(line.roomTypeId);
      if (current) {
        current.quantity += line.quantity;
        return;
      }
      byType.set(line.roomTypeId, {
        roomTypeId: line.roomTypeId,
        roomTypeName: line.roomTypeName || 'Room',
        quantity: line.quantity,
      });
    });
    return Array.from(byType.values());
  }

  function wireEditRoomLine(row, form, onChange) {
    row.querySelector('[data-remove-room-line]')?.addEventListener('click', () => {
      const lines = form.querySelectorAll('[data-edit-room-line]');
      if (lines.length <= 1) {
        const qty = row.querySelector('[data-room-qty]');
        if (qty) qty.value = '0';
        onChange?.();
        return;
      }
      row.remove();
      onChange?.();
    });
    const typeSelect = row.querySelector('[data-room-type-select]');
    typeSelect?.addEventListener('change', () => {
      if (typeSelect.value) {
        delete row.dataset.needsType;
        row.classList.remove('is-needs-type');
      } else {
        row.dataset.needsType = '1';
        row.classList.add('is-needs-type');
      }
      onChange?.();
    });
    row.querySelector('[data-room-qty]')?.addEventListener('change', onChange);
    row.querySelector('[data-room-qty]')?.addEventListener('input', onChange);
  }

  function parseClockToMinutes(timeText) {
    const text = String(timeText || '').trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return null;
    }
    return hh * 60 + mm;
  }

  function minutesToClock(totalMinutes) {
    const safe = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
    const hh = String(Math.floor(safe / 60)).padStart(2, '0');
    const mm = String(safe % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function checkInTimeOptions() {
    const list = [{ value: '11:30', label: '11:30 \u2014 early check-in' }];
    for (let mins = 14 * 60; mins <= 23 * 60 + 30; mins += 30) {
      const value = minutesToClock(mins);
      list.push({ value, label: `${value} \u2014 free of charge` });
    }
    return list;
  }

  function checkOutTimeOptions() {
    return [
      { value: '12:00', label: '12:00 \u2014 free of charge' },
      { value: '13:00', label: '13:00 \u2014 late checkout (+1h)' },
      { value: '14:00', label: '14:00 \u2014 late checkout (+2h)' },
      { value: '15:00', label: '15:00 \u2014 late checkout (+3h max)' },
    ];
  }

  function normalizeCheckInTime(value) {
    const mins = parseClockToMinutes(value);
    if (mins == null) return '14:00';
    if (mins <= 11 * 60 + 30) return '11:30';
    if (mins < 14 * 60) return '14:00';
    const rounded = Math.round(mins / 30) * 30;
    return minutesToClock(Math.max(14 * 60, Math.min(23 * 60 + 30, rounded)));
  }

  function normalizeCheckOutTime(value) {
    const mins = parseClockToMinutes(value);
    if (mins == null) return '12:00';
    if (mins <= 12 * 60) return '12:00';
    if (mins <= 13 * 60) return '13:00';
    if (mins <= 14 * 60) return '14:00';
    return '15:00';
  }

  function roomsEditPreview(booking) {
    const lines = (booking.items || [])
      .map((line) => {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) return '';
        return `${qty}\u00D7 ${line.roomTypeName || 'Room'}`;
      })
      .filter(Boolean);
    return lines.length ? lines.join(' \u00B7 ') : 'No rooms on this booking yet';
  }

  function bookingRoomQuantity(booking) {
    return Math.max(
      1,
      (booking.items || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    );
  }

  function bookingExtraPersons(booking) {
    const charges = booking.charges || booking.Charges || [];
    const extra = charges.find(
      (c) => String(c.chargeType ?? c.ChargeType ?? '') === 'ExtraPerson'
    );
    return Math.max(0, Number(extra?.quantity ?? extra?.Quantity ?? 0));
  }

  function normalizeEditGuestRooms(booking, roomQtyFallback, extraFallback) {
    const raw = booking.guestRooms || booking.GuestRooms;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((room) => ({
        adults: Math.max(0, Number(room.adults ?? room.Adults ?? 0)),
        children: Math.max(0, Number(room.children ?? room.Children ?? 0)),
      })).map((room) => ({
        adults: Math.max(1, room.adults || (room.children > 0 ? 1 : 2)),
        children: room.children,
      }));
    }
    const adults = Number(booking.adultCount ?? booking.AdultCount ?? 0);
    const children = Number(booking.childCount ?? booking.ChildCount ?? 0);
    if (adults + children > 0) {
      return [{ adults: Math.max(1, adults), children: Math.max(0, children) }];
    }
    return Array.from({ length: Math.max(1, roomQtyFallback) }, (_, index) => {
      if (index === 0) {
        const withExtra = Math.min(3, 2 + Number(extraFallback || 0));
        return { adults: Math.max(1, withExtra), children: 0 };
      }
      return { adults: 2, children: 0 };
    });
  }

  function makeEditCategoryPanel({ id, title, preview, open = false, onOpen, onClose, accordionRoot }) {
    const panel = document.createElement('section');
    panel.className = `admin-booking-edit-category admin-booking-edit-category--${id}${open ? ' is-open' : ''}`;
    panel.dataset.editCategory = id;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'admin-booking-edit-category-toggle';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.innerHTML =
      `<span class="admin-booking-edit-category-badge" aria-hidden="true"></span>` +
      `<span class="admin-booking-edit-category-copy">` +
      `<strong class="admin-booking-edit-category-title">${escapeHtml(title)}</strong>` +
      `<small class="admin-booking-edit-category-preview">${escapeHtml(preview || '')}</small>` +
      `</span>` +
      `<span class="admin-booking-edit-category-attention" hidden></span>` +
      `<span class="admin-booking-edit-category-chevron" aria-hidden="true">\u25BE</span>`;

    const body = document.createElement('div');
    body.className = 'admin-booking-edit-category-body';
    body.hidden = !open;

    const previewEl = toggle.querySelector('.admin-booking-edit-category-preview');
    const attentionEl = toggle.querySelector('.admin-booking-edit-category-attention');

    function setOpen(nextOpen) {
      const wasOpen = panel.classList.contains('is-open');
      panel.classList.toggle('is-open', nextOpen);
      toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      body.hidden = !nextOpen;
      if (nextOpen) onOpen?.();
      else if (wasOpen) onClose?.();
    }

    toggle.addEventListener('click', () => {
      const nextOpen = !panel.classList.contains('is-open');
      if (nextOpen && accordionRoot) {
        accordionRoot.querySelectorAll('[data-edit-category].is-open').forEach((other) => {
          if (other === panel) return;
          other.classList.remove('is-open');
          const otherToggle = other.querySelector('.admin-booking-edit-category-toggle');
          const otherBody = other.querySelector('.admin-booking-edit-category-body');
          if (otherToggle) otherToggle.setAttribute('aria-expanded', 'false');
          if (otherBody) otherBody.hidden = true;
          other.dispatchEvent(new CustomEvent('edit-category-closed', { bubbles: false }));
        });
      }
      setOpen(nextOpen);
    });

    panel.addEventListener('edit-category-closed', () => {
      onClose?.();
    });

    panel.append(toggle, body);
    return {
      panel,
      body,
      toggle,
      setOpen,
      isOpen: () => panel.classList.contains('is-open'),
      setPreview(text) {
        if (previewEl) previewEl.textContent = text || '';
      },
      setAttention(text) {
        if (!attentionEl) return;
        const label = String(text || '').trim();
        if (!label) {
          attentionEl.hidden = true;
          attentionEl.textContent = '';
          panel.classList.remove('has-attention');
          return;
        }
        attentionEl.hidden = false;
        attentionEl.textContent = label;
        panel.classList.add('has-attention');
      },
    };
  }

  function makeHeadCountStepper(label, value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-booking-edit-headcount-counter';
    const caption = document.createElement('span');
    caption.className = 'admin-booking-edit-headcount-label';
    caption.textContent = label;
    const controls = document.createElement('div');
    controls.className = 'admin-booking-edit-headcount-controls';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.textContent = '\u2212';
    const count = document.createElement('span');
    count.className = 'admin-booking-edit-headcount-value';
    count.setAttribute('aria-live', 'polite');
    count.textContent = String(value);
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.textContent = '+';
    const sync = (next) => {
      count.textContent = String(next);
      onChange(next, { dec, inc });
    };
    dec.addEventListener('click', () => {
      const current = Number(count.textContent || 0);
      sync(Math.max(0, current - 1));
    });
    inc.addEventListener('click', () => {
      const current = Number(count.textContent || 0);
      sync(current + 1);
    });
    controls.append(dec, count, inc);
    wrap.append(caption, controls);
    wrap._setValue = (next) => {
      count.textContent = String(next);
    };
    wrap._getValue = () => Number(count.textContent || 0);
    wrap._setButtons = ({ canDec, canInc }) => {
      dec.disabled = !canDec;
      inc.disabled = !canInc;
    };
    return wrap;
  }

  function renderBookingEdit(booking, options = {}) {
    if (!detailBody || !detailActions) return;
    const adjustStay = Boolean(options.adjustStay);
    const hardEdit = Boolean(options.hardEdit);
    const needsAvailPreview = true;
    const BASE_GUESTS_PER_ROOM = 2;
    const MAX_GUESTS_PER_ROOM = 3;
    const MAX_EXTRA_PERSONS_PER_ROOM = 1;
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const form = document.createElement('form');
    form.className = 'admin-booking-edit-form';
    if (adjustStay) form.classList.add('is-adjust-stay');
    if (hardEdit) form.classList.add('is-hard-edit');

    const pastDateNote =
      ' Reception can set check-in to a past date when correcting a schedule.';

    const intro = document.createElement('p');
    intro.className = 'admin-booking-edit-hint';
    intro.textContent = hardEdit
      ? 'Update guest contact and dates first. Head count uses per-room adults/children (like guest booking). Assigned room numbers stay locked.' +
        pastDateNote
      : 'Edit contact & dates, then guest head count per room (Adults / Children). Add another room to open a new head-count card \u2014 then assign its room type under Edit rooms.' +
        pastDateNote;

    const roomQtyInitial = bookingRoomQuantity(booking);
    const extraInitial = bookingExtraPersons(booking);
    /** @type {{ adults: number, children: number }[]} */
    let editGuestRooms = normalizeEditGuestRooms(booking, roomQtyInitial, extraInitial);

    const contactPreview = [booking.guestName, booking.guestPhone, booking.guestEmail]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' \u00B7 ');
    const contactCategory = makeEditCategoryPanel({
      id: 'contact',
      title: 'Guest contact & dates',
      preview: contactPreview || 'No contact on file',
      open: true,
      accordionRoot: form,
    });

    const fields = document.createElement('div');
    fields.className = 'admin-booking-edit-grid';
    const checkInParts = manilaParts(booking.checkInAtUtc || booking.checkIn) || { date: '', time: '14:00' };
    const checkOutParts = manilaParts(booking.checkoutTimeUtc || booking.checkOut) || { date: '', time: '12:00' };
    const checkInTime = normalizeCheckInTime(checkInParts.time);
    const checkOutTime = normalizeCheckOutTime(checkOutParts.time);
    fields.append(
      editField('Guest name', 'guestName', 'text', booking.guestName),
      editField('Email', 'guestEmail', 'email', booking.guestEmail),
      editField('Phone', 'guestPhone', 'tel', booking.guestPhone, true),
      editField('Check-in date', 'checkIn', 'date', checkInParts.date),
      editField('Check-out date', 'checkOut', 'date', checkOutParts.date),
      editSelectField('Check-in time', 'checkInTime', checkInTimeOptions(), checkInTime),
      editSelectField('Check-out time', 'checkOutTime', checkOutTimeOptions(), checkOutTime)
    );
    const contactLede = document.createElement('p');
    contactLede.className = 'admin-booking-edit-section-lede';
    contactLede.textContent = 'Correct guest name, phone, email, and stay schedule.';
    contactCategory.body.append(contactLede, fields);

    const headStatus = document.createElement('p');
    headStatus.className = 'admin-booking-edit-headcount-status';
    const headRoomsList = document.createElement('div');
    headRoomsList.className = 'admin-booking-edit-headcount-rooms';
    const extraHidden = document.createElement('input');
    extraHidden.type = 'hidden';
    extraHidden.name = 'extraPersons';
    extraHidden.value = String(extraInitial);
    const adultCountHidden = document.createElement('input');
    adultCountHidden.type = 'hidden';
    adultCountHidden.name = 'adultCount';
    adultCountHidden.value = '0';
    const childCountHidden = document.createElement('input');
    childCountHidden.type = 'hidden';
    childCountHidden.name = 'childCount';
    childCountHidden.value = '0';
    const guestPartyHidden = document.createElement('input');
    guestPartyHidden.type = 'hidden';
    guestPartyHidden.name = 'guestPartyJson';
    guestPartyHidden.value = '[]';
    const headLede = document.createElement('p');
    headLede.className = 'admin-booking-edit-section-lede';
    headLede.textContent =
      'Same as guest booking: each room has its own adults / children. Max 3 guests per room (2 included). Each room may add one extra guest for \u20B1200 / night. Use Add another room here \u2014 a type row appears under Edit rooms for you to assign.';
    const addRoomFromHeadBtn = document.createElement('button');
    addRoomFromHeadBtn.type = 'button';
    addRoomFromHeadBtn.className = 'admin-booking-edit-add-room-from-head';
    addRoomFromHeadBtn.textContent = 'Add another room';
    addRoomFromHeadBtn.hidden = hardEdit;
    addRoomFromHeadBtn.title = 'Adds a head-count card and a room-type row to assign';
    const headCategory = makeEditCategoryPanel({
      id: 'headcount',
      title: 'Guest head count',
      preview: '',
      open: false,
      accordionRoot: form,
    });
    headCategory.body.append(
      headLede,
      headRoomsList,
      headStatus,
      addRoomFromHeadBtn,
      extraHidden,
      adultCountHidden,
      childCountHidden,
      guestPartyHidden
    );

    const availPanel = document.createElement('div');
    availPanel.className = 'admin-booking-edit-availability';
    availPanel.hidden = !needsAvailPreview;
    const availTitle = document.createElement('p');
    availTitle.className = 'admin-booking-edit-availability-title';
    availTitle.textContent = 'Rooms available for these dates';
    const availList = document.createElement('ul');
    availList.className = 'admin-booking-edit-availability-list';
    const availStatus = document.createElement('p');
    availStatus.className = 'admin-booking-edit-availability-status';
    availStatus.textContent = 'Checking availability\u2026';
    availPanel.append(availTitle, availList, availStatus);

    const roomFields = document.createElement('div');
    roomFields.className = 'admin-booking-edit-rooms';

    if (hardEdit) {
      (booking.items || []).forEach((line) => {
        const assigned = (line.assignedRooms || [])
          .map((room) => room.roomNumber)
          .filter(Boolean);
        const row = document.createElement('div');
        row.className = 'admin-booking-edit-assigned-row';
        row.innerHTML =
          `<span>${escapeHtml(String(line.quantity || 0))}\u00D7 ${escapeHtml(line.roomTypeName || 'Room')}` +
          `${assigned.length ? ` \u2192 ${escapeHtml(assigned.join(', '))}` : ''}</span>` +
          `<strong>${money(line.pricePerNight)} / night</strong>`;
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.dataset.roomTypeId = String(line.roomTypeId);
        hidden.value = String(line.quantity || 0);
        row.append(hidden);
        roomFields.append(row);
      });
    }

    const hint = document.createElement('p');
    hint.className = 'admin-booking-edit-hint';
    hint.textContent = hardEdit
      ? 'Room numbers stay assigned. If another guest holds the same room on the new dates, save will be blocked.'
      : 'Choose a room type for each stay room. Add or remove rooms under Guest head count \u2014 a type row appears here automatically.';

    const roomsCategory = makeEditCategoryPanel({
      id: 'rooms',
      title: hardEdit ? 'Assigned rooms (locked)' : 'Edit rooms',
      preview: roomsEditPreview(booking),
      open: false,
      accordionRoot: form,
      onOpen: () => {
        scheduleAvailRefresh();
        syncRoomsAttention();
      },
      onClose: () => syncRoomsAttention(),
    });
    roomsCategory.body.append(availPanel, roomFields, hint);

    const error = document.createElement('p');
    error.className = 'admin-booking-edit-error';
    error.hidden = true;
    form.append(intro, contactCategory.panel, headCategory.panel, roomsCategory.panel, error);
    detailBody.append(form);

    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.addEventListener('click', () => renderBookingDetails(booking));
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'admin-booking-confirm';
    saveButton.textContent = hardEdit || adjustStay ? 'Save stay changes' : 'Save changes';
    detailActions.append(backButton, saveButton);

    function maxPartyForRoomCount(roomCount) {
      return Math.max(0, roomCount) * MAX_GUESTS_PER_ROOM;
    }

    function minRoomsForParty(guestTotal) {
      const total = Math.max(1, Number(guestTotal) || 1);
      let rooms = 1;
      while (maxPartyForRoomCount(rooms) < total) rooms += 1;
      return rooms;
    }

    function partyTotals() {
      return editGuestRooms.reduce(
        (acc, room) => {
          acc.adults += Number(room.adults) || 0;
          acc.children += Number(room.children) || 0;
          return acc;
        },
        { adults: 0, children: 0 }
      );
    }

    function roomHasExtraGuest(room) {
      return (Number(room?.adults) || 0) + (Number(room?.children) || 0) > BASE_GUESTS_PER_ROOM;
    }

    function clampEditGuestRooms() {
      editGuestRooms.forEach((room) => {
        let a = Math.max(0, Number(room.adults) || 0);
        let c = Math.max(0, Number(room.children) || 0);
        if (a < 1 && c < 1) a = 1;
        if (a + c > MAX_GUESTS_PER_ROOM) {
          c = Math.max(0, MAX_GUESTS_PER_ROOM - a);
          if (a > MAX_GUESTS_PER_ROOM) {
            a = MAX_GUESTS_PER_ROOM;
            c = 0;
          }
        }
        room.adults = a;
        room.children = c;
      });
    }

    function currentRoomQty() {
      return Math.max(1, editGuestRooms.length);
    }

    function computeExtraPersons() {
      return editGuestRooms.reduce((sum, room) => {
        const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
        return sum + Math.min(MAX_EXTRA_PERSONS_PER_ROOM, Math.max(0, total - BASE_GUESTS_PER_ROOM));
      }, 0);
    }

    function syncHeadCountUi() {
      clampEditGuestRooms();
      const rooms = currentRoomQty();
      const totals = partyTotals();
      const total = totals.adults + totals.children;
      const included = rooms * BASE_GUESTS_PER_ROOM;
      const extras = computeExtraPersons();
      extraHidden.value = String(extras);
      adultCountHidden.value = String(totals.adults);
      childCountHidden.value = String(totals.children);
      guestPartyHidden.value = JSON.stringify(
        editGuestRooms.map((room) => ({
          adults: Number(room.adults) || 0,
          children: Number(room.children) || 0,
        }))
      );
      const typeLinesQty = hardEdit
        ? bookingRoomQuantity(booking)
        : readEditRoomLines(form)
            .filter((line) => line.quantity > 0)
            .reduce((sum, line) => sum + line.quantity, 0);
      const typeGap = Math.max(0, rooms - Math.max(typeLinesQty, 0));
      let statusText = `${total} guest${total === 1 ? '' : 's'} \u00B7 ${rooms} room${rooms === 1 ? '' : 's'}`;
      if (extras > 0) {
        statusText += extras > 1
          ? ` \u00B7 includes ${extras} extra persons \u00B7 \u20B1200 / night each`
          : ' \u00B7 includes \u20B1200 / night extra person';
      }
      else statusText += ` \u00B7 within included capacity (${included})`;
      if (typeGap > 0) {
        statusText += ` \u00B7 assign type for ${typeGap} new room${typeGap === 1 ? '' : 's'} under Edit rooms`;
      }
      headStatus.textContent = statusText;
      headStatus.classList.toggle('is-at-capacity', typeGap > 0);
      headCategory.setPreview(
        `${total} guest${total === 1 ? '' : 's'} \u00B7 ${rooms} room${rooms === 1 ? '' : 's'}`
      );
    }

    function renderEditGuestRooms() {
      clampEditGuestRooms();
      headRoomsList.replaceChildren();
      editGuestRooms.forEach((room, index) => {
        const total = (Number(room.adults) || 0) + (Number(room.children) || 0);
        const canInc = total < MAX_GUESTS_PER_ROOM;
        const card = document.createElement('article');
        card.className = `admin-booking-edit-guest-room${total >= MAX_GUESTS_PER_ROOM ? ' is-at-capacity' : ''}${roomHasExtraGuest(room) ? ' has-extra-person' : ''}`;
        card.dataset.editGuestRoom = String(index);

        const head = document.createElement('div');
        head.className = 'admin-booking-edit-guest-room-head';
        const title = document.createElement('h4');
        title.textContent = `Room ${index + 1}`;
        head.append(title);
        if (index > 0 && !hardEdit) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'admin-booking-edit-guest-room-remove';
          removeBtn.textContent = 'Remove';
          removeBtn.setAttribute('aria-label', `Remove room ${index + 1}`);
          removeBtn.addEventListener('click', () => {
            removeEditGuestRoom(index);
          });
          head.append(removeBtn);
        }

        const counters = document.createElement('div');
        counters.className = 'admin-booking-edit-headcount-row';
        const adultsStepper = makeHeadCountStepper('Adults', room.adults, (next) => {
          room.adults = next;
          renderEditGuestRooms();
          syncHeadCountUi();
        });
        const childrenStepper = makeHeadCountStepper('Children under 12', room.children, (next) => {
          room.children = next;
          renderEditGuestRooms();
          syncHeadCountUi();
        });
        adultsStepper._setButtons({ canDec: room.adults > 1, canInc });
        childrenStepper._setButtons({ canDec: room.children > 0, canInc });
        const blockMsg = `Each room holds up to ${MAX_GUESTS_PER_ROOM} guests. Add another room for more guests.`;
        adultsStepper.title = canInc ? '' : blockMsg;
        childrenStepper.title = canInc ? '' : blockMsg;
        counters.append(adultsStepper, childrenStepper);

        card.append(head, counters);
        if (roomHasExtraGuest(room)) {
          const note = document.createElement('p');
          note.className = 'admin-booking-edit-guest-room-extra';
          note.textContent = 'Extra person \u00B7 \u20B1200 / night';
          card.append(note);
        }
        headRoomsList.append(card);
      });
      syncHeadCountUi();
    }

    function removeEditGuestRoom(index) {
      if (index <= 0 || editGuestRooms.length <= 1) return;
      editGuestRooms.splice(index, 1);
      // Drop a matching needs-type line first, else the last room line with qty.
      const needsRows = Array.from(form.querySelectorAll('[data-edit-room-line][data-needs-type="1"]'));
      if (needsRows.length) {
        needsRows[needsRows.length - 1].remove();
      } else {
        const rows = Array.from(form.querySelectorAll('[data-edit-room-line]'));
        const last = rows[rows.length - 1];
        if (last && rows.length > 1) last.remove();
        else if (last) {
          const qty = last.querySelector('[data-room-qty]');
          if (qty) qty.value = '1';
        }
      }
      renderEditGuestRooms();
      onRoomsChanged();
    }

    renderEditGuestRooms();

    let availOk = false;
    let availTimer = null;
    let lastNoAvailKey = '';
    /** @type {Map<number, any>} */
    let lastAvailByType = new Map();

    function updateRoomsPreview() {
      if (hardEdit) {
        roomsCategory.setPreview(roomsEditPreview(booking));
        return;
      }
      const rows = readEditRoomLines(form).filter((line) => line.quantity > 0);
      const typed = aggregateEditRoomLines(
        rows.filter((line) => !line.needsType && line.roomTypeId)
      ).map((line) => `${line.quantity}\u00D7 ${line.roomTypeName || 'Room'}`);
      const pending = rows.filter((line) => line.needsType || !line.roomTypeId).length;
      if (pending > 0) typed.push(`${pending}\u00D7 Select type`);
      roomsCategory.setPreview(
        typed.length ? typed.join(' \u00B7 ') : 'No rooms selected \u2014 add a room type'
      );
    }

    function pendingTypeSelectCount() {
      return Array.from(form.querySelectorAll('[data-edit-room-line]')).filter((row) => {
        const qty = Number(row.querySelector('[data-room-qty]')?.value || 0);
        if (qty <= 0) return false;
        return row.dataset.needsType === '1' || !row.querySelector('[data-room-type-select]')?.value;
      }).length;
    }

    function syncRoomsAttention() {
      if (hardEdit) {
        roomsCategory.setAttention(null);
        return;
      }
      const pending = pendingTypeSelectCount();
      const showTag = pending > 0 && !roomsCategory.isOpen();
      if (!showTag) {
        roomsCategory.setAttention(null);
        return;
      }
      roomsCategory.setAttention(
        pending === 1
          ? 'Select room type for new room'
          : `Select room types \u00B7 ${pending} new rooms`
      );
    }

    function applyRoomTypeAvailabilityFilters() {
      if (hardEdit) return;
      const rows = Array.from(form.querySelectorAll('[data-edit-room-line]'));
      rows.forEach((row) => {
        const select = row.querySelector('[data-room-type-select]');
        if (!select) return;
        const currentId = Number(select.value || 0);
        const usedByOthers = new Map();
        rows.forEach((other) => {
          if (other === row) return;
          const id = Number(other.querySelector('[data-room-type-select]')?.value || 0);
          const qty = Number(other.querySelector('[data-room-qty]')?.value || 0);
          if (id > 0 && qty > 0) {
            usedByOthers.set(id, (usedByOthers.get(id) || 0) + qty);
          }
        });
        Array.from(select.options).forEach((opt) => {
          const id = Number(opt.value || 0);
          if (!id) return;
          const slot = lastAvailByType.get(id);
          const remaining = slot ? Number(slot.remaining ?? slot.Remaining ?? 0) : 0;
          const left = remaining - (usedByOthers.get(id) || 0);
          const selected = id === currentId;
          const blocked = lastAvailByType.size > 0 && !selected && left < 1;
          opt.disabled = blocked;
          const baseName = opt.dataset.roomTypeName || opt.textContent;
          opt.textContent = blocked ? `${baseName} \u00B7 none left` : baseName;
        });
      });
    }

    function onRoomsChanged() {
      numberEditRoomLines(form);
      updateRoomsPreview();
      syncHeadCountUi();
      syncRoomsAttention();
      applyRoomTypeAvailabilityFilters();
      scheduleAvailRefresh();
    }

    let editRoomTypesCache = [];

    function appendNeedsTypeRoomLine(types, options = {}) {
      const row = createEditRoomLine(types, 0, 1, { needsType: true });
      wireEditRoomLine(row, form, onRoomsChanged);
      roomFields.append(row);
      if (!options.silent) onRoomsChanged();
    }

    async function addRoomFromHeadCount() {
      if (hardEdit) return;
      addRoomFromHeadBtn.disabled = true;
      try {
        const types = editRoomTypesCache.length
          ? editRoomTypesCache
          : await loadEditRoomTypeCatalog();
        editRoomTypesCache = types;
        if (!types.length) {
          showEditNoticePopup('No room types available to add.', 'Cannot add room');
          return;
        }
        error.hidden = true;
        editGuestRooms.push({ adults: 2, children: 0 });
        appendNeedsTypeRoomLine(types);
        renderEditGuestRooms();
        // Keep head count open so the new Adults/Children card is visible.
        headCategory.setOpen(true);
        syncRoomsAttention();
        // Scroll new card into view
        const cards = headRoomsList.querySelectorAll('[data-edit-guest-room]');
        cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } finally {
        addRoomFromHeadBtn.disabled = false;
      }
    }

    addRoomFromHeadBtn.addEventListener('click', () => {
      void addRoomFromHeadCount();
    });

    function scheduleAvailRefresh() {
      window.clearTimeout(availTimer);
      availTimer = window.setTimeout(() => {
        void refreshEditAvailability();
      }, 280);
    }

    function requiredLines() {
      if (hardEdit) {
        return (booking.items || []).map((line) => ({
          roomTypeId: Number(line.roomTypeId),
          roomTypeName: line.roomTypeName || 'Room',
          quantity: Number(line.quantity || 0),
        }));
      }
      return readEditRoomLines(form).filter((line) => line.quantity > 0 && line.roomTypeId > 0);
    }

    if (!hardEdit) {
      void loadEditRoomTypeCatalog().then((types) => {
        editRoomTypesCache = types;
        if (!types.length) {
          roomFields.textContent = 'No room types available.';
          addRoomFromHeadBtn.disabled = true;
          return;
        }
        const items = (booking.items || []).length
          ? booking.items
          : [{ roomTypeId: types[0].roomTypeId, quantity: 1 }];
        items.forEach((line) => {
          const qty = Math.max(1, Number(line.quantity || 1));
          for (let i = 0; i < qty; i += 1) {
            const row = createEditRoomLine(types, line.roomTypeId, 1);
            wireEditRoomLine(row, form, onRoomsChanged);
            roomFields.append(row);
          }
        });
        // Head-count cards are the room-count source: pad type rows when party has more rooms.
        const headRooms = Math.max(1, editGuestRooms.length);
        let typedQty = readEditRoomLines(form)
          .filter((line) => line.quantity > 0)
          .reduce((sum, line) => sum + line.quantity, 0);
        while (typedQty < headRooms) {
          appendNeedsTypeRoomLine(types, { silent: true });
          typedQty += 1;
        }
        numberEditRoomLines(form);
        updateRoomsPreview();
        syncHeadCountUi();
        syncRoomsAttention();
        scheduleAvailRefresh();
      });
    }

    function showEditNoticePopup(message, title = 'Booking edit') {
      const popup = detailModal?.querySelector('[data-edit-availability-popup]');
      const msg = popup?.querySelector('[data-edit-availability-message]');
      const heading = popup?.querySelector('#editAvailabilityTitle');
      if (!popup || !msg) {
        if (typeof window.showMoriNotice === 'function') {
          window.showMoriNotice(message, 'error');
          return;
        }
        window.alert(message);
        return;
      }
      if (heading) heading.textContent = title;
      msg.textContent = message;
      popup.hidden = false;
      popup.querySelector('[data-edit-availability-ok]')?.focus();
    }

    function hideEditNoticePopup() {
      const popup = detailModal?.querySelector('[data-edit-availability-popup]');
      if (popup) popup.hidden = true;
    }

    // Back-compat aliases used by availability checks below.
    const showNoAvailabilityPopup = (message) =>
      showEditNoticePopup(message, 'No available rooms');
    const hideNoAvailabilityPopup = hideEditNoticePopup;

    async function refreshEditAvailability() {
      if (!needsAvailPreview) return;
      const checkIn = String(form.querySelector('[name="checkIn"]')?.value || '');
      const checkInTime = String(form.querySelector('[name="checkInTime"]')?.value || '14:00');
      const checkOut = String(form.querySelector('[name="checkOut"]')?.value || '');
      const checkOutTime = String(form.querySelector('[name="checkOutTime"]')?.value || '12:00');
      if (!checkIn || !checkOut) {
        availOk = false;
        saveButton.disabled = true;
        availStatus.textContent = 'Enter check-in and check-out dates.';
        availList.replaceChildren();
        return;
      }

      availStatus.textContent = 'Checking availability\u2026';
      try {
        const checkInAtUtc = toManilaDateTimeIso(checkIn, checkInTime);
        const checkoutTimeUtc = toManilaDateTimeIso(checkOut, checkOutTime);
        const query = new URLSearchParams({ checkInAtUtc, checkoutTimeUtc });
        const rows = await apiFetch(
          `/api/admin/bookings/${booking.id}/availability?${query.toString()}`
        );
        const byType = new Map(
          (rows || []).map((row) => [Number(row.roomTypeId ?? row.RoomTypeId), row])
        );
        lastAvailByType = byType;
        applyRoomTypeAvailabilityFilters();
        const needed = aggregateEditRoomLines(requiredLines());
        availList.replaceChildren();
        let insufficient = false;
        const shortLines = [];

        needed.forEach((line) => {
          const row = byType.get(line.roomTypeId);
          const remaining = row ? Number(row.remaining ?? row.Remaining ?? 0) : 0;
          const soldOutDates = Array.isArray(row?.soldOutDates ?? row?.SoldOutDates)
            ? (row.soldOutDates ?? row.SoldOutDates).filter(Boolean)
            : [];
          const li = document.createElement('li');
          const ok = remaining >= line.quantity;
          if (!ok) {
            insufficient = true;
            if (soldOutDates.length) {
              shortLines.push(
                `${line.roomTypeName} is fully booked on ${soldOutDates.join(', ')}`
              );
            } else {
              shortLines.push(
                `${line.roomTypeName}: need ${line.quantity}, only ${remaining} available`
              );
            }
          }
          li.className = ok ? 'is-ok' : 'is-short';
          let label = `${line.roomTypeName}: ${remaining} available`;
          if (line.quantity > 1) label += ` (need ${line.quantity})`;
          if (soldOutDates.length) label += ` \u00B7 fully booked ${soldOutDates.join(', ')}`;
          li.textContent = label;
          availList.append(li);
        });

        if (!needed.length) {
          availOk = false;
          saveButton.disabled = true;
          availStatus.textContent = 'Add at least one room quantity.';
          return;
        }

        availOk = !insufficient;
        saveButton.disabled = insufficient;
        availStatus.textContent = insufficient
          ? 'Not enough rooms for these dates \u2014 change the dates or wait for availability.'
          : 'Enough rooms for this stay on the selected dates.';

        if (insufficient) {
          const key = `${checkIn}|${checkOut}|${shortLines.join(';')}`;
          if (key !== lastNoAvailKey) {
            lastNoAvailKey = key;
            showNoAvailabilityPopup(
              'Even if you adjust these dates, there is still no available room right now for what this booking needs. ' +
                shortLines.join('. ') +
                '.'
            );
          }
        } else {
          lastNoAvailKey = '';
        }
      } catch (err) {
        availOk = false;
        saveButton.disabled = true;
        availList.replaceChildren();
        availStatus.textContent =
          err instanceof Error ? err.message : 'Unable to check availability.';
      }
    }

    ['checkIn', 'checkInTime', 'checkOut', 'checkOutTime'].forEach((name) => {
      form.querySelector(`[name="${name}"]`)?.addEventListener('change', scheduleAvailRefresh);
      form.querySelector(`[name="${name}"]`)?.addEventListener('input', scheduleAvailRefresh);
    });

    detailModal?.querySelectorAll('[data-edit-availability-ok]').forEach((btn) => {
      if (btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        const popup = detailModal?.querySelector('[data-edit-availability-popup]');
        if (popup) popup.hidden = true;
      });
    });

    saveButton.addEventListener('click', () => {
      const pendingTypes = pendingTypeSelectCount();
      if (pendingTypes > 0) {
        error.hidden = true;
        showEditNoticePopup(
          pendingTypes === 1
            ? 'Open Edit rooms and select a room type for the newly added room.'
            : `Open Edit rooms and select room types for ${pendingTypes} newly added rooms.`,
          'Room type needed'
        );
        roomsCategory.setOpen(true);
        syncRoomsAttention();
        return;
      }
      if (needsAvailPreview && !availOk) {
        showNoAvailabilityPopup(
          'Even if you adjust these dates, there is still no available room right now for what this booking needs.'
        );
        return;
      }
      if (hardEdit) {
        const ok = window.confirm(
          'Update this confirmed stay while keeping the assigned rooms?\n\nNights and total may change.'
        );
        if (!ok) return;
      }
      form.requestSubmit();
    });
    form.addEventListener('submit', (event) =>
      saveBookingEdit(event, booking, saveButton, error, { hardEdit, adjustStay })
    );

    if (needsAvailPreview) {
      if (hardEdit) {
      void refreshEditAvailability();
      }
    }
  }

  async function saveBookingEdit(event, booking, button, errorElement, options = {}) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const hardEdit = Boolean(options.hardEdit);
    const items = hardEdit
      ? (booking.items || []).map((line) => ({
          roomTypeId: Number(line.roomTypeId),
          quantity: Number(line.quantity || 0),
        }))
      : aggregateEditRoomLines(
          readEditRoomLines(form).filter((line) => line.quantity > 0 && line.roomTypeId)
        ).map((line) => ({
          roomTypeId: line.roomTypeId,
          quantity: line.quantity,
        }));

    button.disabled = true;
    errorElement.hidden = true;
    try {
      const updated = await apiFetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: String(data.get('guestName') || ''),
          guestEmail: String(data.get('guestEmail') || ''),
          guestPhone: String(data.get('guestPhone') || ''),
          checkInAtUtc: toManilaDateTimeIso(
            String(data.get('checkIn') || ''),
            String(data.get('checkInTime') || '14:00')
          ),
          checkoutTimeUtc: toManilaDateTimeIso(
            String(data.get('checkOut') || ''),
            String(data.get('checkOutTime') || '12:00')
          ),
          extraPersons: Math.max(0, Number(data.get('extraPersons') || 0)),
          adultCount: Math.max(0, Number(data.get('adultCount') || 0)),
          childCount: Math.max(0, Number(data.get('childCount') || 0)),
          guestRooms: (() => {
            try {
              const parsed = JSON.parse(String(data.get('guestPartyJson') || '[]'));
              return Array.isArray(parsed)
                ? parsed.map((room) => ({
                    adults: Math.max(0, Number(room.adults ?? room.Adults ?? 0)),
                    children: Math.max(0, Number(room.children ?? room.Children ?? 0)),
                  }))
                : [];
            } catch {
              return [];
            }
          })(),
          items,
        }),
      });
      // Reload payment summary so balance / assign gate match the recalculated stay total.
      const paymentSummary = await apiFetch(`/api/admin/payments/booking/${updated.id}`).catch(
        () => null
      );
      await renderBookingDetails(updated, { paymentSummary });
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
    } catch (error) {
      errorElement.hidden = true;
      const message = error instanceof Error ? error.message : 'Unable to save changes.';
      const popup = detailModal?.querySelector('[data-edit-availability-popup]');
      const msg = popup?.querySelector('[data-edit-availability-message]');
      const heading = popup?.querySelector('#editAvailabilityTitle');
      if (popup && msg) {
        if (heading) heading.textContent = 'Unable to save';
        msg.textContent = message;
        popup.hidden = false;
        popup.querySelector('[data-edit-availability-ok]')?.focus();
      } else if (typeof window.showMoriNotice === 'function') {
        window.showMoriNotice(message, 'error');
      } else {
        errorElement.textContent = message;
      errorElement.hidden = false;
      }
    } finally {
      button.disabled = false;
    }
  }

  async function openBookingDetails(id, cachedBooking = null, options = {}) {
    if (!detailModal || !detailBody) return;
    const bookingId = Number(id);
    if (!Number.isFinite(bookingId) || bookingId <= 0) return;

    if (Number(receptionExtrasStageBookingId) !== bookingId) {
      receptionExtrasStageBookingId = null;
      hideExtrasStageIntro();
    } else {
      // Same guest reopened while on Checkout \u2014 keep step 5, hide leftover intro overlay.
      hideExtrasStageIntro();
    }

    showBookingDetailsSkeleton(cachedBooking);
    const requestSeq = (openBookingDetails._seq = (openBookingDetails._seq || 0) + 1);

    try {
      const bookingPromise = options.markRead
        ? apiFetch(`/api/admin/bookings/${bookingId}/read`, { method: 'POST' })
        : apiFetch(`/api/admin/bookings/${bookingId}`);
      const paymentPromise = apiFetch(`/api/admin/payments/booking/${bookingId}`).catch(() => null);

      // Instant first paint from list/cache while network finishes.
      if (cachedBooking?.items && !options.markRead) {
        await renderBookingDetails(cachedBooking, { paymentSummary: null });
        if (requestSeq !== openBookingDetails._seq) return;
      }

      const [booking, paymentSummary] = await Promise.all([bookingPromise, paymentPromise]);
      if (requestSeq !== openBookingDetails._seq) return;
      await renderBookingDetails(booking, { paymentSummary });

      if (options.markRead) {
        void refreshNotifications();
      }
    } catch (error) {
      if (requestSeq !== openBookingDetails._seq) return;
      detailBody.textContent = error instanceof Error ? error.message : 'Unable to load details.';
      if (detailActions) detailActions.replaceChildren();
    }
  }

  function notificationTargetForItem(item) {
    const message = String(item?.message || '');
    const bookingId = Number(item?.id || 0);
    const pendingCallsUrl = bookingId > 0
      ? `/AdminBookings?pendingCalls=soon&booking=${bookingId}`
      : '/AdminBookings?pendingCalls=soon';

    if (/call guest: checkout|checkout in 20/i.test(message)) {
      return { type: 'filter', url: pendingCallsUrl };
    }
    if (/call guest/i.test(message)) {
      return { type: 'filter', url: pendingCallsUrl };
    }
    if (/arrival/i.test(message)) {
      return { type: 'filter', url: pendingCallsUrl };
    }
    return { type: 'booking', id: Number(item.id) };
  }

  async function openBookingFromNotification(item) {
    const target = notificationTargetForItem(item);
    if (panel) {
      panel.hidden = true;
      bell?.setAttribute('aria-expanded', 'false');
    }

    if (target.type === 'filter') {
      window.location.assign(target.url);
      return;
    }

    await openBookingDetails(target.id, {
      id: item.id,
      reference: item.reference,
      guestName: item.guestName,
    }, { markRead: true });
  }

  async function updateStatus(booking, status, button, assignments, options = {}) {
    button.disabled = true;
    showBookingMessage('');
    try {
      const body = { status };
      if (status === 'Confirmed') {
        body.assignments = assignments || [];
      }
      await apiFetch(`/api/admin/bookings/${booking.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const assignedNow = Array.isArray(assignments) && assignments.length > 0;
      if (status === 'Confirmed' && assignedNow && !options.stayOnBookings) {
        window.location.href = '/Rooms?view=list';
        return;
      }
      closeBookingDetails();
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
      showBookingMessage(
        status === 'Confirmed' && !assignedNow
          ? 'Booking confirmed. Finish setup after full payment (from arrival date).'
          : 'Booking updated.'
      );
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to update booking.', true);
      await refreshBookings();
    } finally {
      button.disabled = false;
    }
  }

  async function assignRoomsToBooking(booking, button, assignments) {
    button.disabled = true;
    showBookingMessage('');
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/assign-rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      });
      isLeavingBookingsPage = true;
      window.location.href = '/Rooms?view=list';
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to assign rooms.', true);
      button.disabled = false;
    }
  }

  function hideCheckoutConfirmModal() {
    const popup = detailModal?.querySelector('[data-checkout-confirm-popup]');
    if (!popup) return;
    popup.hidden = true;
  }

  /**
   * Branded checkout confirm (replaces window.confirm).
   * @returns {Promise<'checkout'|'payment'|'cancel'>}
   */
  function showCheckoutConfirmModal({
    booking,
    balanceDue,
    stayTotal,
    amountPaid,
    rooms = [],
  }) {
    const popup = detailModal?.querySelector('[data-checkout-confirm-popup]');
    const titleEl = detailModal?.querySelector('[data-checkout-confirm-title]');
    const messageEl = detailModal?.querySelector('[data-checkout-confirm-message]');
    const summaryEl = detailModal?.querySelector('[data-checkout-confirm-summary]');
    const noteEl = detailModal?.querySelector('[data-checkout-confirm-note]');
    const cancelBtn = detailModal?.querySelector('[data-checkout-confirm-cancel]');
    const payBtn = detailModal?.querySelector('[data-checkout-confirm-pay]');
    const okBtn = detailModal?.querySelector('[data-checkout-confirm-ok]');
    const refEl = detailModal?.querySelector('[data-checkout-confirm-ref]');
    const totalEl = detailModal?.querySelector('[data-checkout-confirm-total]');
    const paidEl = detailModal?.querySelector('[data-checkout-confirm-paid]');
    const balanceEl = detailModal?.querySelector('[data-checkout-confirm-balance]');

    if (!popup || !cancelBtn || !okBtn) {
      return Promise.resolve('cancel');
    }

    const unpaid = balanceDue > 0.009;
    const roomLabel = rooms.length ? ` (${rooms.join(', ')})` : '';

    if (titleEl) {
      titleEl.textContent = unpaid ? 'Balance still due' : 'Archive guest';
    }
    if (messageEl) {
      messageEl.textContent = unpaid
        ? `${booking.reference} still has an unpaid balance. Review the payment figures below before archiving.`
        : `Archive ${booking.reference}${roomLabel}?`;
    }

    if (summaryEl) {
      summaryEl.hidden = !unpaid;
      if (unpaid) {
        if (refEl) refEl.textContent = booking.reference || '\u2014';
        if (totalEl) totalEl.textContent = money(stayTotal);
        if (paidEl) paidEl.textContent = money(amountPaid);
        if (balanceEl) balanceEl.textContent = money(balanceDue);
      }
    }

    if (noteEl) {
      noteEl.textContent = unpaid
        ? 'Archiving will free assigned rooms (Available again). Collect the balance first if the guest can still pay.'
        : 'Assigned rooms will become Available again.';
    }

    if (payBtn) {
      payBtn.hidden = !unpaid;
    }
    okBtn.textContent = unpaid ? 'Archive anyway' : 'Archive';
    popup.classList.toggle('is-warning', unpaid);

    return new Promise((resolve) => {
      const finish = (result) => {
        cancelBtn.removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        payBtn?.removeEventListener('click', onPay);
        popup.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        hideCheckoutConfirmModal();
        resolve(result);
      };
      const onCancel = () => finish('cancel');
      const onOk = () => finish('checkout');
      const onPay = () => finish('payment');
      const onBackdrop = (event) => {
        if (event.target === popup) finish('cancel');
      };
      const onKey = (event) => {
        if (event.key === 'Escape') finish('cancel');
      };

      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      payBtn?.addEventListener('click', onPay);
      popup.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);

      popup.hidden = false;
      (unpaid ? payBtn : okBtn)?.focus();
    });
  }

  function hideExtrasStageIntro() {
    detailModal?.querySelectorAll('[data-extras-stage-popup]').forEach((popup) => {
      popup.hidden = true;
    });
  }

  function showExtrasStageIntro() {
    const popup = detailModal?.querySelector('[data-extras-stage-popup]');
    let okBtn = popup?.querySelector('[data-extras-stage-ok]');
    if (!popup || !okBtn) return;
    // Reset button listeners if intro is shown again without closing.
    const fresh = okBtn.cloneNode(true);
    okBtn.replaceWith(fresh);
    okBtn = fresh;
    popup.hidden = false;
    popup.style.zIndex = '80';
    const finish = () => {
      popup.hidden = true;
      const extrasPanel = detailBody?.querySelector('[data-extras-fees="1"]');
      extrasPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      extrasPanel
        ?.querySelector('.admin-fee-dd-trigger:not(.is-locked)')
        ?.focus();
    };
    okBtn.addEventListener('click', finish, { once: true });
    requestAnimationFrame(() => {
      popup.hidden = false;
      okBtn.focus();
    });
  }

  async function enterReceptionExtrasStage(booking) {
    receptionExtrasStageBookingId = Number(booking.id);
    await renderBookingDetails(booking);
    requestAnimationFrame(() => showExtrasStageIntro());
  }

  async function leaveReceptionExtrasStage(booking) {
    receptionExtrasStageBookingId = null;
    hideExtrasStageIntro();
    await renderBookingDetails(booking);
  }

  async function checkoutBooking(booking, button) {
    const rooms = (booking.items || [])
      .flatMap((line) => (line.assignedRooms || []).map((room) => room.roomNumber))
      .filter(Boolean);

    let balanceDue = Number(paymentPriceContext.balanceDue);
    let stayTotal = Number(paymentPriceContext.stayTotal) || 0;
    let amountPaid = Number(paymentPriceContext.amountPaid) || 0;
    if (selectedBooking?.id === booking.id && Number.isFinite(balanceDue)) {
      // use loaded context
    } else {
      const summary = await loadBookingPaymentSummary(booking);
      if (summary) fillPaymentSummaryFields(booking, summary);
      balanceDue = Number(paymentPriceContext.balanceDue) || 0;
      stayTotal = Number(paymentPriceContext.stayTotal) || 0;
      amountPaid = Number(paymentPriceContext.amountPaid) || 0;
    }

    const decision = await showCheckoutConfirmModal({
      booking,
      balanceDue,
      stayTotal,
      amountPaid,
      rooms,
    });

    if (decision === 'cancel') return;

    if (decision === 'payment') {
      await openAddPaymentModal(booking);
      return;
    }

    button.disabled = true;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      receptionExtrasStageBookingId = null;
      window.location.href = '/Rooms?view=list';
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to check out booking.', true);
      button.disabled = false;
    }
  }

  async function cancelBooking(booking, button) {
    if (!window.confirm(`Cancel booking ${booking.reference} and move it to history?`)) return;
    button.disabled = true;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      closeBookingDetails();
      await Promise.all([refreshBookings(), refreshNotifications()]);
      reservationCalendar?.refetchEvents();
      showBookingMessage('Booking cancelled and moved to history.');
    } catch (error) {
      showBookingMessage(error instanceof Error ? error.message : 'Unable to cancel booking.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function refreshRoomTypeAvailability() {
    const chips = bookingsRoot?.querySelector('[data-room-type-availability-chips]');
    const label = bookingsRoot?.querySelector('.admin-room-type-availability-label');
    if (!chips || isLeavingBookingsPage) return;
    try {
      // Stay inventory for tonight (Pending + Confirmed holds). Door assignment does not change this.
      const rows = await apiFetch('/api/admin/bookings/room-type-availability');
      const list = Array.isArray(rows) ? rows : [];
      chips.replaceChildren();
      if (label) {
        label.textContent = 'Available tonight';
        label.title = 'Remaining sellable rooms for tonight after pending/confirmed bookings (not door assignment)';
      }
      if (!list.length) {
        const empty = document.createElement('span');
        empty.className = 'admin-room-type-availability-empty';
        empty.textContent = 'No room types';
        chips.append(empty);
        return;
      }
      list
        .slice()
        .sort((a, b) =>
          String(a.roomTypeName || a.name || '').localeCompare(
            String(b.roomTypeName || b.name || ''),
            undefined,
            { sensitivity: 'base' }
          )
        )
        .forEach((type) => {
          const available = Number(type.remaining ?? type.availableCount ?? 0);
          const total = Number(type.capacity ?? type.roomCount ?? 0);
          const chip = document.createElement('span');
          chip.className = 'admin-room-avail-chip';
          if (available <= 0) chip.classList.add('is-empty');
          else if (total > 0 && available / total <= 0.25) chip.classList.add('is-low');
          else if (available <= 1) chip.classList.add('is-low');

          const name = document.createElement('strong');
          name.textContent = type.roomTypeName || type.name || `Type ${type.roomTypeId}`;
          const count = document.createElement('em');
          count.textContent = total > 0 ? `${available}/${total}` : String(available);
          chip.title = `${name.textContent}: ${available} sellable of ${total} tonight (pending + confirmed holds)`;
          chip.append(name, count);
          chips.append(chip);
        });
    } catch {
      if (!chips.childElementCount) {
        const err = document.createElement('span');
        err.className = 'admin-room-type-availability-empty';
        err.textContent = 'Availability unavailable';
        chips.append(err);
      }
    }
  }

  async function refreshBookings() {
    if (!bookingList) return;
    if (isLeavingBookingsPage) return;
    renderBookingsTableSkeleton();
    showBookingMessage('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (filter) query.set('status', filter);
      if (search) query.set('search', search);
      if (history) query.set('history', 'true');
      const payload = await apiFetch(`/api/admin/bookings?${query}`);
      totalPages = Math.max(1, Math.ceil(Number(payload.total || 0) / Number(payload.pageSize || 25)));
      page = Math.min(Number(payload.page || 1), totalPages);
      bookingList.replaceChildren();
      if (!payload.items?.length) {
        const row = document.createElement('tr');
        const empty = document.createElement('td');
        empty.colSpan = 8;
        empty.className = 'admin-bookings-empty';
        empty.textContent = history
          ? 'No checked-out or cancelled bookings in history.'
          : 'No bookings match this filter.';
        row.append(empty);
        bookingList.append(row);
      } else {
        payload.items.forEach((booking) => bookingList.append(bookingRow(booking)));
      }
      if (pageLabel) pageLabel.textContent = `Page ${page} of ${totalPages}`;
      if (prevButton) prevButton.disabled = page <= 1;
      if (nextButton) nextButton.disabled = page >= totalPages;

      const selected =
        pendingScrollBookingId
        || Number(new URLSearchParams(window.location.search).get('booking') || 0);
      if (selected) {
        bookingList.querySelector(`[data-booking-id="${CSS.escape(String(selected))}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pendingScrollBookingId = null;
        if (!selectedFromUrlHandled) {
          selectedFromUrlHandled = true;
          void openBookingDetails(Number(selected), null, { markRead: true });
        }
      }
    } catch (error) {
      bookingList.replaceChildren();
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'admin-bookings-empty';
      cell.textContent = 'Unable to load bookings.';
      row.append(cell);
      bookingList.append(row);
      showBookingMessage(error instanceof Error ? error.message : 'Unable to load bookings.', true);
    }
  }

  function addIsoDays(iso, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return '';
    const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function stayBounds(item) {
    const start = manilaParts(item?.start)?.date || '';
    const end = manilaParts(item?.end)?.date || start;
    return { start, end: end || start };
  }

  function stayingDayKeys(item) {
    const { start, end } = stayBounds(item);
    if (!start) return [];
    if (!end || end <= start) return [start];
    const keys = [];
    let cursor = start;
    while (cursor && cursor < end) {
      keys.push(cursor);
      cursor = addIsoDays(cursor, 1);
      if (!cursor || keys.length > 400) break;
    }
    return keys;
  }

  function checkoutDayKey(item) {
    const { start, end } = stayBounds(item);
    return end || start || '';
  }

  function pushGuestDay(map, key, item) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  function parseCalendarPayload(payload) {
    if (Array.isArray(payload)) {
      return { stays: payload, occupancy: [] };
    }
      return {
      stays: payload?.stays || payload?.Stays || [],
      occupancy: payload?.occupancy || payload?.Occupancy || [],
    };
  }

  function occupancyDateKey(item) {
    return String(item?.date || item?.Date || '').slice(0, 10);
  }

  function indexCalendarOccupancy(items) {
    calendarOccupancyByDay.clear();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const key = occupancyDateKey(item);
      if (!key) return;
      const reserved = Math.max(0, Number(item.reserved ?? item.Reserved) || 0);
      const occupied = Math.max(0, Number(item.occupied ?? item.Occupied) || 0);
      const available = Math.max(0, Number(item.available ?? item.Available) || 0);
      const capacity = Math.max(0, Number(item.capacity ?? item.Capacity) || 0);
      const types = Array.isArray(item.types || item.Types) ? (item.types || item.Types) : [];
      calendarOccupancyByDay.set(key, {
        reserved,
        occupied,
        available,
        capacity,
        types: types.map((row) => ({
          name: String(row.roomTypeName || row.RoomTypeName || ''),
          reserved: Math.max(0, Number(row.reserved ?? row.Reserved) || 0),
          occupied: Math.max(0, Number(row.occupied ?? row.Occupied) || 0),
          available: Math.max(0, Number(row.available ?? row.Available) || 0),
          capacity: Math.max(0, Number(row.capacity ?? row.Capacity) || 0),
        })),
      });
    });
  }

  function occupancyForDay(dayKey) {
    return calendarOccupancyByDay.get(dayKey) || null;
  }

  function indexCalendarStays(items) {
    calendarStayCache = Array.isArray(items) ? items : [];
    calendarStayingByDay.clear();
    calendarCheckoutByDay.clear();
    calendarStayCache.forEach((item) => {
      stayingDayKeys(item).forEach((key) => pushGuestDay(calendarStayingByDay, key, item));
      pushGuestDay(calendarCheckoutByDay, checkoutDayKey(item), item);
    });
  }

  function guestsStayingOnDay(dayKey) {
    return calendarStayingByDay.get(dayKey) || [];
  }

  function guestsCheckingOutOnDay(dayKey) {
    return calendarCheckoutByDay.get(dayKey) || [];
  }

  function sortGuestsByName(items) {
    return items
      .slice()
      .sort((a, b) => String(a.guestName || '').localeCompare(String(b.guestName || ''), PH_LOCALE));
  }

  function occupancyBarEl(occ) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-cal-occ';
    wrap.setAttribute('data-cal-occ', '');
    const occupiedPct = occ.capacity > 0
      ? Math.min(100, Math.round((occ.occupied / occ.capacity) * 100))
      : 0;
    const reservedPct = occ.capacity > 0
      ? Math.min(100 - occupiedPct, Math.round((occ.reserved / occ.capacity) * 100))
      : 0;
    wrap.classList.toggle('is-open', occ.available > 0);
    wrap.classList.toggle('is-full', occ.available === 0 && occ.capacity > 0);
    wrap.title = occ.capacity > 0
      ? `${occ.reserved} reserved \u00B7 ${occ.occupied} occupied \u00B7 ${occ.available} available of ${occ.capacity}`
      : 'No sellable rooms';

    const bar = document.createElement('span');
    bar.className = 'admin-cal-occ-bar';
    const occupiedFill = document.createElement('i');
    occupiedFill.className = 'is-occupied';
    occupiedFill.style.width = `${occupiedPct}%`;
    const reservedFill = document.createElement('i');
    reservedFill.className = 'is-reserved';
    reservedFill.style.width = `${reservedPct}%`;
    bar.append(occupiedFill, reservedFill);

    const label = document.createElement('span');
    label.className = 'admin-cal-occ-label';
    label.textContent = occ.capacity > 0
      ? `${occ.available} avail`
      : '\u2014';

    wrap.append(bar, label);
    return wrap;
  }

  function refreshCalendarDayCounts() {
    if (!calendarElement) return;
    calendarElement.querySelectorAll('.fc-daygrid-day[data-date]').forEach((cell) => {
      const dayKey = cell.getAttribute('data-date') || '';
      const staying = guestsStayingOnDay(dayKey);
      const leaving = guestsCheckingOutOnDay(dayKey);
      const occ = occupancyForDay(dayKey);
      cell.classList.toggle('has-guests', staying.length > 0 || leaving.length > 0);
      if (cell.classList.contains('fc-day-today')) {
        cell.setAttribute('aria-current', 'date');
      } else {
        cell.removeAttribute('aria-current');
      }
      const frame = cell.querySelector('.fc-daygrid-day-frame') || cell;
      let mount = frame.querySelector('[data-cal-count-mount]');
      if (!mount) {
        mount = document.createElement('div');
        mount.className = 'admin-cal-count-mount';
        mount.setAttribute('data-cal-count-mount', '');
        frame.append(mount);
      }
      mount.replaceChildren();
      if (!dayKey) return;

      if (staying.length > 0 || leaving.length > 0) {
        const pair = document.createElement('button');
        pair.type = 'button';
        pair.className = 'admin-cal-counts';
        pair.setAttribute('data-cal-count', '');
        pair.setAttribute('data-day', dayKey);
        pair.setAttribute(
          'aria-label',
          `${staying.length} staying, ${leaving.length} checking out on ${formatCalendarDayHeading(dayKey)}`
        );

        const stayEl = document.createElement('span');
        stayEl.className = 'admin-cal-count is-stay';
        const stayNum = document.createElement('b');
        stayNum.textContent = String(staying.length);
        const stayLbl = document.createElement('small');
        stayLbl.textContent = 'stay';
        stayEl.append(stayNum, stayLbl);

        const outEl = document.createElement('span');
        outEl.className = 'admin-cal-count is-out';
        const outNum = document.createElement('b');
        outNum.textContent = String(leaving.length);
        const outLbl = document.createElement('small');
        outLbl.textContent = 'out';
        outEl.append(outNum, outLbl);

        pair.append(stayEl, outEl);
        mount.append(pair);
      }

      if (occ) {
        mount.append(occupancyBarEl(occ));
      }
    });
  }

  function formatCalendarDayHeading(dayKey) {
    const date = parseUtc(`${dayKey}T00:00:00Z`);
    if (!date) return dayKey || 'Guests';
    return date.toLocaleDateString(PH_LOCALE, {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function isCalendarDayModalOpen() {
    return Boolean(calendarDayModal && !calendarDayModal.hidden);
  }

  function closeCalendarDayModal() {
    if (!calendarDayModal || calendarDayModal.hidden) return;
    calendarDayModal.hidden = true;
    document.body.classList.remove('admin-cal-day-open');
    const restore = calendarDayLastFocus;
    calendarDayLastFocus = null;
    if (restore && typeof restore.focus === 'function' && document.contains(restore)) {
      restore.focus();
    }
  }

  function calendarGuestRow(item, leavingToday) {
    const bookingId = Number(item.id);
    const extensionNights = Math.max(0, Number(item.extensionNights || 0));
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'admin-cal-guest-row';
    if (leavingToday) row.classList.add('is-checkout');
    row.setAttribute('data-calendar-guest', String(bookingId));
    if (Number.isFinite(bookingId) && bookingId > 0) {
      row.setAttribute(
        'aria-label',
        `Open booking for ${item.guestName || 'guest'} ${item.reference || ''}`
      );
    }

    const name = document.createElement('strong');
    name.className = 'admin-cal-guest-name';
    name.textContent = item.guestName || 'Guest';

    const meta = document.createElement('span');
    meta.className = 'admin-cal-guest-meta';
    const bits = [
      item.reference,
      displayEnum(item.kind),
      item.roomSummary,
    ].filter(Boolean);
    if (extensionNights > 0) bits.push(`+${extensionNights} extended`);
    meta.textContent = bits.join(' \u00B7 ');

    const stay = document.createElement('span');
    stay.className = 'admin-cal-guest-stay';
    stay.textContent = formatStayRange(item.start, item.end);

    row.append(name, meta, stay);
    row.addEventListener('click', () => {
      if (!Number.isFinite(bookingId) || bookingId <= 0) return;
      openBookingDetails(bookingId);
    });
    return row;
  }

  function fillGuestGroup(block, list, items, leavingToday, headingCount) {
    if (!block || !list) return;
    list.replaceChildren();
    const guests = sortGuestsByName(items);
    block.hidden = guests.length === 0;
    if (headingCount) {
      headingCount.textContent = guests.length > 0 ? `(${guests.length})` : '';
    }
    guests.forEach((item) => list.append(calendarGuestRow(item, leavingToday)));
  }

  function applyCalendarGuestFilter() {
    const query = String(calendarDayFilter?.value || '').trim().toLowerCase();
    calendarDayModal?.querySelectorAll('[data-calendar-guest]').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      if (!query) {
        row.hidden = false;
        return;
      }
      row.hidden = !String(row.textContent || '').toLowerCase().includes(query);
    });
  }

  function stayRoomsAssigned(item) {
    const requested = Math.max(0, Number(item.requestedRooms ?? item.RequestedRooms) || 0);
    const assigned = Math.max(0, Number(item.assignedRooms ?? item.AssignedRooms) || 0);
    return requested > 0 && assigned >= requested;
  }

  function renderDayOccupancy(dayKey) {
    const occ = occupancyForDay(dayKey);
    if (!calendarDayOccupancy) return;
    if (!occ) {
      calendarDayOccupancy.hidden = true;
      return;
    }

    calendarDayOccupancy.hidden = false;
    calendarDayOccupancy.classList.toggle('is-full', occ.available === 0 && occ.capacity > 0);
    if (calendarDayReserved) calendarDayReserved.textContent = String(occ.reserved);
    if (calendarDayOccupied) calendarDayOccupied.textContent = String(occ.occupied);
    if (calendarDayAvailable) calendarDayAvailable.textContent = String(occ.available);
    const occupiedPct = occ.capacity > 0
      ? Math.min(100, (occ.occupied / occ.capacity) * 100)
      : 0;
    const reservedPct = occ.capacity > 0
      ? Math.min(100 - occupiedPct, (occ.reserved / occ.capacity) * 100)
      : 0;
    if (calendarDayOccupancyOccupiedFill instanceof HTMLElement) {
      calendarDayOccupancyOccupiedFill.style.width = `${occupiedPct}%`;
    }
    if (calendarDayOccupancyReservedFill instanceof HTMLElement) {
      calendarDayOccupancyReservedFill.style.width = `${reservedPct}%`;
    }
    if (calendarDayOccupancyMeter instanceof HTMLElement) {
      calendarDayOccupancyMeter.setAttribute('aria-valuemin', '0');
      calendarDayOccupancyMeter.setAttribute('aria-valuemax', String(occ.capacity));
      calendarDayOccupancyMeter.setAttribute('aria-valuenow', String(occ.occupied));
    }
    if (calendarDayOccupancyHint) {
      if (occ.capacity <= 0) {
        calendarDayOccupancyHint.textContent = 'No sellable rooms in inventory.';
      } else {
        calendarDayOccupancyHint.textContent =
          `${occ.reserved} reserved, ${occ.occupied} occupied, ${occ.available} available.`;
      }
    }
    if (calendarDayTypes) {
      calendarDayTypes.replaceChildren();
      (occ.types || []).forEach((row) => {
        if (!row.name) return;
        const li = document.createElement('li');
        li.className = row.available > 0 ? 'is-open' : 'is-full';
        const name = document.createElement('span');
        name.textContent = row.name;
        const count = document.createElement('strong');
        count.textContent =
          `${row.reserved} reserved \u00B7 ${row.occupied} occupied \u00B7 ${row.available} available`;
        li.append(name, count);
        calendarDayTypes.append(li);
      });
    }
  }

  function openCalendarDayModal(dayKey) {
    if (!calendarDayModal || !dayKey) return;
    const staying = guestsStayingOnDay(dayKey);
    const leaving = guestsCheckingOutOnDay(dayKey);
    const occupiedGuests = staying.filter(stayRoomsAssigned);
    const reservedGuests = staying.filter((item) => !stayRoomsAssigned(item));
    if (calendarDayTitle) calendarDayTitle.textContent = formatCalendarDayHeading(dayKey);
    if (calendarDayStayCount) calendarDayStayCount.textContent = String(staying.length);
    if (calendarDayOutCount) calendarDayOutCount.textContent = String(leaving.length);
    fillGuestGroup(calendarDayOccupiedBlock, calendarDayOccupiedList, occupiedGuests, false, calendarDayOccupiedHeadingCount);
    fillGuestGroup(calendarDayReservedBlock, calendarDayReservedList, reservedGuests, false, calendarDayReservedHeadingCount);
    fillGuestGroup(calendarDayOutBlock, calendarDayOutList, leaving, true, calendarDayOutHeadingCount);
    renderDayOccupancy(dayKey);
    if (calendarDayEmpty) {
      calendarDayEmpty.hidden =
        occupiedGuests.length > 0 || reservedGuests.length > 0 || leaving.length > 0;
    }
    const guestTotal = occupiedGuests.length + reservedGuests.length + leaving.length;
    if (calendarDayFind) {
      calendarDayFind.hidden = guestTotal < 8;
    }
    if (calendarDayFilter) {
      calendarDayFilter.value = '';
    }
    applyCalendarGuestFilter();

    calendarDayLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    calendarDayModal.hidden = false;
    document.body.classList.add('admin-cal-day-open');
    calendarDayModal.querySelector('.admin-cal-day-close')?.focus();
  }

  function calendarFitHeight() {
    return 'auto';
  }

  function sizeReservationCalendar() {
    if (!reservationCalendar || calendarPanel?.hidden) return;
    reservationCalendar.setOption('height', 'auto');
    reservationCalendar.updateSize();
    requestAnimationFrame(refreshCalendarDayCounts);
  }

  async function initReservationCalendar() {
    if (reservationCalendar || !calendarElement) return;
    let ready = Boolean(window.FullCalendar?.Calendar);
    if (!ready) {
      try {
        ready = await ensureFullCalendarLoaded();
      } catch {
        ready = false;
      }
    }
    if (!ready || !window.FullCalendar?.Calendar) {
      if (calendarFallback) calendarFallback.hidden = false;
      return;
    }

    reservationCalendar = new window.FullCalendar.Calendar(calendarElement, {
      timeZone: PH_TZ,
      initialView: 'dayGridMonth',
      height: 'auto',
      expandRows: false,
      navLinks: false,
      eventDisplay: 'none',
      displayEventTime: false,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: '',
      },
      buttonText: {
        today: 'Today',
      },
      events: async (info, success, failure) => {
        try {
          const query = new URLSearchParams({
            start: info.startStr.slice(0, 10),
            end: info.endStr.slice(0, 10),
          });
          const payload = await apiFetch(`/api/admin/bookings/calendar?${query}`);
          const parsed = parseCalendarPayload(payload);
          indexCalendarStays(parsed.stays);
          indexCalendarOccupancy(parsed.occupancy);
          success([]);
          if (calendarFallback) calendarFallback.hidden = true;
          requestAnimationFrame(refreshCalendarDayCounts);
        } catch (error) {
          indexCalendarStays([]);
          indexCalendarOccupancy([]);
          requestAnimationFrame(refreshCalendarDayCounts);
          if (calendarFallback) calendarFallback.hidden = false;
          failure(error);
        }
      },
      datesSet: () => {
        calendarElement.querySelector('.fc-col-header')?.classList.add('admin-cal-header');
        requestAnimationFrame(refreshCalendarDayCounts);
      },
      dateClick: (info) => {
        const dayKey = String(info.dateStr || '').slice(0, 10);
        if (dayKey) openCalendarDayModal(dayKey);
      },
    });
    calendarElement.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-cal-count]');
      if (!pill || !calendarElement.contains(pill)) return;
      event.preventDefault();
      event.stopPropagation();
      const dayKey = pill.getAttribute('data-day') || '';
      if (dayKey) openCalendarDayModal(dayKey);
    });
    reservationCalendar.render();
    sizeReservationCalendar();
  }

  window.addEventListener('resize', () => {
    if (!reservationCalendar || calendarPanel?.hidden) return;
    sizeReservationCalendar();
  });

  detailModal?.querySelectorAll('[data-booking-modal-close]').forEach((button) => {
    button.addEventListener('click', closeBookingDetails);
  });
  calendarDayModal?.querySelectorAll('[data-calendar-day-close]').forEach((button) => {
    button.addEventListener('click', closeCalendarDayModal);
  });
  calendarDayFilter?.addEventListener('input', applyCalendarGuestFilter);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || isPhotoZoomOpen()) return;
    if (detailModal && !detailModal.hidden) {
      closeBookingDetails();
      return;
    }
    if (isCalendarDayModalOpen()) {
      closeCalendarDayModal();
    }
  });

  bookingsRoot?.querySelectorAll('[data-booking-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.bookingView || 'table';
      const showCalendar = view === 'calendar';
      history = view === 'history';
      if (tablePanel) tablePanel.hidden = showCalendar;
      if (calendarPanel) calendarPanel.hidden = !showCalendar;
      const filterGroup = bookingsRoot.querySelector('.admin-booking-filters');
      if (filterGroup) filterGroup.hidden = history;
      setHistoryChrome(history);
      bookingsRoot.querySelectorAll('[data-booking-view]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (showCalendar) {
        void initReservationCalendar().then(() => {
          sizeReservationCalendar();
        });
      } else {
        closeCalendarDayModal();
        if (history) {
          filter = '';
          bookingsRoot.querySelectorAll('[data-booking-filter]').forEach(
            (item) => item.classList.toggle('is-active', !item.dataset.bookingFilter)
          );
          refreshFlushLogs();
        }
        page = 1;
        refreshBookings();
      }
    });
  });

  flushButton?.addEventListener('click', openFlushModal);
  flushLogToggle?.addEventListener('click', () => {
    const open = flushLogToggle.getAttribute('aria-expanded') === 'true';
    setFlushLogExpanded(!open);
  });
  flushModal?.querySelectorAll('[data-history-flush-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (document.body.classList.contains('is-exporting')) return;
      closeFlushModal();
    });
  });
  flushDetailModal?.querySelectorAll('[data-history-flush-detail-close]').forEach((button) => {
    button.addEventListener('click', closeFlushDetail);
  });
  flushConfirmButton?.addEventListener('click', confirmFlushHistory);
  paymentViewModal?.querySelectorAll('[data-payment-view-close]').forEach((button) => {
    button.addEventListener('click', closePaymentViewModal);
  });
  paymentViewAddBtn?.addEventListener('click', () => {
    if (paymentBookingContext) openAddPaymentModal(paymentBookingContext);
  });
  paymentAddModal?.querySelectorAll('[data-payment-add-close]').forEach((button) => {
    button.addEventListener('click', closeAddPaymentModal);
  });
  paymentAddModal?.querySelector('[data-payment-add-popup-ok]')?.addEventListener('click', () => {
    closePaymentAddPopup();
  });
  paymentAddModal?.querySelector('[data-payment-add-save]')?.addEventListener('click', saveRecordedPayment);
  paymentAddModal?.querySelector('[data-payment-method]')?.addEventListener('change', syncPaymentMethodPanels);
  paymentAddModal?.querySelector('[data-payment-cash-tendered]')?.addEventListener('input', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      // Keep typing-only money entry (no scroll/spinner side effects).
      input.value = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    }
    updateCashChangeUi();
  });
  paymentAddModal?.querySelectorAll('input[inputmode="decimal"]').forEach((input) => {
    input.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
      }
    });
  });
  paymentAddModal?.querySelector('[data-payment-prices-toggle]')?.addEventListener('click', () => {
    const open = paymentAddModal.querySelector('[data-payment-prices-toggle]')?.getAttribute('aria-expanded') === 'true';
    setPaymentPricesExpanded(!open);
  });
  paymentAddModal?.querySelectorAll('[data-payment-price-pick]').forEach((button) => {
    button.addEventListener('click', () => {
      applyPaymentPricePick(button.getAttribute('data-payment-price-pick') || 'balanceDue');
    });
  });
  paymentAddModal?.querySelector('[data-payment-receipt-upload]')?.addEventListener('change', (event) => {
    const input = event.target;
    handleReceiptFileSelected(input?.files?.[0], input);
  });
  paymentAddModal?.querySelector('[data-payment-receipt-capture]')?.addEventListener('change', (event) => {
    const input = event.target;
    handleReceiptFileSelected(input?.files?.[0], input);
  });
  paymentAddModal?.querySelector('[data-payment-open-camera]')?.addEventListener('click', () => {
    openPaymentCamera();
  });
  paymentAddModal?.querySelector('[data-payment-choose-photo]')?.addEventListener('click', () => {
    const input = paymentAddModal.querySelector('[data-payment-receipt-upload]');
    if (!input) return;
    input.value = '';
    input.click();
  });
  paymentCameraModal?.querySelectorAll('[data-payment-camera-close]').forEach((button) => {
    button.addEventListener('click', closePaymentCameraModal);
  });
  paymentCameraModal?.querySelector('[data-payment-camera-capture]')?.addEventListener('click', () => {
    capturePaymentCameraPhoto();
  });
  paymentCameraModal?.querySelector('[data-payment-camera-switch]')?.addEventListener('click', () => {
    switchPaymentCamera();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isPhotoZoomOpen()) return;
    if (paymentCameraModal && !paymentCameraModal.hidden) {
      closePaymentCameraModal();
      return;
    }
    if (paymentAddModal && !paymentAddModal.hidden) {
      closeAddPaymentModal();
      return;
    }
    if (paymentViewModal && !paymentViewModal.hidden) {
      closePaymentViewModal();
    }
  });
  flushByInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmFlushHistory();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.body.classList.contains('is-exporting')) {
      event.preventDefault();
      return;
    }
    if (isPhotoZoomOpen()) return;
    if (flushDetailModal && !flushDetailModal.hidden) {
      closeFlushDetail();
      return;
    }
    if (flushModal && !flushModal.hidden) {
      closeFlushModal();
    }
  });

  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      refreshBookings();
    }, 300);
  });

  bookingsRoot?.querySelectorAll('[data-booking-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.bookingFilter || '';
      page = 1;
      bookingsRoot.querySelectorAll('[data-booking-filter]').forEach(
        (item) => item.classList.toggle('is-active', item === button)
      );
      refreshBookings();
    });
  });
  bookingsRoot?.querySelector('[data-booking-refresh]')?.addEventListener('click', () => {
    if (!arrivalsPanel?.hidden) {
      refreshArrivals();
      return;
    }
    if (!pendingCallsPanel?.hidden) {
      refreshPendingCalls();
      return;
    }
    if (!checkoutsPanel?.hidden) {
      refreshCheckouts();
      return;
    }
    if (!daytimeFlowPanel?.hidden) {
      refreshDaytimeFlow();
      return;
    }
    refreshBookings();
  });
  daytimeFlowOpenButton?.addEventListener('click', openDaytimeFlow);
  bookingsRoot?.querySelector('[data-daytime-flow-close]')?.addEventListener('click', closeDaytimeFlow);
  bookingsRoot?.querySelector('[data-arrivals-close]')?.addEventListener('click', closeArrivalsSoon);
  bookingsRoot?.querySelector('[data-pending-calls-close]')?.addEventListener('click', closePendingCallsSoon);
  bookingsRoot?.querySelector('[data-checkouts-close]')?.addEventListener('click', closeCheckoutsSoon);
  prevButton?.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      refreshBookings();
    }
  });
  nextButton?.addEventListener('click', () => {
    if (page < totalPages) {
      page += 1;
      refreshBookings();
    }
  });

  function beginPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(async () => {
      await processAutoCheckout();
      await refreshNotifications();
      await refreshActiveBookingPanel();
      await refreshRoomTypeAvailability();
      reservationCalendar?.refetchEvents();
    }, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function refreshFromRealtime(eventName, payload) {
    if (eventName === 'OfferEndingSoon') {
      playChime();
      showOfferEndingSoonAlert(payload);
      await refreshNotifications();
      return;
    }

    if (eventName === 'BookingCreated') {
      playChime();
    } else if (eventName === 'BookingUpdated' && payload?.message) {
      // Only chime for alert messages (arrival/checkout), not routine confirm/edit.
      playChime();
    }

    if (eventName === 'BookingArchived') {
      closeBookingDetails();
    }

    if (eventName === 'PaymentChanged') {
      const bookingId = payload;
      await refreshActiveBookingPanel();
      await refreshOpenBookingDetails(bookingId);
      if (
        paymentViewModal &&
        !paymentViewModal.hidden &&
        paymentBookingContext &&
        Number(paymentBookingContext.id) === Number(bookingId)
      ) {
        await openPaymentViewModal(paymentBookingContext);
      }
      reservationCalendar?.refetchEvents();
      await refreshRoomTypeAvailability();
      return;
    }

    await Promise.all([
      refreshNotifications(),
      refreshActiveBookingPanel(),
      refreshRoomTypeAvailability(),
    ]);
    reservationCalendar?.refetchEvents();
  }

  function wireRealtime() {
    if (!window.MoriAdminRealtime) {
      beginPolling();
      void refreshRoomTypeAvailability();
      return;
    }

    window.MoriAdminRealtime.onBooking((eventName, payload) => {
      window.MoriAdminRealtime.scheduleRefresh('bookings-live', () =>
        refreshFromRealtime(eventName, payload),
      );
    });

    window.MoriAdminRealtime.onCatalog?.((reason) => {
      const key = String(reason || '').toLowerCase();
      if (key && key !== 'rooms' && key !== 'updated') return;
      window.MoriAdminRealtime.scheduleRefresh('room-availability-catalog', () =>
        refreshRoomTypeAvailability(),
      );
    });

    window.addEventListener('mori:admin-refresh', (event) => {
      const scopes = event.detail?.scopes || [];
      if (scopes.includes('all') || scopes.includes('rooms')) {
        window.MoriAdminRealtime.scheduleRefresh('room-availability-poll', () =>
          refreshRoomTypeAvailability(),
        );
      }
      if (!scopes.includes('all') && !scopes.includes('bookings')) return;
      window.MoriAdminRealtime.scheduleRefresh('bookings-poll', async () => {
        await processAutoCheckout();
        await refreshNotifications();
        await refreshActiveBookingPanel();
        await refreshRoomTypeAvailability();
        reservationCalendar?.refetchEvents();
      });
    });

    pollTimer = window.setInterval(() => {
      void processAutoCheckout();
    }, 30000);
  }

  window.addEventListener('beforeunload', () => {
    isLeavingBookingsPage = true;
    if (pollTimer) window.clearInterval(pollTimer);
    if (searchTimer) window.clearTimeout(searchTimer);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || isLeavingBookingsPage) return;
    void refreshActiveBookingPanel();
    void refreshRoomTypeAvailability();
  });

  const params = new URLSearchParams(window.location.search);
  const earlyBookingId = Number(params.get('booking') || 0);
  let earlyHint = null;
  try {
    const rawHint = sessionStorage.getItem('moriOpenBooking');
    if (rawHint) {
      sessionStorage.removeItem('moriOpenBooking');
      const parsed = JSON.parse(rawHint);
      if (parsed && Number(parsed.id) === earlyBookingId) earlyHint = parsed;
    }
  } catch {
    sessionStorage.removeItem('moriOpenBooking');
  }
  if (earlyBookingId > 0 && !selectedFromUrlHandled) {
    selectedFromUrlHandled = true;
    pendingScrollBookingId = earlyBookingId;
    // Open skeleton modal immediately \u2014 do not wait for the bookings table.
    void openBookingDetails(earlyBookingId, earlyHint, { markRead: true });
    const url = new URL(window.location.href);
    url.searchParams.delete('booking');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  }

  const openPendingCallsByUrl =
    params.get('pendingCalls') === 'soon'
    || params.get('arrivals') === 'soon'
    || params.get('checkouts') === 'soon';
  if (openPendingCallsByUrl && !pendingCallsFromUrlHandled) {
    pendingCallsFromUrlHandled = true;
    filter = 'Pending';
    page = 1;
    bookingsRoot?.querySelectorAll('[data-booking-filter]').forEach((item) => {
      item.classList.toggle('is-active', (item.dataset.bookingFilter || '') === 'Pending');
    });
  }

  void refreshNotifications();
  void refreshBookings();
  void refreshRoomTypeAvailability();
  wireRealtime();
})();
