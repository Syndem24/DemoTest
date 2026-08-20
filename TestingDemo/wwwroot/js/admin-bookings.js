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
  let selectedBooking = null;
  /** When set to a booking id, reception flow is on Extras (incidental / snack) after Fees checkout CTA. */
  let receptionExtrasStageBookingId = null;
  let searchTimer = null;
  let selectedFromUrlHandled = false;
  let pendingScrollBookingId = null;
  let arrivalsFromUrlHandled = false;
  let pendingCallsFromUrlHandled = false;
  let checkoutsFromUrlHandled = false;
  let pollTimer = null;
  let reconnectTimer = null;
  let audioContext = null;
  let audioUnlocked = false;
  let soundEnabled = localStorage.getItem('moriBookingSound') !== 'off';

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
    if (!soundEnabled || !audioUnlocked || !audioContext) return;
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
    clearButton.textContent = 'Clearing…';
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
    return method === 'EWallet' || method === 'BankTransfer';
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
    if (value === 'BankTransfer') return 'Bank transfer (InstaPay)';
    if (value === 'EWallet' || value === 'GCash' || value === 'Maya') return 'E-wallet';
    if (value === 'Card') return 'Card (legacy)';
    return String(value || '');
  }

  function enablePaymentOcrPhotoZoom(image) {
    if (!(image instanceof HTMLElement) || !image.getAttribute('src')) return;
    image.setAttribute('data-photo-zoom', '');
    image.setAttribute('data-photo-zoom-src', image.getAttribute('src') || '');
    image.setAttribute('data-photo-zoom-alt', image.getAttribute('alt') || 'E-wallet receipt');
    image.setAttribute('title', 'Click to zoom · Esc to exit');
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

  function isPaymentOcrAwaitingApply() {
    if (paymentOcrNeedsApply) return true;
    const compare = paymentAddModal?.querySelector('[data-payment-ocr-compare]');
    if (!compare || compare.hidden) return false;
    const ocrRef = (paymentAddModal.querySelector('[data-payment-ocr-ref]')?.value || '').trim();
    const ocrRaw = (paymentAddModal.querySelector('[data-payment-ocr-raw]')?.value || '').trim();
    const ext = (paymentAddModal.querySelector('[data-payment-external-ref]')?.value || '').trim();
    const bank = (paymentAddModal.querySelector('[data-payment-bank-ref]')?.value || '').trim();
    const hasScan = Boolean(
      paymentAddModal.querySelector('[data-payment-ocr-image]')?.getAttribute('src')
      || ocrRef
      || ocrRaw
    );
    if (!hasScan) return false;
    // Scan panel is open and payment refs were never filled from Apply.
    if (!ext && !bank) return true;
    if (ocrRef && ocrRef !== ext && ocrRef !== bank) return true;
    return false;
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
    const compare = paymentAddModal.querySelector('[data-payment-ocr-compare]');
    const image = paymentAddModal.querySelector('[data-payment-ocr-image]');
    const pathInput = paymentAddModal.querySelector('[data-payment-receipt-path]');
    const raw = paymentAddModal.querySelector('[data-payment-ocr-raw]');
    const ref = paymentAddModal.querySelector('[data-payment-ocr-ref]');
    const amount = paymentAddModal.querySelector('[data-payment-ocr-amount]');
    const from = paymentAddModal.querySelector('[data-payment-ocr-from]');
    const to = paymentAddModal.querySelector('[data-payment-ocr-to]');
    const filterToggle = paymentAddModal.querySelector('[data-payment-ocr-scanner-filter]');
    const caption = paymentAddModal.querySelector('[data-payment-ocr-caption]');
    const dialog = paymentAddModal.querySelector('.admin-payment-modal-dialog');
    if (fileInput) fileInput.value = '';
    if (captureInput) captureInput.value = '';
    if (compare) compare.hidden = true;
    if (image) {
      image.removeAttribute('src');
      image.removeAttribute('data-photo-zoom-src');
      image.alt = 'Uploaded e-wallet receipt';
    }
    if (pathInput) pathInput.value = '';
    if (raw) raw.value = '';
    if (ref) ref.value = '';
    if (amount) amount.value = '';
    if (from) from.value = '';
    if (to) to.value = '';
    if (filterToggle) filterToggle.checked = false;
    if (caption) caption.textContent = 'Receipt photo · click to zoom · Esc to exit';
    const channelHidden = paymentAddModal.querySelector('[data-payment-ocr-channel]');
    if (channelHidden) channelHidden.value = '';
    if (dialog) dialog.classList.remove('is-wide');
    setPaymentOcrStatus('');
  }

  function cleanOcrParty(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/^[:\-–—.|]+/, '')
      .replace(/\b(SENT VIA|VIA GCASH|VIA MAYA|SUCCESS(?:FUL)?|EXPRESS SEND|TRANSACTION DETAILS)\b/gi, '')
      .replace(/\bto\b$/i, '')
      .replace(/^from\b/i, '')
      .trim()
      .slice(0, 160);
  }

  function parseMoneyToken(token) {
    if (!token) return null;
    const normalized = String(token).replace(/,/g, '').replace(/[^\d.]/g, '');
    const amount = Number(normalized);
    if (!(amount > 0) || !Number.isFinite(amount)) return null;
    if (amount > 5_000_000) return null;
    return Math.round(amount * 100) / 100;
  }

  function normalizePhMobile(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (/^09\d{9}$/.test(digits)) return digits;
    if (/^9\d{9}$/.test(digits)) return '0' + digits;
    if (/^639\d{9}$/.test(digits)) return '0' + digits.slice(2);
    if (/^63\d{10}$/.test(digits) && digits[2] === '9') return '0' + digits.slice(2);
    return '';
  }

  function formatPhMobileDisplay(rawValue) {
    const normalized = normalizePhMobile(rawValue);
    if (normalized) return normalized;
    return String(rawValue || '').replace(/\s+/g, ' ').trim();
  }

  function extractPhoneCandidates(text) {
    const matches = String(text || '').match(
      /(?:\+?\s*63\s*)?0?9(?:[\s\-]?\d){9}/g
    ) || [];
    const seen = new Set();
    const result = [];
    matches.forEach((match) => {
      const display = formatPhMobileDisplay(match);
      const key = normalizePhMobile(match) || display;
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(display);
    });
    return result;
  }

  function isDateNoiseToken(token) {
    const cleaned = String(token || '').replace(/[^A-Za-z0-9:]/g, '');
    return /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|AM|PM|MON|TUE|WED|THU|FRI|SAT|SUN|\d{1,2}:\d{2})$/i.test(
      cleaned
    );
  }

  function isYearToken(token) {
    return /^(19|20)\d{2}$/.test(String(token || '').replace(/\D/g, ''));
  }

  function isDayOrMonthNumberToken(token) {
    const digits = String(token || '').replace(/\D/g, '');
    if (!/^\d{1,2}$/.test(digits)) return false;
    const value = Number(digits);
    return value >= 1 && value <= 31;
  }

  function isUsableRefDigitChunk(chunk, joinedSoFar) {
    const digits = String(chunk || '').replace(/\D/g, '');
    if (!digits) return false;
    if (isYearToken(digits)) return false;
    // After the common GCash 4+3 prefix, ignore day numbers (01-31) from the date line.
    if (joinedSoFar.length >= 7 && isDayOrMonthNumberToken(digits)) return false;
    // Prefer the trailing 6-digit Ref segment; skip tiny leftovers.
    if (joinedSoFar.length >= 7 && digits.length < 4) return false;
    return true;
  }

  function extractClassicGcashRef(text) {
    // Express Send layout: "3035 300 966946" (4 + 3 + 6), sometimes split across lines.
    const compactNearby = String(text || '').replace(/[^\d\s]/g, ' ');
    const sameLine = compactNearby.match(/\b(\d{4})\s+(\d{3})\s+(\d{6})\b/);
    if (sameLine) return `${sameLine[1]}${sameLine[2]}${sameLine[3]}`;

    const loose = compactNearby.match(/\b(\d{4})\s+(\d{3})\s+(\d{5,7})\b/);
    if (loose) {
      const joined = `${loose[1]}${loose[2]}${loose[3]}`;
      if (joined.length >= 13) return joined.slice(0, 13);
    }

    // Split lines: 3035 300 \n 966946
    const acrossLines = String(text || '').match(
      /\b(\d{4})\s+(\d{3})\s*(?:\n+\s*|\s+)(\d{6})\b/
    );
    if (acrossLines) return `${acrossLines[1]}${acrossLines[2]}${acrossLines[3]}`;

    return '';
  }

  function looksLikeRefMergedWithDate(reference) {
    const digits = String(reference || '').replace(/\D/g, '');
    // e.g. 3035300 + 02 + 2025 => 3035300022025
    return /^\d{7}(0?[1-9]|[12]\d|3[01])(19|20)\d{2}$/.test(digits);
  }

  function collectGcashReferenceAfterLabel(lines) {
    const labelIndex = lines.findIndex((line) =>
      /(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?|REFERENCE NUMBER)\b/i.test(line)
    );
    if (labelIndex < 0) return '';

    const nearbyText = lines
      .slice(labelIndex, Math.min(lines.length, labelIndex + 5))
      .join('\n');
    const classic = extractClassicGcashRef(nearbyText);
    if (classic) return classic;

    const chunks = [];
    const pushChunk = (part) => {
      const digits = String(part || '').replace(/\D/g, '');
      if (!isUsableRefDigitChunk(digits, chunks.join(''))) return;
      chunks.push(digits);
    };

    const labelLine = lines[labelIndex];
    const sameLine = labelLine.match(
      /(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?|REFERENCE NUMBER)\s*[:#.\-]?\s*(.*)$/i
    );
    if (sameLine?.[1]) {
      const sameDigits = sameLine[1].match(/\d+/g) || [];
      sameDigits.forEach(pushChunk);
    }

    for (let i = labelIndex + 1; i < Math.min(lines.length, labelIndex + 5); i += 1) {
      const line = lines[i];
      if (/amount|total|transfer|sent via|download|share|help|carbon|footprint/i.test(line)) break;
      if (/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(line)) break;
      if (isDateNoiseToken(line.split(/\s+/)[0])) break;
      if (isYearToken(line.replace(/\D/g, '')) && chunks.join('').length >= 7) break;

      const digitParts = line.match(/\d+/g) || [];
      if (!digitParts.length) {
        if (chunks.length) break;
        continue;
      }

      // Date line like "02, 2025 7:56" — stop once prefix exists.
      if (
        chunks.join('').length >= 7 &&
        digitParts.some((part) => isYearToken(part) || isDayOrMonthNumberToken(part))
      ) {
        const sixDigit = digitParts.find((part) => part.replace(/\D/g, '').length === 6);
        if (sixDigit) pushChunk(sixDigit);
        break;
      }

      digitParts.forEach(pushChunk);
      if (chunks.join('').length >= 13) break;
    }

    let joined = chunks.join('');
    if (joined.length === 7) {
      for (let i = labelIndex + 1; i < Math.min(lines.length, labelIndex + 6); i += 1) {
        const line = lines[i];
        if (/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(line)) {
          // Still allow a 6-digit ref on/after a date line only if present as its own token
          // before year — but prefer earlier non-date lines.
          continue;
        }
        const six = (line.match(/\b(\d{6})\b/g) || []).find((part) => !isYearToken(part));
        if (six) {
          joined += six;
          break;
        }
      }
    }
    if (joined.length === 7) {
      // Last resort: any 6-digit token after the Ref label that is not a year.
      const after = lines.slice(labelIndex, labelIndex + 6).join(' ');
      const six = (after.match(/\b(\d{6})\b/g) || []).find((part) => !isYearToken(part));
      if (six) joined += six;
    }
    if (looksLikeRefMergedWithDate(joined)) {
      joined = joined.slice(0, 7);
    }
    if (joined.length >= 13) return joined.slice(0, 13);
    if (joined.length >= 11 && joined.length <= 16) return joined;
    return '';
  }

  function parseTransferFromTo(text, lines) {
    const phoneBit = '(?:\\+?\\s*63\\s*)?0?9(?:[\\s\\-]?\\d){9}';
    const inlineRe = new RegExp(
      'transfer\\s+from\\s+(' + phoneBit + ')\\s+to\\s+(' + phoneBit + ')',
      'i'
    );
    const inline = String(text || '').match(inlineRe);
    if (inline) {
      return {
        transferFrom: formatPhMobileDisplay(inline[1]),
        transferTo: formatPhMobileDisplay(inline[2]),
      };
    }

    for (let i = 0; i < lines.length; i += 1) {
      if (!/transfer\s+from/i.test(lines[i])) continue;
      const windowText = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]]
        .filter(Boolean)
        .join(' ');
      const match = windowText.match(inlineRe);
      if (match) {
        return {
          transferFrom: formatPhMobileDisplay(match[1]),
          transferTo: formatPhMobileDisplay(match[2]),
        };
      }

      const phones = extractPhoneCandidates(windowText);
      if (phones.length >= 2) {
        return { transferFrom: phones[0], transferTo: phones[1] };
      }
    }

    return { transferFrom: '', transferTo: '' };
  }

  function detectEwalletLayout(upper, compact) {
    const isGcashHistory =
      /TRANSACTION\s*DETAILS/.test(upper) ||
      /TRANSFER\s+FROM[\s\S]{0,80}\bTO\b/.test(upper) ||
      /REFERENCE\s*NUMBER/.test(upper);
    const isGcashReceipt =
      /EXPRESS\s*SEND/.test(upper) ||
      /SENT\s*VIA\s*GCASH/.test(upper) ||
      /TOTAL\s*AMOUNT\s*SENT/.test(upper) ||
      compact.includes('GCASH') ||
      /\bG\s*CASH\b/.test(upper);
    const isInstaPay = /INSTAPAY|INSTA\s*PAY/.test(upper) || compact.includes('INSTAPAY');
    const isPayPal = /PAYPAL/.test(compact);

    if (isPayPal) return { wallet: 'PayPal', layout: 'paypal' };
    if (isInstaPay && !isGcashReceipt && !isGcashHistory) {
      return { wallet: 'InstaPay', layout: 'instapay' };
    }
    if (/MAYA|PAYMAYA/.test(compact) && !isGcashHistory && !isGcashReceipt) {
      return { wallet: 'Maya', layout: 'maya' };
    }
    if (isGcashHistory) return { wallet: 'GCash', layout: 'gcash-history' };
    if (isGcashReceipt) return { wallet: 'GCash', layout: 'gcash-receipt' };
    if (compact.includes('GCASH') || /\bG\s*CASH\b/.test(upper)) {
      return { wallet: 'GCash', layout: 'gcash-receipt' };
    }
    return { wallet: 'Other', layout: 'unknown' };
  }

  function parseEwalletOcrText(text) {
    const raw = String(text || '')
      .replace(/\r/g, '')
      .replace(/[|]/g, 'I')
      .replace(/[₱]/g, 'PHP ')
      .replace(/[—–]/g, '-')
      .trim();
    const lines = raw
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const upper = raw.toUpperCase();
    const compact = upper.replace(/[^A-Z0-9]/g, '');
    const detected = detectEwalletLayout(upper, compact);
    let wallet = detected.wallet;
    const layout = detected.layout;

    let reference = extractClassicGcashRef(raw) || collectGcashReferenceAfterLabel(lines);

    if (!reference) {
      const labeledRef = raw.match(
        /(?:INSTAPAY\s*)?(?:REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER|#)?|REFERENCE\s*NUMBER|TXN(?:\s*ID)?|TRANSACTION\s*(?:ID|NO\.?)?)\s*[:#.\-]?\s*([0-9][0-9 ]{8,24})/i
      );
      if (labeledRef?.[1] && !/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(labeledRef[1])) {
        const digitsOnly = labeledRef[1].replace(/\D/g, '');
        if (digitsOnly.length >= 11 && digitsOnly.length <= 16 && !looksLikeRefMergedWithDate(digitsOnly)) {
          reference = digitsOnly.length >= 13 ? digitsOnly.slice(0, 13) : digitsOnly;
        }
      }
    }

    if ((!reference || reference.length < 13) && /REF/i.test(upper)) {
      const refBlocks = [...upper.matchAll(/REF(?:ERENCE)?\.?\s*(?:NO\.?|NUMBER)?\s*[:#.\-]?\s*([\s\S]{0,80})/g)];
      for (const block of refBlocks) {
        const nearby = String(block[1] || '');
        const classic = extractClassicGcashRef(nearby);
        if (classic) {
          reference = classic;
          break;
        }
        const stop = nearby.split(
          /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|AMOUNT|TOTAL|DOWNLOAD|SHARE|(?:19|20)\d{2})\b/i
        )[0];
        const parts = stop.match(/\d+/g) || [];
        const filtered = [];
        parts.forEach((part) => {
          if (isUsableRefDigitChunk(part, filtered.join(''))) filtered.push(part.replace(/\D/g, ''));
        });
        const digits = filtered.join('');
        if (digits.length >= 13 && !looksLikeRefMergedWithDate(digits)) {
          reference = digits.slice(0, 13);
          break;
        }
        if (digits.length >= 11 && digits.length <= 16 && !reference && !looksLikeRefMergedWithDate(digits)) {
          reference = digits;
        }
      }
    }

    if (!reference) {
      const spacedDigits = upper.match(/\b(\d{3,5}(?:[\s\-]+\d{2,5}){1,5})\b/g) || [];
      for (const candidate of spacedDigits) {
        if (/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(candidate)) continue;
        const digits = candidate.replace(/\D/g, '');
        if (digits.length === 13 && !looksLikeRefMergedWithDate(digits)) {
          reference = digits;
          break;
        }
      }
    }

    if (!reference) {
      const digitGroups = [...upper.matchAll(/\b(\d{11,16})\b/g)]
        .map((m) => m[1])
        .filter((digits) => !normalizePhMobile(digits) && !looksLikeRefMergedWithDate(digits));
      reference =
        digitGroups.find((d) => d.length === 13) ||
        digitGroups.find((d) => d.length === 12) ||
        digitGroups[0] ||
        '';
    }

    if (looksLikeRefMergedWithDate(reference)) {
      // Prefer classic pattern elsewhere in text instead of date-merged junk.
      reference = extractClassicGcashRef(raw) || '';
    }

    if (/[A-Za-z]/.test(reference) || /Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov/i.test(reference)) {
      reference = reference.replace(/[A-Za-z].*$/, '').replace(/\D/g, '');
      if (!(reference.length >= 11 && reference.length <= 16) || looksLikeRefMergedWithDate(reference)) {
        reference = '';
      }
    }

    let amount = null;
    const amountPatterns = [
      /(?:TOTAL\s*(?:AMOUNT\s*)?(?:SENT|PAID|TRANSFER(?:RED)?)?|AMOUNT\s*(?:SENT|PAID|TRANSFER(?:RED)?)?|YOU\s*SENT|TRANSFER\s*AMOUNT|AMOUNT)\s*[:\-]?\s*-?\s*(?:PHP|P)?\s*-?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /-\s*([\d,]+(?:\.\d{2}))/,
      /(?:PHP|P)\s*-?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /([\d,]+\.\d{2})/,
    ];
    for (const pattern of amountPatterns) {
      const match = raw.match(pattern);
      const parsed = parseMoneyToken(match?.[1]);
      if (parsed != null) {
        amount = parsed;
        break;
      }
    }

    let transferFrom = '';
    let transferTo = '';

    if (layout === 'gcash-history') {
      const parties = parseTransferFromTo(raw, lines);
      transferFrom = parties.transferFrom;
      transferTo = parties.transferTo;
    } else {
      const viaIndex = lines.findIndex((line) => /SENT VIA|VIA GCASH|VIA MAYA/i.test(line));
      if (viaIndex > 0) {
        const maybePhone = cleanOcrParty(lines[viaIndex - 1]);
        const maybeName = cleanOcrParty(lines[viaIndex - 2] || '');
        const phone = formatPhMobileDisplay(maybePhone);
        if (normalizePhMobile(maybePhone) || /\+?\s*63/.test(maybePhone)) {
          transferTo = [maybeName, phone].filter(Boolean).join(' · ');
        }
      }

      if (!transferTo) {
        const phones = extractPhoneCandidates(raw);
        if (phones[0]) transferTo = phones[0];
      }

      const parties = parseTransferFromTo(raw, lines);
      if (parties.transferFrom) transferFrom = parties.transferFrom;
      if (parties.transferTo) transferTo = parties.transferTo;

      if (!transferFrom) {
        const fromLabeled = lines.find((line) => /^FROM\s*[:\-]/.test(line));
        if (fromLabeled) transferFrom = cleanOcrParty(fromLabeled.replace(/^FROM\s*[:\-]?\s*/i, ''));
      }
    }

    if ((!transferFrom || !transferTo) && /transfer\s+from/i.test(raw)) {
      const parties = parseTransferFromTo(raw, lines);
      if (!transferFrom) transferFrom = parties.transferFrom;
      if (!transferTo) transferTo = parties.transferTo;
    }

    transferFrom = cleanOcrParty(transferFrom);
    transferTo = cleanOcrParty(transferTo);

    if (transferFrom && transferTo && transferFrom === transferTo) {
      transferFrom = '';
    }

    if (wallet === 'Other' && (/EXPRESS\s*SEND|REF\s*NO|TOTAL\s*AMOUNT\s*SENT|TRANSACTION\s*DETAILS|INSTAPAY|PAYPAL/i.test(upper))) {
      if (/PAYPAL/i.test(upper)) wallet = 'PayPal';
      else if (/INSTAPAY|INSTA\s*PAY/i.test(upper)) wallet = 'InstaPay';
      else wallet = 'GCash';
    }

    return {
      wallet,
      layout,
      reference,
      amount,
      transferFrom,
      transferTo,
      raw,
    };
  }


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

  /** Compress for Azure F0 (max 4 MB) — scanned + small JPEG. */
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
    const engineNote = engineLabel ? ` · ${engineLabel}` : '';
    if (missing.length) {
      setPaymentOcrStatus(
        `${layoutLabel}${engineNote}: could not fully read ${missing.join(', ')}. Fix from the photo, then Apply.`,
        true
      );
    } else {
      setPaymentOcrStatus(`${layoutLabel} detected${engineNote} — compare fields, then Apply.`);
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
        ? 'Scanned receipt · click to zoom · Esc to exit'
        : 'Receipt photo · click to zoom · Esc to exit';
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
      setPaymentOcrStatus('Applying scanner filter…');
    } else {
      setPaymentOcrStatus(
        azureOcrConfigured === false ? 'Reading receipt with local OCR…' : 'Reading receipt…'
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
            ? 'Reading scanned receipt with Azure…'
            : 'Reading receipt with Azure…'
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
            setPaymentOcrStatus(`Using local OCR (${reason})…`);
          }
        } catch (azureError) {
          setPaymentOcrStatus(
            `Using local OCR (${azureError instanceof Error ? azureError.message : 'Azure request failed'})…`
          );
        }
      } else {
        setPaymentOcrStatus(
          paymentOcrScannerFilterEnabled
            ? 'Reading scanned receipt with local OCR…'
            : 'Reading receipt with local OCR…'
        );
      }

      if (!usedAzure) {
        if (typeof Tesseract === 'undefined') {
          throw new Error(
            'Azure OCR unavailable and local OCR library failed to load. Enter details manually.'
          );
        }
        recognizedText = await runTesseractReceiptOcr(workingFile, 'Local OCR… ');
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

    // Always update the preview immediately — do not block on OCR.
    setPaymentOcrStatus(
      enabled ? 'Applying scanner filter…' : 'Showing original receipt…'
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
          'Showing original receipt — OCR fields kept. Turn filter on again to re-read.'
        );
      } else {
        setPaymentOcrStatus('Showing original receipt…');
      }
    } else if (paymentOcrBusy) {
      paymentOcrRerunAfterBusy = true;
      setPaymentOcrStatus(
        'Scanner filter on — OCR will re-read when the current pass finishes.'
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
      // InstaPay channel from OCR prefers bank transfer; wallets stay on E-wallet.
      methodSelect.value = channel === 'InstaPay' ? 'BankTransfer' : 'EWallet';
    } else if (methodSelect && currentMethod === 'EWallet' && channel === 'InstaPay') {
      methodSelect.value = 'BankTransfer';
    }
    if (ext) ext.value = reference;
    if (channelHidden) channelHidden.value = channel;
    if (bank && (methodSelect?.value === 'BankTransfer') && !bank.value.trim()) {
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
          ? `Receipt amount: ${money(amountValue)} · Will apply ${money(appliedAmount)} (excess not posted)`
          : `Receipt amount: ${money(amountValue)}`
      );
    }
    if (partyBits.length && notes) {
      const stamp = `Digital OCR · ${partyBits.join(' · ')}`;
      const existing = (notes.value || '').trim();
      notes.value = existing.includes('Digital OCR ·') || existing.includes('E-wallet OCR ·')
        ? existing.replace(/(?:Digital|E-wallet) OCR ·[^\n]*/i, stamp)
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
        `Applied ${channel} · ${reference}. Receipt ${money(amountValue)} exceeds balance — will post ${money(appliedAmount)} only.`
      );
    } else {
      const amountNote = amountValue > 0 ? ` · ${money(amountValue)}` : '';
      setPaymentOcrStatus(`Applied ${channel} · ${reference}${amountNote}. Save payment when ready.`);
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
      setPaymentCameraStatus('Waiting for camera preview…');
      setPaymentCameraGuideState('scanning', 'Mobile receipt');
      schedulePaymentCameraAutoScan(280);
      return;
    }

    const sharpness = measureFrameSharpness(sample.image);
    if (sharpness < 12) {
      paymentCameraGoodHits = 0;
      paymentCameraLastGoodRef = '';
      setPaymentCameraGuideState('scanning', 'Hold phone upright');
      setPaymentCameraStatus('Center the upright mobile receipt in the portrait frame…');
      schedulePaymentCameraAutoScan(280);
      return;
    }

    if (typeof Tesseract === 'undefined') {
      try {
        await ensureTesseractLoaded();
      } catch {
        setPaymentCameraGuideState('ready', 'Looking clear — tap Capture');
        setPaymentCameraStatus('Image looks clear. OCR unavailable — tap Capture photo.');
        schedulePaymentCameraAutoScan(900);
        return;
      }
    }

    paymentCameraScanBusy = true;
    setPaymentCameraGuideState('scanning', 'Reading…');
    setPaymentCameraStatus('Clear image — checking receipt details…');
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
          setPaymentCameraStatus('Details clear — capturing…');
          paymentCameraAutoCaptureLock = true;
          stopPaymentCameraAutoScan();
          await capturePaymentCameraPhoto({ auto: true });
          return;
        }
        setPaymentCameraStatus('Details found — hold steady…');
      } else {
        paymentCameraGoodHits = 0;
        paymentCameraLastGoodRef = '';
        setPaymentCameraGuideState('scanning', 'Need clearer details');
        setPaymentCameraStatus('Receipt in frame — move closer until ref/amount are sharp…');
      }
    } catch {
      setPaymentCameraStatus('Still scanning… keep the receipt inside the frame.');
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
      setPaymentOcrStatus('Camera needs HTTPS (or localhost). Opening device capture…', true);
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
    setPaymentCameraStatus('Starting camera…');
    setPaymentCameraGuideState('scanning', 'Mobile receipt');
    // Pre-warm OCR worker while the camera stream starts.
    ensurePaymentCameraScanWorker().catch(() => {});
    try {
      await startPaymentCameraStream();
      setPaymentCameraStatus('Portrait scan on — hold the phone upright in the frame.');
      schedulePaymentCameraAutoScan(450);
    } catch (error) {
      closePaymentCameraModal();
      const message = error instanceof Error ? error.message : 'Unable to open camera.';
      setPaymentOcrStatus(`${message} Opening device camera instead…`, true);
      openNativeReceiptCapture();
    }
  }

  async function switchPaymentCamera() {
    paymentCameraFacingMode = paymentCameraFacingMode === 'environment' ? 'user' : 'environment';
    paymentCameraAutoCaptureLock = false;
    stopPaymentCameraAutoScan();
    setPaymentCameraStatus('Switching camera…');
    try {
      await startPaymentCameraStream();
      setPaymentCameraStatus(
        paymentCameraFacingMode === 'environment'
          ? 'Rear camera — auto-scan on.'
          : 'Front camera — auto-scan on.'
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
    setPaymentCameraStatus(options.auto ? 'Auto-capturing clear receipt…' : 'Capturing…');

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
    await runPaymentReceiptOcr(file);
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
    runPaymentReceiptOcr(file);
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
      preview.textContent = `${label} ${money(bal < -0.009 ? Math.abs(bal) : Math.max(0, bal))} · closed by default`;
    }
  }

  function syncPaymentMethodPanels() {
    if (!paymentAddModal) return;
    const method = paymentAddModal.querySelector('[data-payment-method]')?.value || 'Cash';
    const cash = isCashPaymentMethod(method);
    const digital = isDigitalPaymentMethod(method);
    const cashPanel = paymentAddModal.querySelector('[data-payment-cash-panel]');
    const epayPanel = paymentAddModal.querySelector('[data-payment-epay-panel]');
    const bankWrap = paymentAddModal.querySelector('[data-payment-bank-ref-wrap]');
    const hint = paymentAddModal.querySelector('[data-payment-epay-hint]');
    if (cashPanel) cashPanel.hidden = !cash;
    if (epayPanel) epayPanel.hidden = !digital;
    if (bankWrap) bankWrap.hidden = method !== 'BankTransfer';
    if (hint) {
      hint.textContent =
        method === 'BankTransfer'
          ? 'Guest scans the hotel InstaPay QR. Then scan their receipt (or type the reference) and correct OCR if needed.'
          : 'Guest pays by e-wallet (GCash, Maya, PayPal, etc.). Scan their receipt (or type the reference) and correct OCR if needed.';
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
      formula.textContent = `${money(tendered)} − ${money(due)} = ${money(change)} change`;
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
        '<tr><td colspan="6" class="admin-bookings-loading">Loading…</td></tr>';
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

    const by = paymentAddModal.querySelector('[data-payment-received-by]');
    if (by) by.value = localStorage.getItem('moriPaymentReceivedBy') || '';
    const methodSelect = paymentAddModal.querySelector('[data-payment-method]');
    const hasIncidental = (booking.charges || []).some(
      (c) => String(c.chargeType) === 'Incidental' && Number(c.amount || 0) > 0
    );
    if (methodSelect) methodSelect.value = 'Cash';
    if (hasIncidental && methodSelect) {
      methodSelect.value = 'Cash';
    }
    const ext = paymentAddModal.querySelector('[data-payment-external-ref]');
    const bank = paymentAddModal.querySelector('[data-payment-bank-ref]');
    const notes = paymentAddModal.querySelector('[data-payment-notes]');
    if (ext) ext.value = '';
    if (bank) bank.value = '';
    if (notes) {
      notes.value = hasIncidental
        ? 'Incidental (damage) on booking — collect in cash.'
        : '';
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
    if (paymentAddModal) paymentAddModal.hidden = true;
  }

  async function saveRecordedPayment() {
    if (!paymentBookingContext || !paymentAddModal) return;
    const receivedBy = (paymentAddModal.querySelector('[data-payment-received-by]')?.value || '').trim();
    const eventType = 'ArrivalPayment';
    const method = paymentAddModal.querySelector('[data-payment-method]')?.value || 'Cash';
    const saveBtn = paymentAddModal.querySelector('[data-payment-add-save]');
    const cash = isCashPaymentMethod(method);

    let amount = cash
      ? Number(paymentAddModal.querySelector('[data-payment-cash-due]')?.value || 0)
      : Number(paymentAddModal.querySelector('[data-payment-epay-amount]')?.value || 0);

    let notes = (paymentAddModal.querySelector('[data-payment-notes]')?.value || '').trim();
    let externalReference = paymentAddModal.querySelector('[data-payment-external-ref]')?.value || null;
    let bankTransferReference = paymentAddModal.querySelector('[data-payment-bank-ref]')?.value || null;
    let digitalCapMessage = '';

    if (!cash && (paymentOcrBusy || isPaymentOcrAwaitingApply())) {
      if (paymentOcrBusy) {
        showPaymentAddPopup('Wait for receipt OCR to finish before saving.', 'Still reading receipt');
      } else {
        showPaymentAddPopup(
          'Click “Apply to payment” first to copy the scanned receipt into this payment, or click Discard scan.',
          'Apply receipt first'
        );
        paymentAddModal
          .querySelector('[data-payment-ocr-compare]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    if (receivedBy.length < 2) {
      showPaymentAddPopup('Enter the staff name who received payment.', 'Missing staff name');
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
      const cashNote = `Cash tendered ${money(tendered)} · Change ${money(change)}`;
      notes = notes ? `${notes}\n${cashNote}` : cashNote;
      externalReference = null;
      bankTransferReference = null;
    } else if (!cash) {
      if (!(externalReference || '').trim() && !(bankTransferReference || '').trim()) {
        showPaymentAddPopup(
          'Enter the payment reference, or upload a receipt and click Apply to payment.',
          'Missing payment reference'
        );
        return;
      }
      if (method === 'BankTransfer' && !(bankTransferReference || '').trim() && (externalReference || '').trim()) {
        bankTransferReference = externalReference;
      }

      // Option C: e-wallet / bank transfer — post only balance due; note excess on the receipt.
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
          `Receipt/transfer ${money(receiptAmount)} · Applied ${money(applied)} (excess ${money(excess)} not posted)`;
        if (!/Receipt\/transfer .* · Applied /i.test(notes)) {
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
          receivedBy,
          externalReference: cash ? null : externalReference,
          bankTransferReference: cash || method !== 'BankTransfer' ? null : bankTransferReference,
          notes: notes || null,
          receiptImagePath,
        }),
      });
      localStorage.setItem('moriPaymentReceivedBy', receivedBy);
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
      flushLogCount.textContent = `${state} · no export actions yet · kept 7 days`;
      return;
    }
    flushLogCount.textContent = `${state} · ${count} export action${count === 1 ? '' : 's'} · kept 7 days`;
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
      ['Performed by', log.performedBy || '—'],
      ['Records deleted', String(log.recordCount ?? 0)],
      ['PDF softcopy', log.fileName || '—'],
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
      '<tr><td colspan="6" class="admin-bookings-loading">Loading export log…</td></tr>';
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
          log.performedBy || '—',
          String(log.recordCount ?? 0),
          log.fileName || '—',
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
      flushConfirmButton.textContent = 'Exporting…';
    }
    window.setAdminExportLoading?.(true, {
      title: 'Exporting history…',
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
      showBookingMessage(error instanceof Error ? error.message : 'Unable to export history.', true);
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
    if (!value) return '—';
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

  function formatStayRange(checkIn, checkOut) {
    return `${formatDateTime(checkIn) || formatDate(checkIn)} → ${formatDateTime(checkOut) || formatDate(checkOut)}`;
  }

  function toManilaDateTimeIso(dateStr, timeStr) {
    const date = String(dateStr || '').slice(0, 10);
    const time = String(timeStr || '00:00').slice(0, 5);
    return `${date}T${time}:00+08:00`;
  }

  function money(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
    title.textContent = `${item.reference} · ${item.guestName}`;
    const meta = document.createElement('span');
    meta.textContent = `${displayEnum(item.kind)} · ${formatDateTime(item.checkInAtUtc || item.checkIn) || formatDate(item.checkInAtUtc || item.checkIn)}`;
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
    }
    arrivalsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function setPendingCallsMode(active) {
    if (!pendingCallsPanel) return;
    if (active) {
      if (arrivalsPanel) arrivalsPanel.hidden = true;
      if (checkoutsPanel) checkoutsPanel.hidden = true;
    }
    pendingCallsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function setCheckoutsMode(active) {
    if (!checkoutsPanel) return;
    if (active) {
      if (arrivalsPanel) arrivalsPanel.hidden = true;
      if (pendingCallsPanel) pendingCallsPanel.hidden = true;
    }
    checkoutsPanel.hidden = !active;
    syncListChromeHidden();
  }

  function syncListChromeHidden() {
    const specialOpen = (arrivalsPanel && !arrivalsPanel.hidden)
      || (pendingCallsPanel && !pendingCallsPanel.hidden)
      || (checkoutsPanel && !checkoutsPanel.hidden);
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
          : [`${line.quantity}× ${line.roomTypeName}`];
      })
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} · ${booking.guestName}`;
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
      .map((line) => `${line.quantity}× ${line.roomTypeName}`)
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} · ${booking.guestName}`;
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
          : [`${line.quantity}× ${line.roomTypeName}`];
      })
      .join(', ');
    const title = document.createElement('strong');
    title.textContent = `${booking.reference} · ${booking.guestName}`;
    const phone = document.createElement('span');
    phone.textContent = booking.guestPhone
      ? `Call ${booking.guestPhone} — ask about late checkout`
      : 'No phone on file — ask about late checkout';
    const meta = document.createElement('span');
    meta.textContent = rooms || 'Rooms pending assignment';
    const time = document.createElement('small');
    time.textContent = `Checkout ${formatDateTime(booking.checkoutTimeUtc || booking.checkOut)}`;
    button.append(title, phone, meta, time);
    button.addEventListener('click', () => openBookingDetails(booking.id, booking));
    return button;
  }

  async function refreshArrivals() {
    if (!arrivalsList) return;
    arrivalsList.innerHTML = '<p class="admin-bookings-loading">Loading arrivals…</p>';
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
    pendingCallsList.innerHTML = '<p class="admin-bookings-loading">Loading pending calls…</p>';
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
    checkoutsList.innerHTML = '<p class="admin-bookings-loading">Loading checkouts…</p>';
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

  /** Rooms may be assigned from the Manila arrival date onward — not earlier. */
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
      `If the guest arrives earlier, use Adjust stay to move check-in — then assign rooms once that date is today and the stay is fully paid.`
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
      return `${qty}× ${typeName}`;
    });

    let label = parts.join(' · ');
    if (bookingNeedsRooms(booking)) {
      label += ' · not assigned';
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
      cell.textContent = value;
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
      flag.textContent = canAssignRoomsToday(booking) ? 'Needs attention' : 'Ready on arrival';
      flag.title = canAssignRoomsToday(booking)
        ? 'Confirmed — open booking to finish payment check, rooms, and check-in'
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
  }

  /** Field row for guest details — plain label/value blocks (never dl/dt/dd). */
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
        detail.textContent = '—';
      }
    } else {
      const text = String(value ?? '').trim();
      detail.textContent = text || '—';
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
        // Fees until receptionist continues → Checkout (incidental / snacks), then Archive.
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
      hint = 'Next: confirm — payment unlocks after confirmation.';
    } else if (current === 'pay') {
      hint = `Next: record payment · due ${money(balanceDue)}.`;
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
    status.innerHTML = `<span class="admin-booking-flow-path-stepnum">Step ${stepNumber} of ${steps.length}</span> · ${escapeHtml(hint)}`;

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
    const refEl = detailModal.querySelector('[data-detail-reference]');
    const guestEl = detailModal.querySelector('[data-detail-guest]');
    if (refEl) refEl.textContent = hint?.reference || 'Loading…';
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
      flag.textContent = canAssignRoomsToday(booking) ? 'Needs attention' : 'Ready on arrival';
      flag.title = canAssignRoomsToday(booking)
        ? 'Confirmed — open booking to finish payment check, rooms, and check-in'
        : arrivalAssignMessage(booking);
      statusGroup.append(flag);
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
    const incidentalCharges = charges.filter((c) => String(c.chargeType) === 'Incidental');
    const snackCharges = charges.filter((c) => String(c.chargeType) === 'SnackBeverage');
    const extensionCharge = charges.find((c) => String(c.chargeType) === 'StayExtension');
    const extensionNights = extensionCharge ? Number(extensionCharge.quantity || 0) : 0;
    const parseIncidentalNoteFromLabel = (label) => {
      const text = String(label || '');
      const marker = '· cash · ';
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
      const prefix = 'Snack & beverage · ';
      if (!text.startsWith(prefix)) {
        return { product: '', takenDate: manilaTodayIso() };
      }
      const rest = text.slice(prefix.length);
      const takenMatch = rest.match(/(?:^| · )([A-Z][a-z]{2} \d{1,2}, \d{4}) · \d+\s*×/);
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
      const productMatch = rest.match(/^(.*) · [A-Z][a-z]{2} \d{1,2}, \d{4} · \d+\s*×/);
      if (productMatch) {
        return { product: productMatch[1].trim(), takenDate };
      }
      const legacyProduct = rest.match(/^(.*) · \d+\s*×/);
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
    const checkInLabel = formatDateTime(checkInRaw) || formatDate(checkInRaw) || '—';
    const checkOutLabel = formatDateTime(checkOutRaw) || formatDate(checkOutRaw) || '—';
    const stayBadges = [];
    if (hasEarly) stayBadges.push('Early 11:30 AM');
    if (lateHours > 0) stayBadges.push(`Late +${lateHours}h`);
    if (extensionNights > 0) {
      stayBadges.push(`+${extensionNights} night${extensionNights === 1 ? '' : 's'}`);
    }
    const staySummary =
      stayBadges.length > 0
        ? `${checkInLabel} → ${checkOutLabel} (${stayBadges.join(' · ')})`
        : `${checkInLabel} → ${checkOutLabel}`;
    const roomSummary = formatBookingRooms(booking) || '—';

    const fields = document.createElement('div');
    fields.className = 'admin-booking-detail-grid admin-booking-guest-details-grid';
    fields.append(
      detailField('Guest', booking.guestName || '—'),
      detailField('Phone', booking.guestPhone || '—'),
      detailField('Email', booking.guestEmail || '—'),
      detailField('Check-in', checkInLabel),
      detailField('Check-out', checkOutLabel),
      detailField('Stay', staySummary),
      detailField('Nights', String(nights)),
      detailField('Rooms', roomSummary),
      detailField('Request type', displayEnum(booking.kind) || '—'),
      detailField('Payment option', displayEnum(booking.paymentOption) || '—'),
      detailField('Stay total', money(stayTotal)),
      detailField('Reference', booking.reference || '—'),
      detailField('Submitted', formatDateTime(booking.createdAtUtc) || formatDate(booking.createdAtUtc) || '—')
    );

    const feesDisabled =
      Boolean(booking.isArchived) || displayEnum(booking.status) !== 'Confirmed';
    const occupyingGuest = isGuestOccupying(booking);
    const extrasStage =
      occupyingGuest && Number(receptionExtrasStageBookingId) === Number(booking.id);
    // Incidental on Checkout; snack on Fees (step 4) and Checkout.
    const showCheckoutExtras = extrasStage;
    const showSnackFees = !feesDisabled;
    const roomCount = Math.max(
      1,
      (booking.items || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    );

    const guestDetails = document.createElement('section');
    guestDetails.className = 'admin-booking-guest-details';
    const guestToggle = document.createElement('button');
    guestToggle.type = 'button';
    guestToggle.className = 'admin-booking-guest-details-toggle';
    guestToggle.setAttribute('aria-expanded', extrasStage ? 'false' : 'true');
    const guestPreview = [booking.guestName, booking.guestPhone, booking.guestEmail]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' · ');
    guestToggle.innerHTML =
      `<span class="admin-booking-guest-details-toggle-label"><span class="admin-booking-guest-details-toggle-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14z" fill="currentColor"/></svg></span><span class="admin-booking-guest-details-toggle-text"><strong>Guest details</strong><small class="admin-booking-guest-details-preview">${escapeHtml(guestPreview || 'No contact on file')}</small></span></span><span class="admin-booking-guest-details-chevron" aria-hidden="true">▾</span>`;
    const guestBody = document.createElement('div');
    guestBody.className = 'admin-booking-guest-details-body';
    guestBody.append(fields);
    guestToggle.addEventListener('click', () => {
      const open = !guestDetails.classList.contains('is-open');
      guestDetails.classList.toggle('is-open', open);
      guestToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      guestBody.hidden = !open;
    });
    if (extrasStage) {
      guestBody.hidden = true;
    } else {
      guestDetails.classList.add('is-open');
      guestBody.hidden = false;
    }
    guestDetails.append(guestToggle, guestBody);

    const feesPanel = document.createElement('section');
    feesPanel.className = 'admin-booking-fees-panel';
    if (extrasStage) feesPanel.dataset.extrasFees = '1';

    const feesHead = document.createElement('div');
    feesHead.className = 'admin-booking-fees-head';
    const feesHeadText = document.createElement('div');
    feesHeadText.className = 'admin-booking-fees-head-text';
    const feesTitle = document.createElement('h3');
    feesTitle.textContent = extrasStage ? 'Checkout · incidental & snacks' : 'Stay fees';
    const feesLede = document.createElement('p');
    feesLede.className = 'admin-booking-fees-lede';
    feesLede.textContent = feesDisabled
      ? displayEnum(booking.status) === 'Pending'
        ? 'Confirm the booking first, then record payment and assign rooms before adding stay fees.'
        : 'Stay fees are locked for this booking.'
      : extrasStage
        ? 'Record incidental damages (multiple allowed) or more snacks. Settle any balance under Price & payments, then Archive when fully paid.'
        : occupyingGuest
          ? 'Add early / late / extra person / extend stay and snack & beverage here. Continue to Checkout for incidental damages.'
          : 'Add early / late / extra person / extend stay and snack & beverage here. Incidental damages unlock at Checkout.';
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
      const locked = trigger.classList.contains('is-locked') || feesDisabled;
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
    }) => {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'admin-fee-dd-trigger';
      trigger.dataset.feeDd = id;
      trigger.setAttribute('role', 'tab');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `fee-panel-${id}`);
      if (locked || feesDisabled) trigger.classList.add('is-locked');
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
      triggerChevron.textContent = '▾';
      trigger.append(triggerLabel, triggerMeta, triggerChevron);

      const panel = document.createElement('div');
      panel.className = 'admin-fee-dd-panel';
      panel.id = `fee-panel-${id}`;
      panel.dataset.feePanel = id;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;

      const panelHead = document.createElement('div');
      panelHead.className = 'admin-fee-dd-panel-head';
      panelHead.append(Object.assign(document.createElement('strong'), { textContent: title }));
      if (hint) {
        panelHead.append(Object.assign(document.createElement('span'), { textContent: hint }));
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
        canDelete: Boolean(canDelete),
        getMeta,
        refreshMeta,
        showTrigger: Boolean(showTrigger),
      });
      refreshMeta();
      return { trigger, panel, refreshMeta };
    };

    const earlyInput = document.createElement('input');
    earlyInput.type = 'checkbox';
    earlyInput.dataset.feeEarly = '1';
    earlyInput.checked = hasEarly;
    earlyInput.disabled = true;

    const lateSelect = document.createElement('select');
    lateSelect.dataset.feeLate = '1';
    lateSelect.disabled = true;
    [
      ['0', '12:00 PM — no fee'],
      ['1', '+1 hour · ₱100 / room'],
      ['2', '+2 hours · ₱200 / room'],
      ['3', '+3 hours · ₱300 / room'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      lateSelect.append(opt);
    });
    lateSelect.value = String(Math.min(3, Math.max(0, lateHours)));

    const extraInput = document.createElement('input');
    extraInput.type = 'checkbox';
    extraInput.dataset.feeExtra = '1';
    extraInput.checked = extraPersons > 0;
    extraInput.disabled = true;
    if (!allowsExtraPerson) extraInput.dataset.keepDisabled = '1';

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
      return note ? `${money(line.amount)} · ${note}` : money(line.amount);
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
      textContent: 'Line total: ₱0.00',
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
        : '—';
      const qtyPart = `${line.qty} × ${money(line.unitAmount)}`;
      return product
        ? `${product} · ${taken} · ${qtyPart} = ${money(total)}`
        : `${taken} · ${qtyPart} = ${money(total)}`;
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

    // Register every fee category so Manage fees lists them on Fees and Checkout.
    // Only stage-relevant triggers stay visible in the pill row.
    registerFeeCategory({
      id: 'early',
      title: 'Early check-in',
      hint: '11:30 AM · ₱500 / room',
      showTrigger: !extrasStage,
      buildBody: () => {
        const row = document.createElement('label');
        row.className = 'admin-booking-fee-option';
        row.append(
          earlyInput,
          Object.assign(document.createElement('span'), {
            textContent: 'Apply early check-in fee for this stay',
          })
        );
        return [row];
      },
      getMeta: () =>
        earlyInput.checked
          ? { active: true, text: money(500 * roomCount) }
          : { active: false, text: '' },
    });

    registerFeeCategory({
      id: 'late',
      title: 'Late check-out',
      hint: '₱100 / hour / room · max 3 hours',
      showTrigger: !extrasStage,
      buildBody: () => {
        const row = document.createElement('label');
        row.className = 'admin-booking-fee-option';
        row.append(Object.assign(document.createElement('span'), { textContent: 'Checkout time' }), lateSelect);
        return [row];
      },
      getMeta: () => {
        const hours = Number(lateSelect.value || 0);
        return hours > 0
          ? { active: true, text: `+${hours}h · ${money(100 * hours * roomCount)}` }
          : { active: false, text: '' };
      },
    });

    registerFeeCategory({
      id: 'extra',
      title: 'Extra person',
      hint: '₱200 / night · max 1',
      locked: !allowsExtraPerson,
      showTrigger: !extrasStage,
      buildBody: () => {
        const row = document.createElement('label');
        row.className = `admin-booking-fee-option${allowsExtraPerson ? '' : ' is-disabled'}`;
        row.append(
          extraInput,
          Object.assign(document.createElement('span'), {
            textContent: allowsExtraPerson
              ? 'Add one extra person for this stay'
              : 'Not available for this room setup',
          })
        );
        return [row];
      },
      getMeta: () =>
        extraInput.checked
          ? { active: true, text: money(200 * nights) }
          : { active: false, text: '' },
    });

    registerFeeCategory({
      id: 'extend',
      title: 'Extend stay',
      hint: 'Adds nights and moves checkout date',
      showTrigger: !extrasStage,
      buildBody: () => [makeFeeField('Add nights', extendInput), extendPreview],
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
      hint: 'Multiple damages · collect in cash',
      showTrigger: Boolean(showCheckoutExtras),
      buildBody: () => {
        const draftRow = document.createElement('div');
        draftRow.className = 'admin-booking-fee-snack-row';
        draftRow.append(
          makeFeeField('Amount (₱)', incidentalAmountInput),
          makeFeeField('Note', incidentalNoteInput, true)
        );
        const draftBlock = document.createElement('div');
        draftBlock.className = 'admin-booking-fee-snack-draft';
        draftBlock.append(draftRow, incidentalAddBtn);
        return [incidentalCartHint, incidentalLinesList, draftBlock];
      },
      getMeta: () => {
        const draftAmount = parseMoneyInput(incidentalAmountInput.value);
        const total = incidentalLinesTotal() + Math.max(0, draftAmount);
        const count = incidentalLines.length + (draftAmount > 0 ? 1 : 0);
        if (total <= 0) return { active: false, text: '' };
        if (count === 1) return { active: true, text: money(total) };
        return { active: true, text: `${count} damages · ${money(total)}` };
      },
    });

    registerFeeCategory({
      id: 'snack',
      title: 'Snack & beverage',
      hint: 'Products with date taken · qty × unit price',
      showTrigger: Boolean(showSnackFees),
      buildBody: () => {
        const snackRow = document.createElement('div');
        snackRow.className = 'admin-booking-fee-snack-row';
        snackRow.append(
          makeFeeField('Taken date', snackTakenInput),
          makeFeeField('Qty', snackQtyInput),
          makeFeeField('Unit price (₱)', snackUnitInput)
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
        return [snackCartHint, snackLinesList, draftBlock];
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
            text: product ? `${product} · ${money(total)}` : money(total),
          };
        }
        if (count === 1 && draftActive && !snackLines.length) {
          return {
            active: true,
            text: draft.product ? `${draft.product} · ${money(total)}` : money(total),
          };
        }
        return { active: true, text: `${count} items · ${money(total)}` };
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
      if (id === 'extra' && !extraInput.dataset.keepDisabled) extraInput.checked = false;
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
    };

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
                ? 'From Stay fees · Edit opens here'
                : 'From Checkout · Edit opens here',
            })
          );
        }
        const actions = document.createElement('div');
        actions.className = 'admin-booking-fees-manage-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-booking-fees-manage-edit';
        editBtn.textContent = 'Edit';
        editBtn.disabled = feesDisabled;
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
          deleteBtn.textContent = 'Delete';
          deleteBtn.disabled = feesDisabled;
          deleteBtn.addEventListener('click', () => {
            clearFeeCategory(cat.id);
            refreshAllFeeMeta();
            feesMsg.hidden = false;
            feesMsg.textContent = 'Cleared — click Save stay fees to apply.';
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
    };

    [
      earlyInput,
      lateSelect,
      extraInput,
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
    if (feesDisabled) feesManageBtn.disabled = true;

    feesLayout.append(feeTriggers, feePanels);

    const feesMsg = document.createElement('p');
    feesMsg.className = 'admin-booking-fees-msg';
    feesMsg.dataset.feeMsg = '1';
    feesMsg.hidden = true;

    refreshFeeManageList();
    feesPanel.append(feesHead, feesManageList, feesLayout, feesMsg);

    const collectStayFeesPayload = () => {
      pushIncidentalDraft({ silent: true });
      pushSnackDraft({ silent: true });
      return {
        earlyCheckIn: Boolean(earlyInput.checked),
        lateCheckoutHours: Number(lateSelect.value || 0),
        extraPersons: Boolean(extraInput.checked) ? 1 : 0,
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
          label: 'Extra person',
          amount: charge ? Number(charge.amount || 0) : 200 * nights,
        });
      }
      if (Array.isArray(payload.incidentals) && payload.incidentals.length) {
        payload.incidentals.forEach((line) => {
          const amount = Math.max(0, Number(line.amount || 0));
          if (amount <= 0) return;
          const note = (line.note || '').trim();
          lines.push({
            label: note ? `Incidental (cash) · ${note}` : 'Incidental (cash)',
            amount,
          });
        });
      } else if (payload.incidentalAmount > 0) {
        const note = payload.incidentalNote ? ` · ${payload.incidentalNote}` : '';
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
          const takenPart = taken ? ` · ${taken}` : '';
          lines.push({
            label: product
              ? `Snack & beverage · ${product}${takenPart} · ${qty} × ${money(unit)}`
              : `Snack & beverage${takenPart} · ${qty} × ${money(unit)}`,
            amount: total,
          });
        });
      } else {
        const snackTotal =
          Math.max(0, payload.snackBeverageQty) * Math.max(0, payload.snackBeverageUnitAmount);
        if (snackTotal > 0) {
          const product = payload.snackBeverageProduct
            ? `${payload.snackBeverageProduct} · `
            : '';
          lines.push({
            label: `Snack & beverage · ${product}${payload.snackBeverageQty} × ${money(payload.snackBeverageUnitAmount)}`,
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
          label: `Extend stay · +${Math.max(extendQty, payload.extendStayNights)} night${
            Math.max(extendQty, payload.extendStayNights) === 1 ? '' : 's'
          }`,
          amount: extendCharge ? Number(extendCharge.amount || 0) : null,
          note: 'Included in room stay',
        });
      } else if (payload.revertStayExtension && extensionNights > 0) {
        lines.push({
          label: `Extend stay removed · −${extensionNights} night${extensionNights === 1 ? '' : 's'}`,
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
          value.textContent = line.amount == null ? '—' : money(line.amount);
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

    if (!feesDisabled) {
      const saveFeesBtn = document.createElement('button');
      saveFeesBtn.type = 'button';
      saveFeesBtn.className = 'admin-booking-fees-save';
      saveFeesBtn.textContent = 'Save stay fees';
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
      itemLinesHtml += `
        <div class="admin-breakdown-row">
          <span>${qty}× ${escapeHtml(line.roomTypeName || 'Room')} <small>(${money(rate)}/night × ${nights} night${nights === 1 ? '' : 's'})</small></span>
          <strong>${money(lineTotal)}</strong>
        </div>
      `;
    });
    if (extensionCharge) {
      itemLinesHtml += `
        <div class="admin-breakdown-row is-sub is-extension">
          <span>${escapeHtml(extensionCharge.label || `Extra night(s) · +${extensionNights}`)} <small>(included in room stay)</small></span>
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
            <span>${escapeHtml(formatDateTime(payment.paidAtUtc))} · ${escapeHtml(formatPaymentMethod(payment.method))} <small>${escapeHtml(payment.receiptNumber || '')}</small></span>
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
    toggleIcon.textContent = '▾';
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
        <span>Room subtotal${roomCount ? ` · ${roomCount} room${roomCount === 1 ? '' : 's'}` : ''}</span>
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
    const hasAssignedRooms = (booking.items || []).some(
      (line) => (line.assignedRooms || []).length > 0
    );
    const onRoomsStep =
      !booking.isArchived && status === 'Confirmed' && !hasAssignedRooms
        ? () => renderConfirmAssign(booking, { assignOnly: true })
        : null;

    const heading = document.createElement('h3');
    heading.textContent =
      onRoomsStep ? 'Step 3 · Assign rooms' : 'Rooms';
    const lines = document.createElement('ul');
    lines.className = 'admin-booking-lines';
    (booking.items || []).forEach((line) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const assigned = (line.assignedRooms || [])
        .map((room) => room.roomNumber)
        .filter(Boolean);
      name.textContent = assigned.length
        ? `${line.quantity}× ${line.roomTypeName} → ${assigned.join(', ')}`
        : `${line.quantity}× ${line.roomTypeName}${status === 'Confirmed' ? ' · rooms not assigned yet' : ''}`;
      const rate = document.createElement('strong');
      rate.textContent = `${money(line.pricePerNight)} / night`;
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
          `Use Adjust stay if the guest called to arrive earlier — Assign rooms unlocks on the new check-in date when fully paid.`;
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
      // Guest schedule error after rooms assigned — contact + dates only.
      detailActions.append(
        actionIconButton({
          label: 'Correct guest / stay',
          icon: ACTION_ICONS.edit,
          onClick: () => renderBookingEdit(booking, { hardEdit: true }),
        })
      );
    }

    // Cancel only on Confirm / Payment steps — not Rooms, Fees, Extras, or Checkout.
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

    // Payments only after confirmation — hidden while Pending.
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
            label: 'Payments — view record',
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

    // Pending confirm: confirm the booking only — rooms come after full payment.
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
          `Balance due ${money(paymentPriceContext.balanceDue)}. After you confirm, record payment — rooms unlock when fully paid.`;
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
          title.textContent = `${group.roomTypeName} · pick ${group.quantityNeeded}`;
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
              placeholder.textContent = 'Select room…';
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

  function editField(label, name, type, value) {
    const field = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    caption.textContent = label;
    input.name = name;
    input.type = type;
    input.value = value || '';
    input.required = true;
    field.append(caption, input);
    return field;
  }

  function renderBookingEdit(booking, options = {}) {
    if (!detailBody || !detailActions) return;
    const adjustStay = Boolean(options.adjustStay);
    const hardEdit = Boolean(options.hardEdit);
    const needsAvailPreview = adjustStay || hardEdit;
    detailBody.replaceChildren();
    detailActions.replaceChildren();

    const form = document.createElement('form');
    form.className = 'admin-booking-edit-form';
    if (adjustStay) form.classList.add('is-adjust-stay');
    if (hardEdit) form.classList.add('is-hard-edit');

    const intro = document.createElement('p');
    intro.className = 'admin-booking-edit-hint';
    intro.textContent = hardEdit
      ? 'Correct a guest schedule error: update contact and check-in / check-out. Assigned room numbers stay the same. Saving recalculates nights and total.'
      : adjustStay
        ? 'Guest called to change arrival? Update check-in / check-out (and contact if needed). Saving recalculates nights and total. Assign rooms unlocks on the new Manila arrival date once fully paid.'
        : 'Update guest details, stay dates, or room quantities.';

    const fields = document.createElement('div');
    fields.className = 'admin-booking-edit-grid';
    const checkInParts = manilaParts(booking.checkInAtUtc || booking.checkIn) || { date: '', time: '14:00' };
    const checkOutParts = manilaParts(booking.checkoutTimeUtc || booking.checkOut) || { date: '', time: '12:00' };
    fields.append(
      editField('Guest name', 'guestName', 'text', booking.guestName),
      editField('Email', 'guestEmail', 'email', booking.guestEmail),
      editField('Phone', 'guestPhone', 'tel', booking.guestPhone),
      editField('Check-in date', 'checkIn', 'date', checkInParts.date),
      editField('Check-in time', 'checkInTime', 'time', checkInParts.time),
      editField('Check-out date', 'checkOut', 'date', checkOutParts.date),
      editField('Check-out time', 'checkOutTime', 'time', checkOutParts.time)
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
    availStatus.textContent = 'Checking availability…';
    availPanel.append(availTitle, availList, availStatus);

    const roomHeading = document.createElement('h3');
    roomHeading.textContent = hardEdit ? 'Assigned rooms (locked)' : 'Room quantities';
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
          `<span>${escapeHtml(String(line.quantity || 0))}× ${escapeHtml(line.roomTypeName || 'Room')}` +
          `${assigned.length ? ` → ${escapeHtml(assigned.join(', '))}` : ''}</span>` +
          `<strong>${money(line.pricePerNight)} / night</strong>`;
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.dataset.roomTypeId = String(line.roomTypeId);
        hidden.value = String(line.quantity || 0);
        row.append(hidden);
        roomFields.append(row);
      });
    } else {
      (booking.items || []).forEach((line) => {
        const field = editField(line.roomTypeName, `room-${line.roomTypeId}`, 'number', line.quantity);
        const input = field.querySelector('input');
        input.min = '0';
        input.max = '20';
        input.dataset.roomTypeId = String(line.roomTypeId);
        roomFields.append(field);
      });
    }

    const hint = document.createElement('p');
    hint.className = 'admin-booking-edit-hint';
    hint.textContent = hardEdit
      ? 'Room numbers stay assigned. If another guest holds the same room on the new dates, save will be blocked.'
      : 'Set a room quantity to 0 to remove it. At least one room must remain.';
    const error = document.createElement('p');
    error.className = 'admin-booking-edit-error';
    error.hidden = true;
    form.append(intro, fields, availPanel, roomHeading, roomFields, hint, error);
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

    let availOk = !needsAvailPreview;
    let availTimer = null;
    let lastNoAvailKey = '';

    function requiredLines() {
      if (hardEdit) {
        return (booking.items || []).map((line) => ({
          roomTypeId: Number(line.roomTypeId),
          roomTypeName: line.roomTypeName || 'Room',
          quantity: Number(line.quantity || 0),
        }));
      }
      return Array.from(form.querySelectorAll('[data-room-type-id]')).map((input) => ({
        roomTypeId: Number(input.dataset.roomTypeId),
        roomTypeName: input.closest('label')?.querySelector('span')?.textContent || 'Room',
        quantity: Number(input.value || 0),
      })).filter((line) => line.quantity > 0);
    }

    function showNoAvailabilityPopup(message) {
      const popup = detailModal?.querySelector('[data-edit-availability-popup]');
      const msg = popup?.querySelector('[data-edit-availability-message]');
      if (!popup || !msg) {
        window.alert(message);
        return;
      }
      msg.textContent = message;
      popup.hidden = false;
    }

    function hideNoAvailabilityPopup() {
      const popup = detailModal?.querySelector('[data-edit-availability-popup]');
      if (popup) popup.hidden = true;
    }

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

      availStatus.textContent = 'Checking availability…';
      try {
        const checkInAtUtc = toManilaDateTimeIso(checkIn, checkInTime);
        const checkoutTimeUtc = toManilaDateTimeIso(checkOut, checkOutTime);
        const query = new URLSearchParams({ checkInAtUtc, checkoutTimeUtc });
        const rows = await apiFetch(
          `/api/admin/bookings/${booking.id}/availability?${query.toString()}`
        );
        const byType = new Map((rows || []).map((row) => [Number(row.roomTypeId), row]));
        const needed = requiredLines();
        availList.replaceChildren();
        let insufficient = false;
        const shortLines = [];

        needed.forEach((line) => {
          const row = byType.get(line.roomTypeId);
          const remaining = row ? Number(row.remaining ?? row.Remaining ?? 0) : 0;
          const li = document.createElement('li');
          const ok = remaining >= line.quantity;
          if (!ok) {
            insufficient = true;
            shortLines.push(
              `${line.roomTypeName}: need ${line.quantity}, only ${remaining} available`
            );
          }
          li.className = ok ? 'is-ok' : 'is-short';
          li.textContent = `${line.roomTypeName}: ${remaining} available` +
            (line.quantity > 1 ? ` (need ${line.quantity})` : '');
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
          ? 'Not enough rooms for these dates — change the dates or wait for availability.'
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

    function scheduleAvailRefresh() {
      if (!needsAvailPreview) return;
      window.clearTimeout(availTimer);
      availTimer = window.setTimeout(() => {
        void refreshEditAvailability();
      }, 280);
    }

    ['checkIn', 'checkInTime', 'checkOut', 'checkOutTime'].forEach((name) => {
      form.querySelector(`[name="${name}"]`)?.addEventListener('change', scheduleAvailRefresh);
      form.querySelector(`[name="${name}"]`)?.addEventListener('input', scheduleAvailRefresh);
    });
    if (!hardEdit) {
      form.querySelectorAll('[data-room-type-id]').forEach((input) => {
        input.addEventListener('change', scheduleAvailRefresh);
        input.addEventListener('input', scheduleAvailRefresh);
      });
    }

    detailModal?.querySelectorAll('[data-edit-availability-ok]').forEach((btn) => {
      if (btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        const popup = detailModal?.querySelector('[data-edit-availability-popup]');
        if (popup) popup.hidden = true;
      });
    });

    saveButton.addEventListener('click', () => {
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
      void refreshEditAvailability();
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
      : Array.from(form.querySelectorAll('[data-room-type-id]')).map((input) => ({
          roomTypeId: Number(input.dataset.roomTypeId),
          quantity: Number(input.value || 0),
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
      errorElement.textContent = error instanceof Error ? error.message : 'Unable to save changes.';
      errorElement.hidden = false;
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
      // Same guest reopened while on Checkout — keep step 5, hide leftover intro overlay.
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
    if (/call guest: checkout|checkout in 20/i.test(message)) {
      return { type: 'filter', url: '/AdminBookings?checkouts=soon' };
    }
    if (/call guest/i.test(message)) {
      return { type: 'filter', url: '/AdminBookings?pendingCalls=soon' };
    }
    if (/arrival/i.test(message)) {
      return { type: 'filter', url: '/AdminBookings?arrivals=soon' };
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
        if (refEl) refEl.textContent = booking.reference || '—';
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

  async function refreshBookings() {
    if (!bookingList) return;
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

  function mapCalendarEvents(items) {
    return (items || []).map((item) => {
      const bookingId = Number(item.id);
      const isReservation = item.kind === 'Reservation' || item.kind === 1;
      const extensionNights = Math.max(0, Number(item.extensionNights || 0));
      const primaryBg = isReservation ? '#1aa6a6' : '#3d7ea6';
      const primaryBorder = isReservation ? '#0f6e6e' : '#2f6488';
      const title =
        extensionNights > 0
          ? `${item.title} · +${extensionNights} night${extensionNights === 1 ? '' : 's'} extended`
          : item.title;

      return {
        id: String(bookingId),
        title,
        start: item.start,
        end: item.end,
        allDay: true,
        backgroundColor: primaryBg,
        borderColor: primaryBorder,
        classNames: [
          isReservation ? 'is-reservation' : 'is-booking',
          extensionNights > 0 ? 'has-extension' : '',
        ].filter(Boolean),
        extendedProps: {
          ...item,
          bookingId,
          extensionNights,
          isReservation,
          primaryBg,
          // Same hue family, lighter — reads as continuation, not a second guest.
          extensionBg: isReservation ? '#7dcccc' : '#7aaec8',
          primaryBorder,
        },
      };
    });
  }

  function paintCalendarExtension(info) {
    const props = info.event.extendedProps || {};
    const extensionNights = Math.max(0, Number(props.extensionNights || 0));
    const el = info.el;
    if (!el) return;

    el.title = info.event.title || props.title || '';

    if (extensionNights <= 0) return;

    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) return;

    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs));
    const primaryDays = Math.max(1, totalDays - extensionNights);
    const primaryPct = Math.min(99, Math.max(1, (primaryDays / totalDays) * 100));
    const primaryBg = props.primaryBg || (props.isReservation ? '#1aa6a6' : '#3d7ea6');
    const extensionBg = props.extensionBg || (props.isReservation ? '#7dcccc' : '#7aaec8');
    const border = props.primaryBorder || primaryBg;

    el.style.backgroundColor = primaryBg;
    el.style.backgroundImage = `linear-gradient(90deg, ${primaryBg} 0%, ${primaryBg} ${primaryPct}%, ${extensionBg} ${primaryPct}%, ${extensionBg} 100%)`;
    el.style.borderColor = border;
    el.style.color = '#ffffff';
    el.classList.add('has-extension');

    // One clear “extended” cue without a second event bar.
    if (!el.querySelector('.admin-calendar-ext-mark')) {
      const mark = document.createElement('span');
      mark.className = 'admin-calendar-ext-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = `+${extensionNights}`;
      el.append(mark);
    }
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
      initialView: window.innerWidth < 720 ? 'listMonth' : 'dayGridMonth',
      height: 'auto',
      dayMaxEvents: 3,
      displayEventTime: false,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listMonth',
      },
      buttonText: {
        today: 'Today',
        month: 'Month',
        list: 'List',
      },
      events: async (info, success, failure) => {
        try {
          const query = new URLSearchParams({
            start: info.startStr.slice(0, 10),
            end: info.endStr.slice(0, 10),
          });
          const items = await apiFetch(`/api/admin/bookings/calendar?${query}`);
          success(mapCalendarEvents(items));
          if (calendarFallback) calendarFallback.hidden = true;
        } catch (error) {
          if (calendarFallback) calendarFallback.hidden = false;
          failure(error);
        }
      },
      eventDidMount: paintCalendarExtension,
      eventClick: (info) => {
        const bookingId = Number(
          info.event.extendedProps?.bookingId || info.event.id
        );
        if (Number.isFinite(bookingId) && bookingId > 0) {
          openBookingDetails(bookingId);
        }
      },
    });
    reservationCalendar.render();
  }

  detailModal?.querySelectorAll('[data-booking-modal-close]').forEach((button) => {
    button.addEventListener('click', closeBookingDetails);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !isPhotoZoomOpen() && detailModal && !detailModal.hidden) {
      closeBookingDetails();
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
          reservationCalendar?.updateSize();
        });
      } else {
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
    paymentAddModal?.querySelector('[data-payment-ocr-apply]')?.focus();
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
  paymentAddModal?.querySelector('[data-payment-ocr-amount]')?.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    input.value = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
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
  paymentAddModal?.querySelector('[data-payment-ocr-apply]')?.addEventListener('click', applyPaymentOcrResult);
  paymentAddModal?.querySelector('[data-payment-ocr-discard]')?.addEventListener('click', discardPaymentOcrResult);
  paymentAddModal?.querySelector('[data-payment-ocr-scanner-filter]')?.addEventListener(
    'change',
    onPaymentOcrScannerFilterToggle
  );
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
    refreshBookings();
  });
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
      if (!arrivalsPanel?.hidden) {
        await refreshArrivals();
      } else if (!pendingCallsPanel?.hidden) {
        await refreshPendingCalls();
      } else if (!checkoutsPanel?.hidden) {
        await refreshCheckouts();
      } else {
        await refreshBookings();
      }
      reservationCalendar?.refetchEvents();
    }, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function startSignalR() {
    if (!window.signalR) {
      beginPolling();
      return;
    }

    const connection = new window.signalR.HubConnectionBuilder()
      .withUrl('/hubs/bookings')
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(window.signalR.LogLevel.Warning)
      .build();

    connection.on('BookingCreated', async () => {
      playChime();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.on('BookingUpdated', async () => {
      const listRefresh = !arrivalsPanel?.hidden
        ? refreshArrivals()
        : !pendingCallsPanel?.hidden
          ? refreshPendingCalls()
          : !checkoutsPanel?.hidden
            ? refreshCheckouts()
            : refreshBookings();
      await Promise.all([refreshNotifications(), listRefresh]);
      reservationCalendar?.refetchEvents();
    });
    connection.on('BookingArchived', async () => {
      closeBookingDetails();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.on('PaymentChanged', async (bookingId) => {
      await refreshBookings();
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
    });
    connection.onreconnecting(beginPolling);
    connection.onreconnected(async () => {
      stopPolling();
      await Promise.all([refreshNotifications(), refreshBookings()]);
      reservationCalendar?.refetchEvents();
    });
    connection.onclose(() => {
      beginPolling();
      reconnectTimer = window.setTimeout(connect, 10000);
    });

    async function connect() {
      try {
        await connection.start();
        stopPolling();
      } catch {
        beginPolling();
        reconnectTimer = window.setTimeout(connect, 10000);
      }
    }

    await connect();
  }

  window.addEventListener('beforeunload', () => {
    if (pollTimer) window.clearInterval(pollTimer);
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (searchTimer) window.clearTimeout(searchTimer);
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
    // Open skeleton modal immediately — do not wait for the bookings table.
    void openBookingDetails(earlyBookingId, earlyHint, { markRead: true });
    const url = new URL(window.location.href);
    url.searchParams.delete('booking');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  }

  void refreshNotifications();
  void refreshBookings();
  if (params.get('pendingCalls') === 'soon' && !pendingCallsFromUrlHandled) {
    pendingCallsFromUrlHandled = true;
    openPendingCallsSoon();
  } else if (params.get('arrivals') === 'soon' && !arrivalsFromUrlHandled) {
    arrivalsFromUrlHandled = true;
    openArrivalsSoon();
  } else if (params.get('checkouts') === 'soon' && !checkoutsFromUrlHandled) {
    checkoutsFromUrlHandled = true;
    openCheckoutsSoon();
  }
  void startSignalR();
})();
