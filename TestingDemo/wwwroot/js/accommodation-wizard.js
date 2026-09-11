(() => {
  const root = document.querySelector('[data-wiz-root]');
  if (!root) return;

  const CHECK_SVG =
    '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7l3 3 5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const REMOVE_SVG =
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 4.5h10M6.2 4.5V3.4c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.1M12.2 4.5l-.5 8.2c0 .5-.4.8-.9.8H5.2c-.5 0-.9-.3-.9-.8L3.8 4.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SIGNUP_STAR =
    '<svg class="wiz-signup-star" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7.2 13.2 9.7l2.7.4-2 1.9.5 2.7L12 13.4l-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#fff"/></svg>';
  const SIGNUP_CHEVRON =
    '<svg class="wiz-signup-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 2.5 8 6 4.5 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const EXTRA_FEE = 200;
  const INCLUDED_PER_ROOM = 2;
  const MAX_GUESTS_PER_ROOM = 3;
  const MAX_CHILD_AGE = 12;
  const MAX_ROOMS = 8;
  const PH_OFFSET = '+08:00';
  const CHECKIN_TIME = '14:00';
  const CHECKOUT_TIME = '12:00';
  const MIN_LEAD_HOURS = 24;

  const stayRoomsEl = document.querySelector('[data-wiz-stay-rooms]');
  const stayAlert = document.querySelector('[data-wiz-stay-alert]');
  const roomsAlert = root.querySelector('[data-wiz-rooms-alert]');
  const addRoomBtn = document.querySelector('[data-wiz-add-room]');
  const staySheet = document.querySelector('[data-wiz-stay-sheet]');
  const stayBack = document.querySelector('[data-wiz-stay-back]');
  const guestsTab = root.querySelector('[data-wiz-tab-guests]');
  const stayHeadsEl = root.querySelector('[data-wiz-stay-heads]');
  function t(key, params) {
    const fn = window.MoriI18n?.t;
    return typeof fn === 'function' ? fn(key, params) : key;
  }
  function tn(oneKey, manyKey, n, extra) {
    return t(Number(n) === 1 ? oneKey : manyKey, { n, ...extra });
  }
  function uiLocale() {
    const lang = window.MoriI18n?.getLang?.() || 'en';
    return lang === 'zh-Hans' ? 'zh-CN' : lang;
  }
  function catLabel(name) {
    return window.MoriI18n?.translateInclusionCategory?.(name) || name;
  }
  function fillFirst() {
    return t('wiz.fillFirst');
  }
  function guestsRoomsLabel(guests, rooms) {
    if (guests === 1 && rooms === 1) return t('wiz.guestsRooms', { guests, rooms });
    if (guests !== 1 && rooms === 1) return t('wiz.guestsRoomsPluralG', { guests, rooms });
    if (guests === 1 && rooms !== 1) return t('wiz.guestsRoomsPluralR', { guests, rooms });
    return t('wiz.guestsRoomsPlural', { guests, rooms });
  }
  const checkInEl = document.getElementById('wizCheckIn');
  const checkOutEl = document.getElementById('wizCheckOut');
  const nightsEl = root.querySelector('[data-wiz-nights]');
  const nightsText = root.querySelector('[data-wiz-nights-text]');
  const stayChip = root.querySelector('[data-wiz-stay-chip]');
  const cartNav = document.querySelector('[data-wiz-cart-nav]');
  const cartBadge = document.querySelector('[data-wiz-cart-badge]');
  const drawer = document.querySelector('[data-wiz-drawer]');
  const drawerBack = document.querySelector('[data-wiz-drawer-back]');
  const detail = document.querySelector('[data-wiz-detail-sheet]');
  const offerSheet = document.querySelector('[data-wiz-offer-sheet]');
  const dateSheet = document.querySelector('[data-wiz-date-sheet]');
  const dateBack = document.querySelector('[data-wiz-date-back]');
  const dateInEl = document.getElementById('wizOfferCheckIn');
  const dateOutEl = document.getElementById('wizOfferCheckOut');
  const detailBack = document.querySelector('[data-wiz-detail-back]');
  const sticky = root.querySelector('[data-wiz-sticky]');
  const form = document.querySelector('[data-wiz-drawer-step="form"]');
  const submitBtn = document.querySelector('[data-wiz-submit]');
  const formAlert = document.querySelector('[data-wiz-form-alert]');
  const reviewAlert = document.querySelector('[data-wiz-review-alert]');
  const token = document.querySelector('#wizAntiForgery input[name="__RequestVerificationToken"]')?.value || '';

  let step = 1;
  let stayRooms = [normalizeStayRoom({ adults: 2, children: 0 })];
  let bookingFor = 'myself';
  let drawerStep = 'summary';
  let cart = [];
  let lastFocus = null;
  let specialOffers = [];
  let detailCard = null;
  const forcedOfferByType = new Map();
  let offerChoiceId = null;
  let pendingOfferId = 0;
  let pendingMinNights = 0;
  let galleryImages = [];
  let galleryIndex = 0;
  let galleryName = '';
  let toastTimer = 0;
  let flyRaf = 0;
  let pickMode = 'in';
  let calMonth = null;
  let tabPulseTimer = 0;
  let occupancyConfirmed = false;
  let stayPromptActive = false;
  let lastNightsShown = 0;
  let lastConfirm = null;
  let farCheckInAck = '';
  /** @type {((ok: boolean) => void) | null} */
  let farCheckInResolver = null;

  const farCheckInBack = document.querySelector('[data-wiz-far-checkin-back]');
  const farCheckInSheet = document.querySelector('[data-wiz-far-checkin-sheet]');
  const farCheckInCopy = document.querySelector('[data-wiz-far-checkin-copy]');

  function manilaToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  }

  function parseYmd(value) {
    const [y, m, d] = String(value || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }

  function nightsBetween(a, b) {
    const start = parseYmd(a);
    const end = parseYmd(b);
    if (start == null || end == null) return 0;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  /** Check-in on or after the same calendar day next month (Manila). Soft warning only. */
  function isOneMonthOrMoreAhead(ymd) {
    const today = manilaToday();
    const [y, m, d] = String(today).split('-').map(Number);
    if (!y || !m || !d) return false;
    const threshold = Date.UTC(y, m, d);
    const check = parseYmd(ymd);
    return check != null && check >= threshold;
  }

  function closeFarCheckInDialog(confirmed) {
    if (farCheckInSheet) farCheckInSheet.hidden = true;
    if (farCheckInBack) farCheckInBack.hidden = true;
    const resolve = farCheckInResolver;
    farCheckInResolver = null;
    if (typeof resolve === 'function') resolve(Boolean(confirmed));
  }

  function openFarCheckInDialog(checkInYmd) {
    return new Promise((resolve) => {
      farCheckInResolver = resolve;
      const dateLabel = fmtDay(checkInYmd, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeLabel = '2:00 PM';
      if (farCheckInCopy) {
        farCheckInCopy.textContent = t('wiz.farCheckInCopy', {
          date: dateLabel,
          time: timeLabel,
        });
      }
      if (farCheckInBack) farCheckInBack.hidden = false;
      if (farCheckInSheet) farCheckInSheet.hidden = false;
      farCheckInSheet?.querySelector('[data-wiz-far-checkin-yes]')?.focus();
    });
  }

  async function ensureFarCheckInConfirmed(checkInYmd = checkInEl?.value || '') {
    if (!isOneMonthOrMoreAhead(checkInYmd)) return true;
    if (farCheckInAck === checkInYmd) return true;
    const ok = await openFarCheckInDialog(checkInYmd);
    if (ok) farCheckInAck = checkInYmd;
    return ok;
  }

  function fmtDay(ymd, opts) {
    const ms = parseYmd(ymd);
    if (ms == null) return '';
    return new Date(ms).toLocaleDateString(uiLocale(), { timeZone: 'UTC', ...opts });
  }

  function money(n) {
    return `₱${Number(n || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function toManilaIso(dateStr, timeStr) {
    return `${String(dateStr || '').slice(0, 10)}T${String(timeStr || '00:00').slice(0, 5)}:00${PH_OFFSET}`;
  }

  function isValidPhone(phone) {
    const trimmed = (phone || '').trim();
    if (!trimmed) return false;
    const digits = trimmed.replace(/\D/g, '');
    return digits.length >= 7 && /^[+\d][\d\s\-().]*$/.test(trimmed);
  }

  function nights() {
    return nightsBetween(checkInEl?.value, checkOutEl?.value);
  }

  function cards() {
    return [...root.querySelectorAll('[data-wiz-card]')];
  }

  function setFieldError(name, message) {
    const wrap = document.querySelector(`[data-wiz-field="${name}"]`);
    const err = document.querySelector(`[data-wiz-error="${name}"]`);
    wrap?.classList.toggle('is-invalid', Boolean(message));
    if (err) err.textContent = message || '';
  }

  function clearDateErrors() {
    setFieldError('checkIn', '');
    setFieldError('checkOut', '');
  }

  function applyDateLimits() {
    const today = manilaToday();
    if (checkInEl) {
      checkInEl.min = today;
      if (checkInEl.value && checkInEl.value < today) checkInEl.value = '';
    }
    if (checkOutEl) {
      const minOut = checkInEl?.value || today;
      const next = parseYmd(minOut);
      const minCheckout = next == null
        ? today
        : new Date(next + 86400000).toISOString().slice(0, 10);
      checkOutEl.min = minCheckout;
      if (checkOutEl.value && checkOutEl.value <= (checkInEl?.value || '')) checkOutEl.value = '';
    }
  }

  function monthFromYmd(ymd) {
    const [y, m] = String(ymd || manilaToday()).split('-').map(Number);
    return { y, m };
  }

  function shiftMonth(month, delta) {
    const date = new Date(Date.UTC(month.y, month.m - 1 + delta, 1));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 };
  }

  function monthKey(month) {
    return `${month.y}-${String(month.m).padStart(2, '0')}`;
  }

  function monthTitle(month) {
    return new Date(Date.UTC(month.y, month.m - 1, 1)).toLocaleDateString(uiLocale(), {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    });
  }

  function weekdayHeads() {
    return Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(uiLocale(), {
        weekday: 'short',
        timeZone: 'UTC',
      })
    );
  }

  function fromNightly() {
    const prices = cards()
      .map((card) => Number(card.getAttribute('data-price') || 0))
      .filter((price) => price > 0);
    return prices.length ? Math.min(...prices) : 0;
  }

  function compactMoney(n) {
    return `₱${Math.round(Number(n || 0)).toLocaleString('en-PH')}`;
  }

  function tabDateLabel(ymd) {
    if (!ymd) return t('wiz.selectDate');
    return fmtDay(ymd, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function ensureCalMonth() {
    const seed = checkInEl?.value || manilaToday();
    const next = monthFromYmd(seed);
    const today = monthFromYmd(manilaToday());
    if (!calMonth) calMonth = next;
    const todayKey = monthKey(today);
    if (monthKey(calMonth) < todayKey) calMonth = today;
  }

  function setSearchTab(name, { pulse } = {}) {
    if (name === 'guests') {
      openStayEditor();
      return;
    }
    pickMode = name === 'out' ? 'out' : 'in';
    root.querySelectorAll('[data-wiz-search-tab]').forEach((tab) => {
      const key = tab.getAttribute('data-wiz-search-tab');
      if (key === 'guests') return;
      const on = key === pickMode;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncGuestNeed();
    if (pulse) pulseSearchTab(pickMode);
  }

  function pulseSearchTab(name) {
    const tab = root.querySelector(`[data-wiz-search-tab="${name}"]`);
    const face = tab?.querySelector('.wiz-search-tab-face');
    if (!face) return;
    face.classList.remove('is-pulse');
    void face.offsetWidth;
    face.classList.add('is-pulse');
    window.clearTimeout(tabPulseTimer);
    tabPulseTimer = window.setTimeout(() => face.classList.remove('is-pulse'), 420);
  }

  function catchGuestsTab() {
    const face = guestsTab?.querySelector('.wiz-search-tab-face');
    if (!guestsTab || !face) return;
    guestsTab.classList.remove('is-catch');
    face.classList.remove('is-catch');
    void face.offsetWidth;
    guestsTab.classList.add('is-catch');
    face.classList.add('is-catch');
    window.clearTimeout(tabPulseTimer);
    tabPulseTimer = window.setTimeout(() => {
      guestsTab.classList.remove('is-catch');
      face.classList.remove('is-catch');
    }, 480);
  }

  function paintSearchTabs() {
    const inLabel = root.querySelector('[data-wiz-tab-in]');
    const outLabel = root.querySelector('[data-wiz-tab-out]');
    if (inLabel) inLabel.textContent = tabDateLabel(checkInEl?.value);
    if (outLabel) outLabel.textContent = tabDateLabel(checkOutEl?.value);
    root.querySelectorAll('[data-wiz-search-tab]').forEach((tab) => {
      const key = tab.getAttribute('data-wiz-search-tab');
      if (key === 'guests') return;
      const on = key === pickMode;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncGuestNeed();
  }

  function paintCalSummary() {
    const sum = root.querySelector('[data-wiz-cal-sum]');
    if (sum) {
      const n = nights();
      const from = fromNightly();
      if (n > 0 && from > 0) {
        sum.textContent = tn('wiz.calSumFrom', 'wiz.calSumFromPlural', n, { price: money(from * n) });
      } else if (n > 0) {
        sum.textContent = tn('wiz.calSumNights', 'wiz.calSumNightsPlural', n);
      } else {
        sum.textContent = pickMode === 'out' && checkInEl?.value
          ? t('wiz.calSumPickOut')
          : t('wiz.calSumIdleShort');
      }
    }
    syncContinue();
  }

  function calDayClass(ymd, start, end) {
    const today = manilaToday();
    const classes = ['wiz-cal-day'];
    if (ymd < today) classes.push('is-past');
    if (ymd === today) classes.push('is-today');
    if (start && ymd === start) classes.push('is-start');
    if (end && ymd === end) classes.push('is-end');
    if (start && end && ymd > start && ymd < end) classes.push('is-range');
    return classes.join(' ');
  }

  function renderMonth(month, start, end, from) {
    const first = new Date(Date.UTC(month.y, month.m - 1, 1));
    const lead = first.getUTCDay();
    const count = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    const today = manilaToday();
    let cells = '';
    for (let i = 0; i < lead; i += 1) cells += '<span class="wiz-cal-pad" aria-hidden="true"></span>';
    for (let day = 1; day <= count; day += 1) {
      const ymd = `${month.y}-${String(month.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const disabled = ymd < today;
      const rate = from > 0 && !disabled ? `<span class="wiz-cal-rate">${compactMoney(from)}</span>` : '';
      const priceBit = from > 0 && !disabled ? t('wiz.fromPrice', { price: compactMoney(from) }) : '';
      cells += `<button type="button" class="${calDayClass(ymd, start, end)}" data-cal-ymd="${ymd}" ${disabled ? 'disabled' : ''} aria-label="${tabDateLabel(ymd)}${priceBit}">
        <span class="wiz-cal-num">${day}</span>${rate}
      </button>`;
    }
    const week = weekdayHeads().map((d) => `<span>${d}</span>`).join('');
    return `<section class="wiz-cal-month" aria-label="${monthTitle(month)}">
      <div class="wiz-cal-week" aria-hidden="true">${week}</div>
      <div class="wiz-cal-grid">${cells}</div>
    </section>`;
  }

  function paintCalendar() {
    const host = root.querySelector('[data-wiz-cal-months]');
    if (!host) return;
    ensureCalMonth();
    const start = checkInEl?.value || '';
    const end = checkOutEl?.value || '';
    const from = fromNightly();
    host.innerHTML = renderMonth(calMonth, start, end, from);
    const title = root.querySelector('[data-wiz-cal-title]');
    if (title) title.textContent = monthTitle(calMonth);
    const prev = root.querySelector('[data-wiz-cal-prev]');
    const todayMonth = monthFromYmd(manilaToday());
    if (prev) prev.disabled = monthKey(calMonth) <= monthKey(todayMonth);
    paintCalSummary();
  }

  function paintStaySearch() {
    paintSearchTabs();
    paintCalendar();
  }

  function selectStayDay(ymd) {
    if (!ymd || ymd < manilaToday()) return;
    if (pickMode === 'in' || !checkInEl.value) {
      checkInEl.value = ymd;
      if (farCheckInAck && farCheckInAck !== ymd) farCheckInAck = '';
      if (checkOutEl) checkOutEl.value = '';
      applyDateLimits();
      pulseSearchTab('in');
      pickMode = 'out';
    } else if (ymd <= checkInEl.value) {
      checkInEl.value = ymd;
      if (farCheckInAck && farCheckInAck !== ymd) farCheckInAck = '';
      checkOutEl.value = '';
      applyDateLimits();
      pulseSearchTab('in');
      pickMode = 'out';
    } else {
      checkOutEl.value = ymd;
      applyDateLimits();
      pulseSearchTab('out');
      pickMode = 'out';
    }
    clearDateErrors();
    refreshStayPricing();
  }

  function clearStayDates() {
    if (checkInEl) checkInEl.value = '';
    if (checkOutEl) checkOutEl.value = '';
    farCheckInAck = '';
    pickMode = 'in';
    calMonth = monthFromYmd(manilaToday());
    applyDateLimits();
    clearDateErrors();
    refreshStayPricing();
  }

  function shiftCalendar(delta) {
    ensureCalMonth();
    const next = shiftMonth(calMonth, delta);
    const todayMonth = monthFromYmd(manilaToday());
    if (monthKey(next) < monthKey(todayMonth)) return;
    calMonth = next;
    paintCalendar();
  }

  function ymdUtc(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function addNightsYmd(checkInYmd, count) {
    const start = parseYmd(checkInYmd);
    if (start == null) return '';
    return ymdUtc(start + Math.max(1, count) * 86400000);
  }

  function paintNights() {
    const n = nights();
    const on = n > 0;
    if (nightsEl) nightsEl.hidden = !on;
    nightsEl?.classList.toggle('is-on', on);
    if (nightsText && on) {
      nightsText.textContent = tn('wiz.nightsRange', 'wiz.nightsRangePlural', n, {
        start: fmtDay(checkInEl.value, { day: 'numeric', month: 'short' }),
        end: fmtDay(checkOutEl.value, { day: 'numeric', month: 'short' }),
      });
    }
    if (on && nightsEl && lastNightsShown !== n) replayAnim(nightsEl, 'is-on');
    lastNightsShown = n;
    if (stayChip) {
      stayChip.innerHTML = `${fmtDay(checkInEl.value, { day: 'numeric', month: 'short' })} → ${fmtDay(checkOutEl.value, {
        day: 'numeric',
        month: 'short',
      })} · <strong>${tn('wiz.nightsShort', 'wiz.nightsShortPlural', n)}</strong>`;
    }
    paintStaySummary();
    paintStaySearch();
  }

  function setStep(next) {
    step = next;
    root.querySelectorAll('[data-wiz-panel]').forEach((panel) => {
      const n = Number(panel.getAttribute('data-wiz-panel'));
      const on = n === step;
      panel.hidden = !on;
      panel.classList.toggle('is-in', on);
    });
    root.querySelectorAll('[data-wiz-step-node]').forEach((node) => {
      const n = Number(node.getAttribute('data-wiz-step-node'));
      const done = n < step;
      node.classList.toggle('is-active', n === step);
      node.classList.toggle('is-done', done);
      node.setAttribute('tabindex', done ? '0' : '-1');
      node.setAttribute('aria-current', n === step ? 'step' : 'false');
      if (done) node.setAttribute('aria-label', t('wiz.backToStep', { label: node.querySelector('.wiz-step-label')?.textContent || t('wiz.previousStep') }));
      else node.removeAttribute('aria-label');
      const dot = node.querySelector('[data-wiz-step-dot]');
      if (dot) dot.innerHTML = done ? CHECK_SVG : String(n);
    });
    if (step === 2) paintRooms();
    persistWizDraft();
  }

  function stayHeads(room) {
    return (Number(room?.adults) || 0) + (Number(room?.children) || 0);
  }

  function normalizeStayRoom(room) {
    const next = room || {};
    let adults = Number(next.adults);
    let children = Number(next.children);
    if (!Number.isFinite(adults) || adults < 1) {
      const guests = Number(next.guests);
      adults = Number.isFinite(guests) ? Math.max(1, Math.min(MAX_GUESTS_PER_ROOM, guests)) : 2;
      if (!Number.isFinite(children) || children < 0) children = 0;
    }
    children = Math.max(0, Number.isFinite(children) ? children : 0);
    adults = Math.max(1, adults);
    if (adults + children > MAX_GUESTS_PER_ROOM) {
      children = Math.max(0, MAX_GUESTS_PER_ROOM - adults);
    }
    const ages = Array.isArray(next.childAges) ? next.childAges.slice(0, children) : [];
    while (ages.length < children) ages.push('');
    return {
      adults,
      children,
      childAges: ages,
      roomTypeId: next.roomTypeId ?? null,
      guests: adults + children,
    };
  }

  function childAgeOptions(selected) {
    let html = `<option value="">${t('wiz.selectAge')}</option>`;
    for (let age = 0; age <= MAX_CHILD_AGE; age += 1) {
      const label = age === 0 ? t('wiz.under1') : tn('wiz.yearOld', 'wiz.yearsOld', age);
      const isSelected = selected !== '' && selected !== null && selected !== undefined && Number(selected) === age;
      html += `<option value="${age}"${isSelected ? ' selected' : ''}>${label}</option>`;
    }
    return html;
  }

  function guestTotal() {
    return stayRooms.reduce((sum, room) => sum + stayHeads(room), 0);
  }

  function extraPersons() {
    return stayRooms.filter((room) => stayHeads(room) > INCLUDED_PER_ROOM).length;
  }

  function childAgeIsSet(value) {
    if (value === '' || value === null || value === undefined) return false;
    const age = Number(value);
    return Number.isFinite(age) && age >= 0 && age <= MAX_CHILD_AGE;
  }

  function missingChildAgeSlots() {
    const missing = [];
    stayRooms.forEach((room, roomIndex) => {
      const children = Number(room.children) || 0;
      for (let childIndex = 0; childIndex < children; childIndex += 1) {
        if (!childAgeIsSet(room.childAges?.[childIndex])) {
          missing.push({ roomIndex, childIndex });
        }
      }
    });
    return missing;
  }

  function childAgesComplete() {
    return missingChildAgeSlots().length === 0;
  }

  function childAgesMessage() {
    const rooms = [...new Set(missingChildAgeSlots().map((slot) => slot.roomIndex + 1))];
    if (!rooms.length) return '';
    if (rooms.length === 1) return t('wiz.childAgeRoom', { n: rooms[0] });
    return t('wiz.selectChildAges');
  }

  function focusFirstMissingChildAge() {
    stayRoomsEl?.querySelector('.wiz-stay-age.is-invalid select')?.focus();
  }

  function occupancyReady() {
    return occupancyConfirmed && guestTotal() >= 1 && childAgesComplete();
  }

  function syncContinue() {
    const btn = root.querySelector('[data-wiz-next="1"]');
    if (!btn) return;
    const blocked = nights() < 1;
    btn.disabled = blocked;
    btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }

  function stayEditorOpen() {
    return Boolean(staySheet && !staySheet.hidden);
  }

  function syncGuestNeed() {
    const need = !occupancyConfirmed;
    guestsTab?.classList.toggle('is-need', need);
    guestsTab?.classList.toggle('is-on', stayEditorOpen());
    guestsTab?.setAttribute('aria-expanded', stayEditorOpen() ? 'true' : 'false');
  }

  function openStayEditor({ prompt } = {}) {
    lastFocus = document.activeElement;
    stayPromptActive = Boolean(prompt);
    paintStayRooms();
    if (stayBack) stayBack.hidden = false;
    if (staySheet) staySheet.hidden = false;
    document.body.classList.add('wiz-lock');
    syncGuestNeed();
    staySheet?.querySelector('#wizStayTitle')?.focus();
  }

  function pageChromeReady() {
    const loader = document.getElementById('guestPageLoader');
    const loaderBusy = loader && !loader.hidden && loader.getAttribute('aria-hidden') !== 'true';
    return !loaderBusy && !document.body.classList.contains('guest-lang-popup-open');
  }

  function maybeOpenGuestsOnArrive(attempt = 0) {
    if (occupancyConfirmed || stayEditorOpen() || step !== 1) return;
    if (!pageChromeReady() && attempt < 40) {
      window.setTimeout(() => maybeOpenGuestsOnArrive(attempt + 1), 150);
      return;
    }
    openStayEditor();
  }

  function closeStayEditor() {
    stayPromptActive = false;
    clearStayAlert();
    if (staySheet) staySheet.hidden = true;
    if (stayBack) stayBack.hidden = true;
    if (!drawer || drawer.hidden) document.body.classList.remove('wiz-lock');
    syncGuestNeed();
    lastFocus?.focus?.();
  }

  function tryCloseStayEditor() {
    if (!childAgesComplete()) {
      occupancyConfirmed = false;
      stayPromptActive = false;
      paintStaySummary();
      syncStayAgeUi();
      focusFirstMissingChildAge();
      return;
    }
    closeStayEditor();
  }

  function confirmStayOccupancy() {
    if (!childAgesComplete()) {
      stayPromptActive = false;
      syncStayAgeUi();
      focusFirstMissingChildAge();
      return;
    }
    lastFocus = guestsTab;
    occupancyConfirmed = true;
    paintStaySummary();
    closeStayEditor();
    catchGuestsTab();
    persistWizDraft();
  }

  function syncStayAgeUi() {
    const message = childAgesMessage();
    if (message) showStayAlert(message);
    else if (stayPromptActive) showStayAlert(fillFirst(), { tone: 'need' });
    else clearStayAlert();
    stayRoomsEl?.querySelectorAll('[data-wiz-child-age]').forEach((select) => {
      const roomIndex = Number(select.getAttribute('data-wiz-child-age'));
      const childIndex = Number(select.getAttribute('data-wiz-child-index'));
      const invalid = !childAgeIsSet(stayRooms[roomIndex]?.childAges?.[childIndex]);
      select.required = true;
      select.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      select.closest('.wiz-stay-age')?.classList.toggle('is-invalid', invalid);
    });
    syncContinue();
  }

  function paintStaySummary() {
    const adults = stayRooms.reduce((sum, room) => sum + (Number(room.adults) || 0), 0);
    const children = stayRooms.reduce((sum, room) => sum + (Number(room.children) || 0), 0);
    if (!stayHeadsEl) return;
    if (!occupancyConfirmed) {
      stayHeadsEl.textContent = t('wiz.addDetails');
      return;
    }
    const childBit = children
      ? (children === 1 ? t('wiz.childrenCount', { n: children }) : t('wiz.childrenCountPlural', { n: children }))
      : '';
    stayHeadsEl.textContent = `${tn('wiz.adultsCount', 'wiz.adultsCountPlural', adults)}${childBit}`;
  }

  /** Extra guest (3rd person) is a ₱200 fee on any room that already sleeps the 2 included guests. */
  function guestsFitOccupancy(occupancy, guests) {
    const cap = Number(occupancy || 0);
    const party = Number(guests || 0);
    if (party <= INCLUDED_PER_ROOM) return cap >= party;
    return cap >= INCLUDED_PER_ROOM;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function isGoogleGuest() {
    return root.getAttribute('data-google-guest') === 'true';
  }

  function isGoogleLoginEnabled() {
    return root.getAttribute('data-google-login') === 'true';
  }

  function offerKind(offer) {
    return String(offer?.kind || '');
  }

  function isRateKind(kind) {
    return kind === 'LimitedTime' || kind === 'StayLongerSaveMore';
  }

  function offerEligibleForNights(offer, stayNights) {
    if (!offer || offer.promoPricePerNight == null || !(Number(offer.promoPricePerNight) > 0)) {
      return false;
    }
    const kind = offerKind(offer);
    if (kind === 'LimitedTime') return true;
    if (kind === 'StayLongerSaveMore') {
      const min = Number(offer.minNights || 0);
      return min >= 2 && stayNights >= min;
    }
    return false;
  }

  function offersForType(roomTypeId) {
    return (specialOffers || []).filter((offer) => Number(offer.roomTypeId) === Number(roomTypeId));
  }

  function offerById(offerId) {
    return (specialOffers || []).find((offer) => Number(offer.id) === Number(offerId)) || null;
  }

  function eligibleRateOffer(roomTypeId) {
    const stayNights = Math.max(1, nights());
    return offersForType(roomTypeId)
      .filter((offer) => isRateKind(offerKind(offer)) && offerEligibleForNights(offer, stayNights))
      .slice()
      .sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight))[0] || null;
  }

  function selectedOfferForType(roomTypeId) {
    const forcedId = forcedOfferByType.get(Number(roomTypeId));
    if (forcedId) {
      const forced = offerById(forcedId);
      if (forced && offerEligibleForNights(forced, Math.max(1, nights()))) return forced;
      forcedOfferByType.delete(Number(roomTypeId));
    }
    return eligibleRateOffer(roomTypeId);
  }

  function limitedOfferForType(roomTypeId) {
    return offersForType(roomTypeId)
      .filter((offer) => offerKind(offer) === 'LimitedTime' && Number(offer.promoPricePerNight) > 0)
      .slice()
      .sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight))[0] || null;
  }

  function stayLongerOffersForType(roomTypeId) {
    return offersForType(roomTypeId)
      .filter((offer) => offerKind(offer) === 'StayLongerSaveMore' && Number(offer.promoPricePerNight) > 0)
      .slice()
      .sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight));
  }

  function canBookStandardRate(roomTypeId) {
    if (limitedOfferForType(roomTypeId)) return false;
    const stayOffers = stayLongerOffersForType(roomTypeId);
    if (!stayOffers.length) return false;
    return !stayOffers.some((offer) => offerEligibleForNights(offer, nights()));
  }

  function loyaltyOfferPreviewForType(roomTypeId) {
    return offersForType(roomTypeId).find((offer) => offerKind(offer) === 'GoogleLoyalty') || null;
  }

  function loyaltyOfferForType(roomTypeId) {
    if (!isGoogleGuest()) return null;
    return loyaltyOfferPreviewForType(roomTypeId);
  }

  function discountPercent(regular, promo) {
    const r = Number(regular || 0);
    const p = Number(promo || 0);
    if (!(r > p) || !(p > 0)) return 0;
    return Math.max(1, Math.round((1 - p / r) * 100));
  }

  function listPriceOf(card) {
    return Number(card.getAttribute('data-price') || 0);
  }

  function nightlyForType(roomTypeId, listPrice) {
    const offer = selectedOfferForType(roomTypeId);
    if (offer && Number(offer.promoPricePerNight) > 0) return Number(offer.promoPricePerNight);
    return Number(listPrice || 0);
  }

  function loyaltyUnits(mode, stayNights) {
    const n = Math.max(1, Number(stayNights) || 1);
    if (mode === 'FirstNight') return 1;
    if (mode === 'WeeklyReset') return Math.floor((n + 6) / 7);
    return n;
  }

  function loyaltyAmount(offer) {
    if (!offer) return 0;
    if (offer.discountAmount != null && Number(offer.discountAmount) > 0) {
      return Number(offer.discountAmount);
    }
    const regular = Number(offer.regularPricePerNight || 0);
    const promo = Number(offer.promoPricePerNight || 0);
    return regular > promo ? regular - promo : 0;
  }

  function lineLoyaltyDeduct(line, stayNights, requireSignIn = true) {
    const offer = requireSignIn
      ? loyaltyOfferForType(line.roomTypeId)
      : loyaltyOfferPreviewForType(line.roomTypeId);
    const unit = loyaltyAmount(offer);
    if (!(unit > 0)) return 0;
    const units = loyaltyUnits(offer.loyaltyApplyMode, stayNights);
    const deduct = unit * units * Number(line.qty || 1);
    const stayLine = Number(line.price) * Math.max(1, stayNights) * Number(line.qty || 1);
    return Math.min(deduct, stayLine);
  }

  function loyaltyTotal() {
    return cart.reduce((sum, line) => sum + lineLoyaltyDeduct(line, nights()), 0);
  }

  function loyaltyPreviewTotal() {
    return cart.reduce((sum, line) => sum + lineLoyaltyDeduct(line, nights(), false), 0);
  }

  function signupPayMarkup({ amount, variant, applied }) {
    const cls = `wiz-signup-pay wiz-signup-pay--${variant}${applied ? ' is-applied' : ''}`;
    const label = applied ? t('wiz.memberPrice', { price: money(amount) }) : t('wiz.signUpPay', { price: money(amount) });
    const inner = applied
      ? `${SIGNUP_STAR}<span>${label}</span>`
      : `${SIGNUP_STAR}<span>${label}</span>${SIGNUP_CHEVRON}`;
    if (applied) {
      return `<p class="${cls}">${inner}</p>`;
    }
    return `<button type="button" class="${cls}" data-wiz-signup-pay>${inner}</button>`;
  }

  function signupPayNightlyHtml(roomTypeId, nightly) {
    if (!isGoogleLoginEnabled() && !isGoogleGuest()) return '';
    const unit = loyaltyAmount(loyaltyOfferPreviewForType(roomTypeId));
    if (!(unit > 0)) return '';
    const member = Math.max(0, Number(nightly) - unit);
    if (!(member < Number(nightly))) return '';
    return signupPayMarkup({ amount: member, variant: 'line', applied: isGoogleGuest() });
  }

  function signupPayStayHtml(variant) {
    if (isGoogleGuest() || !isGoogleLoginEnabled()) return '';
    const preview = loyaltyPreviewTotal();
    if (!(preview > 0)) return '';
    const member = Math.max(0, roomsTotal() + extraCost() - preview);
    return signupPayMarkup({ amount: member, variant, applied: false });
  }

  function startGoogleSignup() {
    persistWizDraft();
    const form = document.getElementById('wizGoogleLoginForm');
    if (!form) return;
    form.submit();
  }

  function cartHasRateOffer() {
    return cart.some((line) => Boolean(selectedOfferForType(line.roomTypeId)));
  }

  function selectedRateOffer() {
    const offers = cart
      .map((line) => selectedOfferForType(line.roomTypeId))
      .filter(Boolean);
    if (!offers.length) return null;
    const stay = offers.find((offer) => offerKind(offer) === 'StayLongerSaveMore');
    return stay || offers.slice().sort((a, b) => Number(a.promoPricePerNight) - Number(b.promoPricePerNight))[0];
  }

  function offerForcesCash(offer) {
    const kind = offerKind(offer);
    return kind === 'LimitedTime' || kind === 'StayLongerSaveMore' || Boolean(offer?.cashOnly);
  }

  function hoursUntilCheckIn() {
    const iso = toManilaIso(checkInEl?.value, CHECKIN_TIME);
    const start = Date.parse(iso);
    if (!Number.isFinite(start)) return 0;
    return (start - Date.now()) / 36e5;
  }

  function isReservationLead() {
    return hoursUntilCheckIn() > MIN_LEAD_HOURS;
  }

  async function loadOffers() {
    try {
      const response = await fetch('/api/special-offers/active', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      specialOffers = Array.isArray(payload) ? payload : [];
      if (step === 2) paintRooms();
      if (drawer && !drawer.hidden) paintDrawer();
    } catch {
      specialOffers = [];
    }
  }

  function neededRooms() {
    return stayRooms.length;
  }

  function assignedCount() {
    return stayRooms.filter((room) => room.roomTypeId).length;
  }

  function stayComplete() {
    return neededRooms() > 0 && assignedCount() === neededRooms();
  }

  function roomsStillNeeded() {
    return Math.max(0, neededRooms() - assignedCount());
  }

  function roomsNeededMessage() {
    const still = roomsStillNeeded();
    const need = neededRooms();
    const have = assignedCount();
    if (still <= 0) return '';
    if (have < 1) {
      return `Select ${need} room${need === 1 ? '' : 's'} for your stay before continuing.`;
    }
    return `You still need ${still} more room${still === 1 ? '' : 's'}. Add ${still === 1 ? 'another room' : 'them'} to your booking to continue.`;
  }

  function syncNeedRoomsNotice(showToast) {
    const message = roomsNeededMessage();
    const drawerAlert = document.querySelector('[data-wiz-drawer-rooms-alert]');
    if (drawerAlert) {
      drawerAlert.hidden = !message;
      drawerAlert.textContent = message;
    }
    const enterBtn = document.querySelector('[data-wiz-enter-details]');
    if (enterBtn) {
      enterBtn.setAttribute('aria-describedby', message ? 'wizNeedRoomsAlert' : '');
    }
    if (showToast && message) showToast(message, { alert: true, holdMs: 3600 });
  }

  function typeName(id) {
    const card = cards().find((el) => Number(el.getAttribute('data-room-type-id')) === Number(id));
    return card?.getAttribute('data-room-type') || '';
  }

  function occupancyOf(id) {
    const card = cards().find((el) => Number(el.getAttribute('data-room-type-id')) === Number(id));
    return Number(card?.getAttribute('data-occupancy') || 0);
  }

  function usedOfType(id) {
    return stayRooms.filter((room) => Number(room.roomTypeId) === Number(id)).length;
  }

  function canAssign(card) {
    const occupancy = Number(card.getAttribute('data-occupancy') || 0);
    const id = Number(card.getAttribute('data-room-type-id'));
    const available = Number(card.getAttribute('data-available') || 0);
    if (usedOfType(id) >= available) return false;
    return stayRooms.some((room) => !room.roomTypeId && guestsFitOccupancy(occupancy, room.guests));
  }

  function rebuildCartFromAssignments() {
    const byType = new Map();
    stayRooms.forEach((slot) => {
      if (!slot.roomTypeId) return;
      const card = cards().find((el) => Number(el.getAttribute('data-room-type-id')) === slot.roomTypeId);
      if (!card) {
        slot.roomTypeId = null;
        return;
      }
      const data = cardData(card);
      const existing = byType.get(slot.roomTypeId);
      if (existing) existing.qty += 1;
      else byType.set(slot.roomTypeId, { ...data, qty: 1 });
    });
    cart = [...byType.values()];
  }

  function clearStayAlert() {
    if (stayAlert) {
      stayAlert.hidden = true;
      stayAlert.textContent = '';
      stayAlert.classList.remove('is-need');
    }
  }

  function showStayAlert(message, options = {}) {
    if (!stayAlert) return;
    stayAlert.hidden = !message;
    stayAlert.textContent = message || '';
    stayAlert.classList.toggle('is-need', Boolean(message) && options.tone === 'need');
  }

  function showRoomsAlert(message) {
    if (!roomsAlert) return;
    roomsAlert.hidden = !message;
    roomsAlert.textContent = message || '';
  }

  function dropUnfitAssignments() {
    stayRooms.forEach((slot) => {
      if (!slot.roomTypeId) return;
      if (!guestsFitOccupancy(occupancyOf(slot.roomTypeId), slot.guests)) slot.roomTypeId = null;
    });
    rebuildCartFromAssignments();
  }

  function setStayParty(index, kind, delta) {
    const room = stayRooms[index];
    if (!room) return;
    const next = normalizeStayRoom(room);
    if (kind === 'children') {
      const children = next.children + delta;
      if (children < 0 || next.adults + children > MAX_GUESTS_PER_ROOM) return;
      next.children = children;
      if (delta > 0) next.childAges.push('');
      else next.childAges.pop();
    } else {
      const adults = next.adults + delta;
      if (adults < 1 || adults + next.children > MAX_GUESTS_PER_ROOM) return;
      next.adults = adults;
    }
    stayRooms[index] = normalizeStayRoom(next);
    dropUnfitAssignments();
    paintStayRooms();
    if (kind === 'children' && delta > 0) focusFirstMissingChildAge();
    if (step === 2) paintRooms();
  }

  function setStayChildAge(index, childIndex, value) {
    const room = stayRooms[index];
    if (!room || !Array.isArray(room.childAges) || childIndex < 0 || childIndex >= room.childAges.length) return;
    room.childAges[childIndex] = value === '' ? '' : Number(value);
    syncStayAgeUi();
  }

  function addStayRoom() {
    if (stayRooms.length >= MAX_ROOMS) {
      showStayAlert(`You can book up to ${MAX_ROOMS} rooms.`);
      return;
    }
    stayRooms.push(normalizeStayRoom({ adults: 2, children: 0 }));
    clearStayAlert();
    paintStayRooms();
    if (step === 2) paintRooms();
  }

  function removeStayRoom(index) {
    if (stayRooms.length <= 1 || index < 1) return;
    stayRooms.splice(index, 1);
    rebuildCartFromAssignments();
    paintStayRooms();
    if (step === 2) paintRooms();
  }

  function applyPreset(name) {
    const presets = {
      solo: [{ adults: 1, children: 0 }],
      couple: [{ adults: 2, children: 0 }],
      group: [{ adults: 3, children: 0 }],
      family: [
        { adults: 2, children: 0 },
        { adults: 2, children: 0 },
      ],
    };
    stayRooms = (presets[name] || presets.couple).map((room) => normalizeStayRoom(room));
    rebuildCartFromAssignments();
    paintStayRooms();
    if (step === 2) paintRooms();
  }

  function paintStayRooms() {
    if (!stayRoomsEl) return;
    stayRoomsEl.innerHTML = stayRooms
      .map((room, index) => {
        const heads = stayHeads(room);
        const extra = heads > INCLUDED_PER_ROOM;
        const canInc = heads < MAX_GUESTS_PER_ROOM;
        const remove =
          index === 0
            ? ''
            : `<button type="button" class="wiz-link-remove" data-wiz-remove-stay="${index}" aria-label="${escapeHtml(t('wiz.removeRoomAria', { n: index + 1 }))}">${REMOVE_SVG}<span>${t('wiz.removeRoom')}</span></button>`;
        const note = extra
          ? `<p class="wiz-stay-room-note">${t('wiz.extraGuestFee', { fee: EXTRA_FEE })}</p>`
          : `<p class="wiz-stay-room-note is-base">${t('wiz.twoIncluded')}</p>`;
        const ages = room.children > 0
          ? `<div class="wiz-stay-ages">
              ${Array.from({ length: room.children }, (_, childIndex) => `
                <label class="wiz-stay-age">
                  <span>${t('wiz.childAge', { n: childIndex + 1 })} <span class="wiz-req">*</span></span>
                  <select required aria-required="true" data-wiz-child-age="${index}" data-wiz-child-index="${childIndex}">
                    ${childAgeOptions(room.childAges[childIndex])}
                  </select>
                </label>`).join('')}
            </div>`
          : '';
        return `<article class="wiz-stay-room${extra ? ' is-extra' : ''}">
          <div class="wiz-stay-room-head">
            <div>
              <h3>${t('wiz.roomN', { n: index + 1 })}</h3>
              ${note}
            </div>
            ${remove}
          </div>
          <div class="wiz-stay-counters">
            <div class="wiz-stay-counter">
              <span>${t('wiz.adults')}</span>
              <div class="wiz-stay-stepper">
                <button type="button" class="wiz-stay-stepper-btn" data-wiz-stay-kind="adults" data-wiz-stay-delta="-1" data-wiz-stay-index="${index}" aria-label="${escapeHtml(t('wiz.fewerAdults', { n: index + 1 }))}" ${room.adults <= 1 ? 'disabled' : ''}>−</button>
                <strong aria-live="polite">${room.adults}</strong>
                <button type="button" class="wiz-stay-stepper-btn" data-wiz-stay-kind="adults" data-wiz-stay-delta="1" data-wiz-stay-index="${index}" aria-label="${escapeHtml(t('wiz.moreAdults', { n: index + 1 }))}" ${canInc ? '' : 'disabled'}>+</button>
              </div>
            </div>
            <div class="wiz-stay-counter">
              <span>${t('wiz.children')}</span>
              <div class="wiz-stay-stepper">
                <button type="button" class="wiz-stay-stepper-btn" data-wiz-stay-kind="children" data-wiz-stay-delta="-1" data-wiz-stay-index="${index}" aria-label="${escapeHtml(t('wiz.fewerChildren', { n: index + 1 }))}" ${room.children <= 0 ? 'disabled' : ''}>−</button>
                <strong aria-live="polite">${room.children}</strong>
                <button type="button" class="wiz-stay-stepper-btn" data-wiz-stay-kind="children" data-wiz-stay-delta="1" data-wiz-stay-index="${index}" aria-label="${escapeHtml(t('wiz.moreChildren', { n: index + 1 }))}" ${canInc ? '' : 'disabled'}>+</button>
              </div>
            </div>
          </div>
          ${ages}
        </article>`;
      })
      .join('');
    if (addRoomBtn) addRoomBtn.disabled = stayRooms.length >= MAX_ROOMS;
    staySheet?.querySelectorAll('[data-wiz-preset]').forEach((pill) => {
      const name = pill.getAttribute('data-wiz-preset');
      const on =
        (name === 'solo' && stayRooms.length === 1 && stayHeads(stayRooms[0]) === 1)
        || (name === 'couple' && stayRooms.length === 1 && stayRooms[0].adults === 2 && stayRooms[0].children === 0)
        || (name === 'group' && stayRooms.length === 1 && stayHeads(stayRooms[0]) === 3)
        || (name === 'family' && stayRooms.length === 2 && stayRooms.every((room) => stayHeads(room) === 2));
      pill.classList.toggle('is-on', on);
    });
    paintNights();
    paintStaySummary();
    syncStayAgeUi();
  }

  function pruneCart() {
    dropUnfitAssignments();
  }

  function lineTotal(line) {
    return Number(line.price) * nights() * line.qty;
  }

  function roomsTotal() {
    return cart.reduce((sum, line) => sum + lineTotal(line), 0);
  }

  function extraCost() {
    return extraPersons() * EXTRA_FEE * nights();
  }

  function grandTotal() {
    return Math.max(0, roomsTotal() + extraCost() - loyaltyTotal());
  }

  function paintCartChrome() {
    const count = assignedCount();
    const need = neededRooms();
    if (cartBadge) {
      cartBadge.textContent = String(count);
      cartBadge.hidden = count < 1;
      cartBadge.classList.toggle('is-on', count > 0);
    }
    if (cartNav) {
      cartNav.setAttribute('aria-label', t('wiz.cartNavAria', { count, need }));
    }
    if (sticky) {
      const on = step === 2;
      sticky.hidden = !on;
      sticky.classList.toggle('is-on', on);
      const text = sticky.querySelector('[data-wiz-sticky-text]');
      if (text) {
        text.textContent = tn('wiz.stickyRooms', 'wiz.stickyRoomsPlural', need, { count, need, total: money(grandTotal()) });
      }
      const review = sticky.querySelector('[data-wiz-review]');
      if (review) {
        const ready = stayComplete();
        review.disabled = !ready;
        review.classList.toggle('is-next', ready);
        const label = review.querySelector('[data-wiz-review-label]');
        if (label) label.textContent = ready ? t('wiz.reviewBook') : t('wiz.selectMore', { n: Math.max(0, need - count) });
      }
    }
    cards().forEach((card) => {
      const id = Number(card.getAttribute('data-room-type-id'));
      const qty = usedOfType(id);
      card.classList.toggle('is-in', qty > 0);
      let mark = card.querySelector('.wiz-card-qty');
      if (qty > 0) {
        if (!mark) {
          mark = document.createElement('span');
          mark.className = 'wiz-card-qty';
          card.querySelector('.wiz-card-media')?.append(mark);
        }
        mark.textContent = t('wiz.qtySelected', { n: qty });
        mark.hidden = false;
      } else if (mark) {
        mark.hidden = true;
      }
      const btn = card.querySelector('[data-wiz-toggle]');
      if (!btn || btn.hasAttribute('data-sold')) return;
      const addable = canAssign(card);
      btn.disabled = !addable && qty < 1;
      btn.classList.toggle('wiz-btn-primary', addable || qty < 1);
      btn.classList.toggle('wiz-btn-remove', qty > 0 && !addable);
      if (addable) {
        btn.innerHTML = qty
          ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> ${t('wiz.addAnother')}`
          : `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> ${t('wiz.addToBooking')}`;
      } else if (qty > 0) {
        btn.innerHTML = `${REMOVE_SVG}<span>${t('wiz.remove')}</span>`;
      } else {
        btn.innerHTML = t('wiz.addToBooking');
      }
    });
  }

  function paintRooms() {
    const n = nights();
    const all = cards();
    const openSlots = stayRooms.filter((room) => !room.roomTypeId);
    all.forEach((card) => {
      const occupancy = Number(card.getAttribute('data-occupancy') || 0);
      const id = Number(card.getAttribute('data-room-type-id'));
      const remainingFit = openSlots.length
        ? openSlots.some((slot) => guestsFitOccupancy(occupancy, slot.guests))
        : stayRooms.some((slot) => guestsFitOccupancy(occupancy, slot.guests));
      const alreadyIn = usedOfType(id) > 0;
      card.hidden = false;
      card.classList.toggle('is-tight', !remainingFit && !alreadyIn);
      const listPrice = listPriceOf(card);
      const sell = nightlyForType(id, listPrice);
      const offer = eligibleRateOffer(id) || limitedOfferForType(id);
      const showCompare = Boolean(offer && Number(offer.regularPricePerNight || listPrice) > sell);
      const pct = showCompare ? discountPercent(offer.regularPricePerNight || listPrice, sell) : 0;
      const totalEl = card.querySelector('[data-wiz-est-total]');
      const labelEl = card.querySelector('[data-wiz-est-label]');
      const nightEl = card.querySelector('[data-wiz-est-night]');
      const wasEl = card.querySelector('[data-wiz-est-was]');
      const flag = card.querySelector('[data-wiz-offer-flag]');
      const offerNote = card.querySelector('[data-wiz-card-offer]');
      if (totalEl) {
        totalEl.textContent = money(sell * Math.max(n, 1));
        totalEl.classList.toggle('is-promo', Boolean(selectedOfferForType(id)));
      }
      if (labelEl) labelEl.textContent = tn('wiz.estTotalNights', 'wiz.estTotalNightsPlural', n);
      if (nightEl) {
        nightEl.textContent = money(sell);
        nightEl.classList.toggle('is-promo', Boolean(selectedOfferForType(id)));
      }
      if (wasEl) {
        const showWas = showCompare && Number(offer.regularPricePerNight || listPrice) > sell;
        wasEl.hidden = !showWas;
        if (showWas) wasEl.textContent = money(offer.regularPricePerNight || listPrice);
      }
      if (flag) {
        const limited = limitedOfferForType(id);
        const stayOffers = stayLongerOffersForType(id);
        if (limited) {
          flag.hidden = false;
          flag.textContent = pct > 0 ? `−${pct}%` : t('wiz.offer');
        } else if (stayOffers.length) {
          flag.hidden = false;
          flag.textContent = t('wiz.stayLongerShort');
        } else {
          flag.hidden = true;
        }
      }
      if (offerNote) {
        const limited = limitedOfferForType(id);
        const stayOffers = stayLongerOffersForType(id);
        const applied = selectedOfferForType(id);
        if (limited) {
          const promo = Number(limited.promoPricePerNight);
          offerNote.hidden = false;
          offerNote.textContent = t('wiz.offerNightCash', { title: limited.title || t('wiz.limitedTimeShort'), price: money(promo) });
        } else if (applied && offerKind(applied) === 'StayLongerSaveMore') {
          offerNote.hidden = false;
          offerNote.textContent = t('wiz.offerNight', { title: applied.title || t('wiz.stayLongerShort'), price: money(applied.promoPricePerNight) });
        } else if (stayOffers.length) {
          const stay = stayOffers[0];
          offerNote.hidden = false;
          offerNote.textContent = t('wiz.stayLongerFrom', { title: stay.title || t('wiz.stayLongerShort'), n: Number(stay.minNights || 0) });
        } else {
          offerNote.hidden = true;
          offerNote.textContent = '';
        }
      }
    });
    const title = root.querySelector('[data-wiz-rooms-title]');
    if (title) title.textContent = tn('wiz.chooseRoomsTitle', 'wiz.chooseRoomsTitlePlural', neededRooms());
    const lede = root.querySelector('[data-wiz-rooms-lede]');
    if (lede) {
      const next = stayRooms.find((room) => !room.roomTypeId);
      const nextBit = next
        ? tn('wiz.roomsLedeNext', 'wiz.roomsLedeNextPlural', next.guests, { n: stayRooms.indexOf(next) + 1, guests: next.guests })
          + (next.guests > INCLUDED_PER_ROOM ? t('wiz.roomsLedeNextExtra') : '')
        : t('wiz.roomsLedeAll');
      lede.textContent = t('wiz.roomsLedeCount', { assigned: assignedCount(), needed: neededRooms() }) + nextBit;
    }
    const slots = root.querySelector('[data-wiz-slots]');
    if (slots) {
      slots.hidden = false;
      slots.innerHTML = stayRooms
        .map((room, index) => {
          const chosen = room.roomTypeId ? typeName(room.roomTypeId) : t('wiz.notSelected');
          const offer = room.roomTypeId
            ? eligibleRateOffer(room.roomTypeId) || limitedOfferForType(room.roomTypeId)
            : null;
          const offerBit = offer ? ` · ${offerKind(offer) === 'StayLongerSaveMore' ? t('wiz.stayLongerShort') : t('wiz.offer')}` : '';
          return `<li><strong>${tn('wiz.slotGuests', 'wiz.slotGuestsPlural', room.guests, { n: index + 1, guests: room.guests })}</strong><span>${chosen}${offerBit}</span></li>`;
        })
        .join('');
    }
    const empty = root.querySelector('[data-wiz-empty]');
    if (empty) empty.hidden = all.length > 0;
    const datesChip = root.querySelector('[data-wiz-chip-dates]');
    const guestsChip = root.querySelector('[data-wiz-chip-guests]');
    if (datesChip) {
      datesChip.textContent = `${fmtDay(checkInEl.value, { day: 'numeric', month: 'short' })} → ${fmtDay(checkOutEl.value, {
        day: 'numeric',
        month: 'short',
      })} · ${tn('wiz.nightsShort', 'wiz.nightsShortPlural', n)}`;
    }
    if (guestsChip) guestsChip.textContent = guestsRoomsLabel(guestTotal(), neededRooms());
    paintCartChrome();
  }

  function cardData(card) {
    const listPrice = listPriceOf(card);
    const roomTypeId = Number(card.getAttribute('data-room-type-id'));
    const offer = selectedOfferForType(roomTypeId);
    return {
      roomTypeId,
      name: card.getAttribute('data-room-type') || '',
      listPrice,
      price: nightlyForType(roomTypeId, listPrice),
      offerId: offer ? Number(offer.id) : null,
      occupancy: Number(card.getAttribute('data-occupancy') || 0),
      beds: Number(card.getAttribute('data-beds') || 0),
      available: Number(card.getAttribute('data-available') || 0),
      image: card.querySelector('.wiz-card-media img')?.getAttribute('src') || '',
      qty: 1,
    };
  }

  function toggleCart(card, options) {
    const skipReveal = Boolean(options?.skipReveal);
    const skipFeedback = Boolean(options?.skipFeedback);
    const id = Number(card.getAttribute('data-room-type-id'));
    const occupancy = Number(card.getAttribute('data-occupancy') || 0);
    showRoomsAlert('');
    const hasOffer = Boolean(limitedOfferForType(id) || stayLongerOffersForType(id).length);
    if (!skipReveal && canAssign(card) && hasOffer) {
      openOffer(card);
      return;
    }
    let added = false;
    if (canAssign(card)) {
      const slot = stayRooms
        .filter((room) => !room.roomTypeId && guestsFitOccupancy(occupancy, room.guests))
        .sort((a, b) => b.guests - a.guests)[0];
      if (slot) {
        slot.roomTypeId = id;
        added = true;
      }
    } else if (usedOfType(id) > 0) {
      for (let i = stayRooms.length - 1; i >= 0; i -= 1) {
        if (Number(stayRooms[i].roomTypeId) === id) {
          stayRooms[i].roomTypeId = null;
          break;
        }
      }
    }
    rebuildCartFromAssignments();
    paintRooms();
    if (drawer && !drawer.hidden) paintDrawer();
    if (added && !skipFeedback) playAddedFeedback(card);
    persistWizDraft();
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function replayAnim(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function showToast(message, options = {}) {
    const toast = document.querySelector('[data-wiz-toast]');
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = message;
    toast.setAttribute('role', options.alert ? 'alert' : 'status');
    toast.classList.toggle('is-alert', Boolean(options.alert));
    toast.classList.remove('is-out');
    requestAnimationFrame(() => replayAnim(toast, 'is-in'));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-in');
      toast.classList.add('is-out');
      window.setTimeout(() => {
        toast.hidden = true;
        toast.classList.remove('is-out');
        toast.classList.remove('is-alert');
        toast.setAttribute('role', 'status');
      }, prefersReducedMotion() ? 0 : 220);
    }, options.holdMs ?? 2000);
  }

  function clearFlyers() {
    if (flyRaf) {
      window.cancelAnimationFrame(flyRaf);
      flyRaf = 0;
    }
    document.querySelectorAll('.wiz-fly-chip').forEach((el) => el.remove());
  }

  function bumpCart() {
    replayAnim(cartNav, 'is-catch');
    replayAnim(cartBadge, 'is-catch');
    replayAnim(sticky, 'is-pulse');
    window.setTimeout(() => {
      cartNav?.classList.remove('is-catch');
      cartBadge?.classList.remove('is-catch');
      sticky?.classList.remove('is-pulse');
    }, 480);
  }

  function flyerImageSrc(origin) {
    if (!origin) return '';
    if (origin.tagName === 'IMG') return origin.currentSrc || origin.src || '';
    const img = origin.querySelector?.('img');
    return img?.currentSrc || img?.src || '';
  }

  function flyToastToCart(options = {}) {
    const toast = document.querySelector('[data-wiz-toast]');
    if (!cartNav || prefersReducedMotion()) {
      bumpCart();
      return;
    }
    const toastRect = toast && !toast.hidden ? toast.getBoundingClientRect() : null;
    const start = options.fromOrigin && options.originRect?.width ? options.originRect : toastRect;
    const end = cartNav.getBoundingClientRect();
    if (!start?.width || !end.width) {
      bumpCart();
      return;
    }

    clearFlyers();
    window.clearTimeout(toastTimer);
    if (toast) {
      toast.hidden = true;
      toast.classList.remove('is-in', 'is-out');
    }

    const flyer = document.createElement('div');
    flyer.className = 'wiz-fly-chip';
    flyer.setAttribute('aria-hidden', 'true');
    const src = options.imageSrc ? escapeHtml(options.imageSrc) : '';
    const label = escapeHtml(options.label || t('wiz.addedToBooking'));
    flyer.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}<span>${label}</span>`;
    const x0 = start.left + start.width / 2;
    const y0 = start.top + start.height / 2;
    const x1 = end.left + end.width / 2;
    const y1 = end.top + end.height / 2;
    flyer.style.left = `${x0}px`;
    flyer.style.top = `${y0}px`;
    flyer.style.width = `${Math.min(Math.max(start.width, 176), 352)}px`;
    document.body.appendChild(flyer);

    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.min(96, Math.abs(x1 - x0) * 0.22 + 48);
    const duration = 640;
    const t0 = performance.now();

    const tick = (now) => {
      const k = Math.min((now - t0) / duration, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const m = 1 - e;
      const x = m * m * x0 + 2 * m * e * cx + e * e * x1;
      const y = m * m * y0 + 2 * m * e * cy + e * e * y1;
      const scale = Math.max(0.18, 1 - 0.78 * e);
      flyer.style.left = `${x}px`;
      flyer.style.top = `${y}px`;
      flyer.style.transform = `translate(-50%, -50%) scale(${scale})`;
      flyer.style.opacity = String(Math.max(0.35, 1 - 0.4 * e));
      if (k < 1) {
        flyRaf = window.requestAnimationFrame(tick);
        return;
      }
      flyRaf = 0;
      flyer.remove();
      bumpCart();
    };
    flyRaf = window.requestAnimationFrame(tick);
  }

  function playAddedFeedback(card, options = {}) {
    const name = card?.getAttribute('data-room-type') || t('wiz.room');
    const message = options.message || t('wiz.addedRoom', { name });
    const origin = options.origin || card;
    const imageSrc = flyerImageSrc(origin);
    const originRect = origin?.getBoundingClientRect?.();
    showToast(message, { holdMs: prefersReducedMotion() ? 2200 : 900 });
    if (prefersReducedMotion()) {
      bumpCart();
      return;
    }
    replayAnim(card, 'is-added');
    const delay = options.fromOrigin ? 40 : 320;
    window.setTimeout(() => {
      flyToastToCart({
        imageSrc,
        originRect,
        fromOrigin: Boolean(options.fromOrigin && originRect?.width),
        label: message,
      });
    }, delay);
    window.setTimeout(() => card?.classList.remove('is-added'), 300);
  }

  function removeCart(id) {
    for (let i = stayRooms.length - 1; i >= 0; i -= 1) {
      if (Number(stayRooms[i].roomTypeId) === Number(id)) {
        stayRooms[i].roomTypeId = null;
        break;
      }
    }
    rebuildCartFromAssignments();
    paintRooms();
    if (!cart.length) closeDrawer();
    else paintDrawer();
  }

  function setDrawerStep(name) {
    drawerStep = name;
    drawer?.querySelectorAll('[data-wiz-drawer-step]').forEach((el) => {
      el.hidden = el.getAttribute('data-wiz-drawer-step') !== name;
    });
    const title = document.querySelector('[data-wiz-drawer-title]');
    if (title) {
      title.textContent =
        name === 'form'
          ? t('wiz.guestDetails')
          : name === 'review'
            ? t('wiz.reviewAgree')
            : name === 'confirm'
              ? t('wiz.bookingConfirmed')
              : t('wiz.yourBooking');
    }
  }

  function paintDrawer() {
    const n = nights();
    const strip = document.querySelector('[data-wiz-stay-strip]');
    if (strip) {
      strip.innerHTML = [
        ['Check-in', fmtDay(checkInEl.value, { weekday: 'short', day: 'numeric', month: 'short' })],
        ['Check-out', fmtDay(checkOutEl.value, { weekday: 'short', day: 'numeric', month: 'short' })],
        ['Guests', guestsRoomsLabel(guestTotal(), neededRooms())],
        ['Nights', String(n)],
      ]
        .map(([key, value]) => {
          const labels = { 'Check-in': t('wiz.checkIn'), 'Check-out': t('wiz.checkOut'), Guests: t('wiz.guests'), Nights: t('wiz.nights') };
          return `<p><span>${labels[key]}</span><strong>${value}</strong></p>`;
        })
        .join('');
    }
    const lines = document.querySelector('[data-wiz-drawer-lines]');
    if (lines) {
      lines.innerHTML = cart
        .map(
          (line) => `<div class="wiz-line">
            ${line.image ? `<img src="${line.image}" alt="">` : '<div></div>'}
            <div class="wiz-line-copy">
              <h3>${line.name}</h3>
              <p>${line.qty > 1 ? t('wiz.qtyRoomsBit', { n: line.qty }) : ''}${t('wiz.lineBedsGuests', { beds: tn('wiz.bed', 'wiz.beds', line.beds), occupancy: line.occupancy })}</p>
              <div class="wiz-line-foot">
                <strong>${money(lineTotal(line))}</strong>
                <button type="button" class="wiz-link-remove" data-wiz-remove="${line.roomTypeId}" aria-label="${escapeHtml(t('wiz.removeFromBooking', { name: line.name }))}">${REMOVE_SVG}<span>${t('wiz.remove')}</span></button>
              </div>
            </div>
          </div>`
        )
        .join('');
    }
    const extras = extraPersons();
    const extraFee = extras * EXTRA_FEE * n;
    const loyalty = loyaltyTotal();
    const offer = selectedRateOffer();
    const totalBox = document.querySelector('[data-wiz-total]');
    if (totalBox) {
      const rows = [
        `<div class="wiz-total-row"><span>${tn('wiz.roomsNightsLine', 'wiz.roomsNightsLinePlural', n)}</span><strong>${money(roomsTotal())}</strong></div>`,
        extras ? `<div class="wiz-total-row"><span>${t('wiz.extraGuestTimes', { n: extras })}</span><strong>${money(extraFee)}</strong></div>` : '',
        loyalty > 0 ? `<div class="wiz-total-row"><span>${t('wiz.loyaltyRow')}</span><strong>−${money(loyalty)}</strong></div>` : '',
        offer ? `<div class="wiz-total-row"><span>${escapeHtml(offer.title || t('wiz.specialOffer'))}</span><strong>${t('wiz.applied')}</strong></div>` : '',
        signupPayStayHtml('pill'),
        `<div class="wiz-total-sum"><span>${t('wiz.totalEstimate')}</span><strong>${money(grandTotal())}</strong></div>`,
        `<p class="wiz-total-note">${offerForcesCash(offer) ? t('wiz.cashPayAtHotel') : t('wiz.payAtHotel')}</p>`,
      ];
      totalBox.innerHTML = rows.filter(Boolean).join('');
    }
    syncNeedRoomsNotice(false);
    paintReview();
  }

  function breakdownRows() {
    const n = Math.max(1, nights());
    const rows = [];
    cart.forEach((line) => {
      const offer = eligibleRateOffer(line.roomTypeId);
      const was = Number(line.listPrice || line.price);
      const compare = offer && was > Number(line.price)
        ? t('wiz.wasNight', { price: money(was) })
        : '';
      const offerBit = offer ? ` · ${offerKind(offer) === 'StayLongerSaveMore' ? t('wiz.stayLongerShort') : t('wiz.limitedTimeShort')}` : '';
      rows.push({
        label: `${line.qty > 1 ? t('wiz.qtyTimes', { n: line.qty }) : ''}${t('wiz.lineNameNights', { name: line.name, nights: tn('wiz.nightsShort', 'wiz.nightsShortPlural', n) })}${offerBit}${compare}`,
        amount: money(lineTotal(line)),
      });
      const deduct = lineLoyaltyDeduct(line, n);
      if (deduct > 0) {
        rows.push({
          label: t('wiz.loyaltyCoupon', { name: line.name }),
          amount: `−${money(deduct)}`,
          save: true,
        });
      }
    });
    const extras = extraPersons();
    if (extras) {
      rows.push({
        label: extras > 1
          ? t('wiz.extraGuestTimesNights', { count: extras, nights: tn('wiz.nightsShort', 'wiz.nightsShortPlural', n) })
          : t('wiz.extraGuestNights', { nights: tn('wiz.nightsShort', 'wiz.nightsShortPlural', n) }),
        amount: money(extras * EXTRA_FEE * n),
      });
    }
    return rows;
  }

  function arrivalDiscountValue() {
    const checked = document.querySelector('input[name="wizArrivalDiscount"]:checked');
    return checked?.value || 'None';
  }

  function syncArrivalDiscount() {
    const blocked = cartHasRateOffer();
    const hint = document.querySelector('[data-wiz-arrival-hint]');
    document.querySelectorAll('input[name="wizArrivalDiscount"]').forEach((input) => {
      if (input.value === 'None') {
        input.disabled = false;
        if (blocked) input.checked = true;
        return;
      }
      input.disabled = blocked;
    });
    if (hint) {
      hint.textContent = blocked
        ? t('booking.arrivalDiscountBlockedByOffer')
        : t('booking.arrivalDiscountHint');
    }
  }

  function paintReview() {
    const n = nights();
    const lead = document.querySelector('[data-wiz-lead-hint]');
    if (lead) {
      lead.textContent = isReservationLead() ? t('wiz.reservationLead') : t('wiz.bookingLead');
    }
    const box = document.querySelector('[data-wiz-breakdown]');
    if (box) {
      const rows = breakdownRows()
        .map((row) => `<div class="wiz-break-row${row.save ? ' is-save' : ''}"><span>${escapeHtml(row.label)}</span><strong>${row.amount}</strong></div>`)
        .join('');
      box.innerHTML = `${rows}${signupPayStayHtml('pill')}<div class="wiz-break-sum"><span>${t('booking.stayTotal')}</span><strong>${money(grandTotal())}</strong></div>`;
    }
    const cash = document.querySelector('[data-wiz-cash-note]');
    const offer = selectedRateOffer();
    if (cash) {
      const on = offer && offerForcesCash(offer);
      cash.hidden = !on;
      cash.textContent = on
        ? t('wiz.cashOfferNote', { title: offer.title || t('wiz.thisOffer') })
        : '';
    }
    syncArrivalDiscount();
  }

  function openDrawer() {
    if (!cart.length) return;
    lastFocus = document.activeElement;
    paintDrawer();
    if (drawerStep === 'confirm') setDrawerStep('summary');
    document.body.classList.add('wiz-lock');
    if (drawer) drawer.hidden = false;
    if (drawerBack) drawerBack.hidden = false;
    cartNav?.setAttribute('aria-expanded', 'true');
    document.querySelector('[data-wiz-drawer-close]')?.focus();
  }

  function closeDrawer() {
    document.body.classList.remove('wiz-lock');
    if (drawer) drawer.hidden = true;
    if (drawerBack) drawerBack.hidden = true;
    cartNav?.setAttribute('aria-expanded', 'false');
    lastFocus?.focus?.();
  }

  function parseImages(card) {
    try {
      const list = JSON.parse(card.getAttribute('data-images') || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function parseInclusions(card) {
    try {
      const list = JSON.parse(card.getAttribute('data-inclusions') || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  const INCLUSION_CATALOG = [
    { label: 'Video and audio', items: ['Smart TV'] },
    { label: 'Internet', items: ['Wi-Fi'] },
    { label: 'Electronic', items: ['air conditioning', 'electronic lock', 'heater', 'desk lamp'] },
    { label: 'Bathroom', items: ['toiletries', 'bath towels'] },
    { label: 'View', items: ['city view', 'no window'] },
  ];
  const DEFAULT_INCLUSION_SET = new Set(
    INCLUSION_CATALOG.flatMap((cat) => cat.items.map((item) => item.toLowerCase()))
  );

  function displayAmenity(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'wifi' || lower === 'wi-fi') return 'Wi-Fi';
    if (lower === 'smart tv' || lower === 'tv set') return 'Smart TV';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function amenityIcon(name) {
    const text = String(name || '').toLowerCase();
    if (text.includes('wifi') || text.includes('wi-fi')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 6.5a9 9 0 0 1 12 0M4.7 9.1a5.5 5.5 0 0 1 6.6 0M7.1 11.8a2.1 2.1 0 0 1 1.8 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="13.2" r="0.9" fill="currentColor"/></svg>';
    if (text.includes('tv')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 13h3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('lock') || text.includes('safe')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.9A2.7 2.7 0 0 1 8 3.2a2.7 2.7 0 0 1 2.7 2.7V7" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('air') || text.includes('heater') || text.includes('lamp')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="3.8" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M4 9.2v3m4-3v3m4-3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('towel') || text.includes('toiletr') || text.includes('bath') || text.includes('toilet')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10v1.6A2.4 2.4 0 0 1 10.6 12H5.4A2.4 2.4 0 0 1 3 9.6V8z" stroke="currentColor" stroke-width="1.3"/><path d="M5 8V5.4A1.6 1.6 0 0 1 6.6 3.8H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('view') || text.includes('window')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('chair') || text.includes('furniture')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 8.2h7V12M4.5 12v1.5M11.5 12v1.5M5.2 8.2V4.8h5.6v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (text.includes('mirror')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="4.5" y="2.5" width="7" height="11" rx="3.5" stroke="currentColor" stroke-width="1.3"/></svg>';
    if (text.includes('water') || text.includes('bottle')) return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.2 5.2h3.6L11 13.2H5L6.2 5.2zM6.8 5.2V3.6h2.4v1.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.8" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.2v2.9l1.8 1.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  }

  function groupAmenities(items) {
    const list = (items || []).map((item) => String(item).trim()).filter(Boolean);
    const selected = new Set(list.map((item) => item.toLowerCase()));
    const used = new Set();
    const groups = [];

    function take(candidates) {
      return (candidates || [])
        .filter((item) => selected.has(item.toLowerCase()) && !used.has(item.toLowerCase()))
        .map((item) => {
          used.add(item.toLowerCase());
          return list.find((entry) => entry.toLowerCase() === item.toLowerCase()) || item;
        });
    }

    const custom = take(list.filter((item) => !DEFAULT_INCLUSION_SET.has(item.toLowerCase())));
    if (custom.length) groups.push({ label: catLabel('Custom'), items: custom });
    INCLUSION_CATALOG.forEach((cat) => {
      const matched = take(cat.items);
      if (matched.length) groups.push({ label: catLabel(cat.label), items: matched });
    });
    return groups;
  }

  function renderAmenities(card) {
    const host = detail?.querySelector('[data-wiz-detail-inclusions]');
    if (!host) return;
    const items = parseInclusions(card);
    const groups = groupAmenities(items.length ? items : ['air conditioning', 'Wi-Fi']);
    if (!groups.length) {
      host.innerHTML = `<p class="wiz-amenity-empty">${t('wiz.noAmenities')}</p>`;
      return;
    }
    host.innerHTML = groups
      .map((group) => `<section class="wiz-amenity-group">
        <h3>${escapeHtml(group.label)}</h3>
        <ul>${group.items.map((item) => `<li><span class="wiz-amenity-icon">${amenityIcon(item)}</span><span>${escapeHtml(displayAmenity(item))}</span></li>`).join('')}</ul>
      </section>`)
      .join('');
  }

  function bindDetailAccordion() {
    if (!detail || detail.dataset.accBound === 'true') return;
    detail.dataset.accBound = 'true';
    detail.querySelectorAll('.wiz-acc[data-wiz-acc]').forEach((acc) => {
      acc.addEventListener('toggle', () => {
        if (!acc.open) return;
        detail.querySelectorAll('.wiz-acc[data-wiz-acc]').forEach((other) => {
          if (other !== acc) other.open = false;
        });
      });
    });
  }

  function offerKindLabel(kind) {
    if (kind === 'LimitedTime') return t('wiz.limitedTime');
    if (kind === 'StayLongerSaveMore') return t('wiz.stayLonger');
    return t('wiz.specialOffer');
  }

  function formatDescription(text) {
    const raw = String(text || '').trim();
    if (!raw) return `<p>${t('wiz.defaultDesc')}</p>`;
    const numbered = raw.split(/(?=\d+\.\s)/).map((part) => part.trim()).filter(Boolean);
    if (numbered.length > 1) {
      return `<ol class="wiz-desc-list">${numbered
        .map((part) => `<li>${escapeHtml(part.replace(/^\d+\.\s*/, ''))}</li>`)
        .join('')}</ol>`;
    }
    return raw
      .split(/\n+/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para)}</p>`)
      .join('');
  }

  function lockPage() {
    document.body.classList.add('wiz-lock');
    if (detailBack) detailBack.hidden = false;
  }

  function unlockIfIdle() {
    const offerOpen = offerSheet && !offerSheet.hidden;
    const dateOpen = dateSheet && !dateSheet.hidden;
    const detailOpen = detail && !detail.hidden;
    const drawerOpen = drawer && !drawer.hidden;
    if (!offerOpen && !dateOpen && !detailOpen && !drawerOpen) {
      document.body.classList.remove('wiz-lock');
      if (detailBack) detailBack.hidden = true;
    }
  }

  function cardImageList(card) {
    const images = parseImages(card);
    const fallback = card.querySelector('.wiz-card-media img')?.getAttribute('src') || '';
    return images.length ? images : fallback ? [fallback] : [];
  }

  function openGalleryZoom() {
    if (!galleryImages.length || typeof window.openPhotoZoom !== 'function') return;
    const items = galleryImages.map((src, i) => ({
      src,
      alt: t('wiz.photoOf', { name: galleryName, i: i + 1, total: galleryImages.length }),
    }));
    window.openPhotoZoom(items, galleryIndex);
  }

  function renderGallery(card, host) {
    galleryImages = cardImageList(card);
    galleryName = card.getAttribute('data-room-type') || t('wiz.guestRoom');
    galleryIndex = 0;
    if (!host) return;
    if (!galleryImages.length) {
      host.hidden = true;
      host.innerHTML = '';
      host.removeAttribute('data-count');
      return;
    }
    host.hidden = false;
    const visible = galleryImages.slice(0, 5);
    const extra = galleryImages.length - visible.length;
    host.setAttribute('data-count', String(visible.length));
    host.innerHTML = visible
      .map((src, index) => {
        const more = extra > 0 && index === visible.length - 1;
        const label = more
          ? t('wiz.viewAllPhotos', { n: galleryImages.length })
          : t('wiz.zoomPhoto', { name: galleryName, i: index + 1, total: galleryImages.length });
        return `<button type="button" class="wiz-bento-tile${index === 0 ? ' is-hero' : ''}${more ? ' is-more' : ''}" data-wiz-bento-index="${index}" aria-label="${escapeHtml(label)}"${more ? ` data-more="+${extra}"` : ''}>
          <img src="${escapeHtml(src)}" alt="${escapeHtml(t('wiz.photoN', { name: galleryName, n: index + 1 }))}" loading="${index === 0 ? 'eager' : 'lazy'}">
        </button>`;
      })
      .join('');
  }

  function bindBentoHost(root) {
    if (!root || root.dataset.galleryBound === 'true') return;
    root.dataset.galleryBound = 'true';
    root.querySelector('[data-wiz-bento]')?.addEventListener('click', (event) => {
      const tile = event.target.closest('[data-wiz-bento-index]');
      if (!tile) return;
      galleryIndex = Number(tile.getAttribute('data-wiz-bento-index')) || 0;
      openGalleryZoom();
    });
  }

  function bindGallery() {
    bindBentoHost(detail);
    bindBentoHost(offerSheet);
  }

  function renderOfferReveal(card) {
    const panel = offerSheet?.querySelector('[data-wiz-offer-panel]');
    if (!panel) return false;
    const id = Number(card.getAttribute('data-room-type-id'));
    const listPrice = listPriceOf(card);
    const limited = limitedOfferForType(id);
    const stayOffers = stayLongerOffersForType(id);
    const applied = eligibleRateOffer(id);
    const stayNights = nights();
    if (!limited && !stayOffers.length) {
      panel.innerHTML = '';
      panel.removeAttribute('data-offer-count');
      return false;
    }
    const blocks = [];
    const roomTypeId = Number(card.getAttribute('data-room-type-id'));
    const saved = Number(forcedOfferByType.get(roomTypeId) || 0);
    const sold = Number(card.getAttribute('data-available') || 0) < 1;
    offerChoiceId = saved > 0 ? saved : 0;
    const selectBtn = (offerId) => {
      const picked = saved === Number(offerId);
      const label = sold ? t('wiz.soldOut') : picked ? t('wiz.added') : t('wiz.add');
      return `<button type="button" class="wiz-offer-select${picked ? ' is-selected' : ''}" data-wiz-offer-select="${offerId}"${sold ? ' disabled' : ''}>${label}</button>`;
    };
    const offerCardHtml = ({ kicker, title, bodyHtml, promo, regular, pct, hint, offerId, modifier, selectHtml }) => {
      const priceHtml = `<div class="wiz-offer-price">
          ${regular > promo ? `<span class="wiz-offer-pct">−${pct}%</span><s>${money(regular)}</s>` : ''}
          <strong>${money(promo)}</strong>
          <span>${t('wiz.perNightSlash')}</span>
        </div>`;
      return `<article class="wiz-offer-rate${modifier ? ` ${modifier}` : ''}">
        <div class="wiz-offer-copy">
          <p class="wiz-offer-kicker">${escapeHtml(kicker)}</p>
          <h3>${escapeHtml(title)}</h3>
          ${bodyHtml}
        </div>
        <div class="wiz-offer-cta">
          ${signupPayNightlyHtml(id, promo)}
          ${priceHtml}
          <p class="wiz-offer-hint">${hint}</p>
          ${selectHtml || selectBtn(offerId)}
        </div>
      </article>`;
    };
    if (!limited && stayOffers.length && !stayOffers.some((offer) => offerEligibleForNights(offer, stayNights))) {
      const inCartAtBase = usedOfType(id) > 0 && saved < 1;
      const baseLabel = sold ? t('wiz.soldOut') : inCartAtBase ? t('wiz.added') : t('wiz.add');
      blocks.push(offerCardHtml({
        modifier: 'is-base',
        kicker: t('wiz.standardRate'),
        title: t('wiz.bookRoomRate'),
        bodyHtml: `<p>${tn('wiz.shortOfMin', 'wiz.shortOfMinPlural', stayNights || 0)}</p>`,
        promo: listPrice,
        regular: listPrice,
        pct: 0,
        hint: t('wiz.addsSelectedDates'),
        selectHtml: `<button type="button" class="wiz-offer-select${inCartAtBase ? ' is-selected' : ''}" data-wiz-add-base${sold ? ' disabled' : ''}>${baseLabel}</button>`,
      }));
    }
    if (limited) {
      const promo = Number(limited.promoPricePerNight);
      const regular = Number(limited.regularPricePerNight || listPrice);
      const pct = discountPercent(regular, promo);
      blocks.push(offerCardHtml({
        kicker: offerKindLabel(limited.kind),
        title: limited.title || t('wiz.limitedTimeShort'),
        bodyHtml: limited.description
          ? `<p>${escapeHtml(limited.description)}</p>`
          : `<p>${t('wiz.promoCash')}</p>`,
        promo,
        regular,
        pct,
        hint: applied && Number(applied.id) === Number(limited.id)
          ? t('wiz.rateAppliesAdd')
          : t('wiz.addOfferToAdd'),
        offerId: limited.id,
      }));
    }
    stayOffers.forEach((offer) => {
      const promo = Number(offer.promoPricePerNight);
      const regular = Number(offer.regularPricePerNight || listPrice);
      const pct = discountPercent(regular, promo);
      const min = Number(offer.minNights || 0);
      const unlocked = offerEligibleForNights(offer, stayNights);
      const hint = unlocked
        ? (applied && Number(applied.id) === Number(offer.id)
          ? t('wiz.stayMeetsApply')
          : t('wiz.stayMeetsMin'))
        : tn('wiz.rateNeedsNights', 'wiz.rateNeedsNightsPlural', stayNights || 0, { n: min, stay: stayNights || 0 });
      blocks.push(offerCardHtml({
        kicker: offerKindLabel(offer.kind),
        title: offer.title || t('wiz.stayLongerShort'),
        bodyHtml: `<p>${escapeHtml(offer.description || t('wiz.stayNightsForRate', { n: min }))} ${t('wiz.requiresNights', { n: min })}</p>`,
        promo,
        regular,
        pct,
        hint,
        offerId: offer.id,
      }));
    });
    panel.setAttribute('data-offer-count', String(blocks.length));
    panel.innerHTML = blocks.join('');
    paintOfferPick(listPrice);
    return true;
  }

  function paintOfferPick(listPrice) {
    const pick = offerSheet?.querySelector('[data-wiz-offer-pick]');
    if (!pick) return;
    const offer = offerById(offerChoiceId);
    const roomTypeId = Number(detailCard?.getAttribute('data-room-type-id'));
    pick.textContent = offer
      ? t('wiz.selectedOffer', { title: offer.title || offerKindLabel(offer.kind), price: money(offer.promoPricePerNight || listPrice) })
      : canBookStandardRate(roomTypeId)
        ? t('wiz.bookStandardOrOffer')
        : t('wiz.addOfferRoom');
  }

  function setDateAdjustError(name, message) {
    const wrap = dateSheet?.querySelector(`[data-wiz-date-field="${name}"]`);
    const err = dateSheet?.querySelector(`[data-wiz-date-error="${name}"]`);
    wrap?.classList.toggle('is-invalid', Boolean(message));
    if (err) err.textContent = message || '';
  }

  function clearDateAdjustErrors() {
    setDateAdjustError('in', '');
    setDateAdjustError('out', '');
  }

  function paintDateAdjustNights() {
    const status = dateSheet?.querySelector('[data-wiz-date-nights]');
    if (!status) return;
    const n = nightsBetween(dateInEl?.value, dateOutEl?.value);
    const min = pendingMinNights;
    if (n < 1) {
      status.textContent = t('wiz.selectBothDates');
      return;
    }
    const extra = n < min ? t('wiz.needsMinNights', { n: min }) : t('wiz.meetsMinNights', { n: min });
    status.textContent = `${tn('wiz.nightsShort', 'wiz.nightsShortPlural', n)} · ${fmtDay(dateInEl.value, {
      day: 'numeric',
      month: 'short',
    })} → ${fmtDay(dateOutEl.value, { day: 'numeric', month: 'short', year: 'numeric' })}${extra}`;
  }

  function applyOfferDateLimits() {
    const today = manilaToday();
    const minNights = Math.max(1, pendingMinNights);
    if (dateInEl) {
      dateInEl.min = today;
      if (dateInEl.value && dateInEl.value < today) dateInEl.value = today;
    }
    if (dateOutEl) {
      const startYmd = dateInEl?.value || today;
      const minOut = addNightsYmd(startYmd, minNights);
      dateOutEl.min = minOut;
      if (!dateOutEl.value || nightsBetween(startYmd, dateOutEl.value) < minNights) {
        dateOutEl.value = minOut;
      }
    }
    paintDateAdjustNights();
  }

  function openDateAdjust(offer) {
    pendingOfferId = Number(offer.id);
    pendingMinNights = Number(offer.minNights || 0);
    const stayNights = nights();
    const title = dateSheet?.querySelector('[data-wiz-date-title]');
    const copy = dateSheet?.querySelector('[data-wiz-date-copy]');
    if (title) title.textContent = t('wiz.offerNeedsNights', { n: pendingMinNights });
    if (copy) {
      copy.textContent = tn('wiz.stayCurrently', 'wiz.stayCurrentlyPlural', stayNights || 0);
    }
    if (dateInEl) dateInEl.value = checkInEl?.value || manilaToday();
    if (dateOutEl) {
      const currentOut = checkOutEl?.value || '';
      const suggested = addNightsYmd(dateInEl?.value, pendingMinNights);
      dateOutEl.value = nightsBetween(dateInEl?.value, currentOut) >= pendingMinNights ? currentOut : suggested;
    }
    clearDateAdjustErrors();
    applyOfferDateLimits();
    if (dateBack) dateBack.hidden = false;
    if (dateSheet) dateSheet.hidden = false;
    dateInEl?.focus();
  }

  function closeDateAdjust() {
    if (dateSheet) dateSheet.hidden = true;
    if (dateBack) dateBack.hidden = true;
    pendingOfferId = 0;
  }

  async function confirmDateAdjust() {
    clearDateAdjustErrors();
    const checkIn = dateInEl?.value || '';
    const checkOut = dateOutEl?.value || '';
    let ok = true;
    if (!checkIn) {
      setDateAdjustError('in', t('wiz.selectCheckIn'));
      ok = false;
    }
    if (!checkOut) {
      setDateAdjustError('out', t('wiz.selectCheckOut'));
      ok = false;
    }
    const n = nightsBetween(checkIn, checkOut);
    if (checkIn && checkOut && n < pendingMinNights) {
      setDateAdjustError('out', t('wiz.checkoutMinNights', { n: pendingMinNights }));
      ok = false;
    }
    if (!ok) return;
    if (!(await ensureFarCheckInConfirmed(checkIn))) return;
    const offerId = pendingOfferId;
    if (checkInEl) checkInEl.value = checkIn;
    if (checkOutEl) checkOutEl.value = checkOut;
    applyDateLimits();
    clearDateErrors();
    refreshStayPricing();
    closeDateAdjust();
    applyOfferAndAdd(offerId, { datesReady: true });
  }

  function addRoomAtBaseRate() {
    if (!detailCard) return;
    const card = detailCard;
    const sold = Number(card.getAttribute('data-available') || 0) < 1;
    if (sold) return;
    const roomTypeId = Number(card.getAttribute('data-room-type-id'));
    offerChoiceId = 0;
    forcedOfferByType.delete(roomTypeId);
    if (canAssign(card)) {
      const origin = offerSheet?.querySelector('[data-wiz-bento] img, img') || card;
      const name = card.getAttribute('data-room-type') || t('wiz.room');
      toggleCart(card, { skipReveal: true, skipFeedback: true });
      playAddedFeedback(card, {
        origin,
        message: t('wiz.addedStandard', { name }),
        fromOrigin: true,
      });
      closeOffer();
      return;
    }
    if (usedOfType(roomTypeId) > 0) {
      rebuildCartFromAssignments();
      paintRooms();
      if (drawer && !drawer.hidden) paintDrawer();
      closeOffer();
    }
  }

  function applyOfferAndAdd(offerId, options) {
    if (!detailCard || !offerId) return;
    const card = detailCard;
    const sold = Number(card.getAttribute('data-available') || 0) < 1;
    if (sold) return;
    const offer = offerById(offerId);
    const min = Number(offer?.minNights || 0);
    if (
      !options?.datesReady &&
      offerKind(offer) === 'StayLongerSaveMore' &&
      min >= 2 &&
      nights() < min
    ) {
      openDateAdjust(offer);
      return;
    }
    const roomTypeId = Number(card.getAttribute('data-room-type-id'));
    offerChoiceId = offerId;
    forcedOfferByType.set(roomTypeId, offerId);
    if (canAssign(card)) {
      const origin = offerSheet?.querySelector('[data-wiz-bento] img, img') || card;
      const message = offer?.title
        ? t('wiz.offerAdded', { title: offer.title })
        : undefined;
      toggleCart(card, { skipReveal: true, skipFeedback: true });
      playAddedFeedback(card, { origin, message, fromOrigin: true });
      closeOffer();
    } else if (usedOfType(roomTypeId) > 0) {
      rebuildCartFromAssignments();
      paintRooms();
      if (drawer && !drawer.hidden) paintDrawer();
      closeOffer();
    }
    persistWizDraft();
  }

  function openDetail(card) {
    lastFocus = document.activeElement;
    detailCard = card;
    closeOffer({ keepLock: true });
    const title = detail?.querySelector('[data-wiz-detail-title]');
    if (title) title.textContent = card.getAttribute('data-room-type') || '';
    const copy = detail?.querySelector('[data-wiz-detail-copy]');
    if (copy) copy.innerHTML = formatDescription(card.getAttribute('data-description'));
    renderAmenities(card);
    renderGallery(card, detail?.querySelector('[data-wiz-bento]'));
    const amenities = detail?.querySelector('[data-wiz-acc="amenities"]');
    const description = detail?.querySelector('[data-wiz-acc="description"]');
    if (amenities) amenities.open = true;
    if (description) description.open = false;
    const bookBtn = detail?.querySelector('[data-wiz-detail-book]');
    if (bookBtn) {
      const sold = Number(card.getAttribute('data-available') || 0) < 1;
      const addable = !sold && canAssign(card);
      bookBtn.disabled = !addable;
      bookBtn.textContent = sold ? t('wiz.soldOut') : addable ? t('wiz.addToBooking') : t('wiz.alreadySelected');
    }
    const toOffer = detail?.querySelector('[data-wiz-to-offer]');
    if (toOffer) {
      const id = Number(card.getAttribute('data-room-type-id'));
      const hasOffer = Boolean(limitedOfferForType(id) || stayLongerOffersForType(id).length);
      toOffer.hidden = !hasOffer;
    }
    lockPage();
    if (detail) detail.hidden = false;
    document.querySelector('[data-wiz-detail-close]')?.focus();
  }

  function closeDetail(options) {
    if (detail) detail.hidden = true;
    if (!options?.keepLock) {
      detailCard = null;
      unlockIfIdle();
      lastFocus?.focus?.();
    }
  }

  function openOffer(card) {
    lastFocus = document.activeElement;
    detailCard = card;
    closeDetail({ keepLock: true });
    const title = offerSheet?.querySelector('[data-wiz-offer-title]');
    if (title) title.textContent = card.getAttribute('data-room-type') || t('wiz.guestRoom');
    renderGallery(card, offerSheet?.querySelector('[data-wiz-bento]'));
    const hasOffer = renderOfferReveal(card);
    if (!hasOffer) {
      toggleCart(card, { skipReveal: true });
      return;
    }
    lockPage();
    if (offerSheet) offerSheet.hidden = false;
    document.querySelector('[data-wiz-offer-close]')?.focus();
  }

  function closeOffer(options) {
    closeDateAdjust();
    if (offerSheet) offerSheet.hidden = true;
    if (!options?.keepLock) {
      if (detail?.hidden) detailCard = null;
      unlockIfIdle();
      lastFocus?.focus?.();
    }
  }

  function validateDates() {
    clearDateErrors();
    const checkIn = checkInEl?.value || '';
    const checkOut = checkOutEl?.value || '';
    let ok = true;
    if (!checkIn) {
      setFieldError('checkIn', t('wiz.selectCheckIn'));
      ok = false;
    }
    if (!checkOut) {
      setFieldError('checkOut', t('wiz.selectCheckOut'));
      ok = false;
    }
    if (checkIn && checkOut && nightsBetween(checkIn, checkOut) <= 0) {
      setFieldError('checkOut', t('wiz.checkoutAfter'));
      ok = false;
    }
    return ok;
  }

  function val(id) {
    return document.getElementById(id)?.value.trim() || '';
  }

  function clearFormErrors() {
    ['firstName', 'lastName', 'email', 'phone', 'guestFirst', 'guestLast', 'guestEmail', 'consentData']
      .forEach((name) => setFieldError(name, ''));
    if (formAlert) {
      formAlert.hidden = true;
      formAlert.textContent = '';
    }
  }

  function validateGuestDetails() {
    clearFormErrors();
    const errors = {};
    if (!val('wizFirstName')) errors.firstName = t('wiz.required');
    if (!val('wizLastName')) errors.lastName = t('wiz.required');
    if (!val('wizEmail') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('wizEmail'))) errors.email = t('wiz.validEmail');
    if (!isValidPhone(val('wizPhone'))) errors.phone = t('wiz.validPhone');
    if (bookingFor === 'someone') {
      if (!val('wizGuestFirst')) errors.guestFirst = t('wiz.required');
      if (!val('wizGuestLast')) errors.guestLast = t('wiz.required');
      if (!val('wizGuestEmail') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('wizGuestEmail'))) {
        errors.guestEmail = t('wiz.validEmail');
      }
    }
    Object.entries(errors).forEach(([key, message]) => setFieldError(key, message));
    if (Object.keys(errors).length && formAlert) {
      formAlert.hidden = false;
      formAlert.textContent = t('wiz.correctFields');
    }
    return Object.keys(errors).length === 0;
  }

  function validatePolicies() {
    setFieldError('consentData', '');
    if (reviewAlert) {
      reviewAlert.hidden = true;
      reviewAlert.textContent = '';
    }
    if (!document.getElementById('wizConsentData')?.checked) {
      setFieldError('consentData', t('wiz.confirmConsent'));
      if (reviewAlert) {
        reviewAlert.hidden = false;
        reviewAlert.textContent = t('wiz.acceptPolicies');
      }
      return false;
    }
    return true;
  }

  function goToReview() {
    if (!validateGuestDetails()) return;
    paintReview();
    setDrawerStep('review');
    syncConfirmReady();
  }

  function guestPayload() {
    if (bookingFor === 'someone') {
      return {
        guestName: `${val('wizGuestFirst')} ${val('wizGuestLast')}`.replace(/\s+/g, ' ').trim(),
        guestEmail: val('wizGuestEmail'),
        guestPhone: val('wizGuestPhone') || val('wizPhone'),
      };
    }
    return {
      guestName: `${val('wizFirstName')} ${val('wizLastName')}`.replace(/\s+/g, ' ').trim().slice(0, 120),
      guestEmail: val('wizEmail'),
      guestPhone: val('wizPhone'),
    };
  }

  function paintConfirm(payload, bookerName, bookerEmail) {
    lastConfirm = { payload, bookerName, bookerEmail };
    const kind = String(payload.kind || 'Booking');
    const kicker = document.querySelector('[data-wiz-confirm-kicker]');
    if (kicker) kicker.textContent = kind.toLowerCase() === 'reservation' ? t('wiz.reservationReceived') : t('wiz.bookingConfirmedShort');
    const title = document.querySelector('[data-wiz-confirm-title]');
    if (title) title.innerHTML = `${escapeHtml(t('wiz.allSet'))}<br />${escapeHtml(bookerName || t('wiz.valuedGuest'))}!`;
    const copy = document.querySelector('[data-wiz-confirm-copy]');
    if (copy) {
      copy.innerHTML = t('wiz.confirmSent', { email: `<strong>${escapeHtml(bookerEmail)}</strong>` });
    }
    const rows = document.querySelector('[data-wiz-confirm-rows]');
    if (rows) {
      const list = [
        [t('wiz.room'), cart.map((line) => (line.qty > 1 ? `${line.qty}× ${line.name}` : line.name)).join(', ')],
        [t('wiz.checkIn'), checkInEl.value],
        [t('wiz.checkOut'), checkOutEl.value],
        [t('wiz.nights'), String(nights())],
        [t('wiz.total'), money(payload.totalAmount ?? grandTotal())],
        [t('wiz.reference'), payload.reference || '—'],
      ];
      rows.innerHTML = list
        .map(([label, value]) => `<div><span>${label}</span><strong class="${label === t('wiz.reference') ? 'is-ref' : ''}">${value}</strong></div>`)
        .join('');
    }
  }

  async function submitBooking() {
    if (!validateGuestDetails()) {
      setDrawerStep('form');
      return;
    }
    if (!validatePolicies()) return;
    if (!stayComplete()) {
      if (reviewAlert) {
        reviewAlert.hidden = false;
        reviewAlert.textContent = tn('wiz.selectRoomTypes', 'wiz.selectRoomTypesPlural', neededRooms());
      }
      return;
    }
    if (!childAgesComplete()) {
      if (reviewAlert) {
        reviewAlert.hidden = false;
        reviewAlert.textContent = childAgesMessage();
      }
      setDrawerStep('summary');
      closeDrawer();
      setStep(1);
      openStayEditor();
      focusFirstMissingChildAge();
      return;
    }
    if (!cart.length) {
      if (reviewAlert) {
        reviewAlert.hidden = false;
        reviewAlert.textContent = t('wiz.addRoomBeforeSubmit');
      }
      return;
    }
    if (!(await ensureFarCheckInConfirmed())) {
      setDrawerStep('summary');
      closeDrawer();
      setStep(1);
      return;
    }
    const guest = guestPayload();
    const offer = selectedRateOffer();
    const arrivalDiscountRequest = cartHasRateOffer() ? 'None' : arrivalDiscountValue();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.original = submitBtn.textContent || '';
      submitBtn.textContent = t('wiz.sending');
    }
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          RequestVerificationToken: token,
        },
        body: JSON.stringify({
          guestName: guest.guestName,
          guestEmail: guest.guestEmail,
          guestPhone: guest.guestPhone,
          checkInAtUtc: toManilaIso(checkInEl.value, CHECKIN_TIME),
          checkoutTimeUtc: toManilaIso(checkOutEl.value, CHECKOUT_TIME),
          paymentOption: 'Full',
          acceptTerms: Boolean(document.getElementById('wizConsentData')?.checked),
          extraPersons: extraPersons(),
          arrivalDiscountRequest,
          specialOfferId: offer ? Number(offer.id) : null,
          preferredPaymentMethod: 'Cash',
          items: cart.map((line) => ({ roomTypeId: line.roomTypeId, quantity: line.qty })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationMessage = payload.errors ? Object.values(payload.errors).flat().join(' ') : '';
        throw new Error(
          payload.message
            || validationMessage
            || (response.status === 429
              ? t('booking.toastTooManyAttempts')
              : t('booking.toastSubmitFailed'))
        );
      }
      paintConfirm(payload, val('wizFirstName'), bookingFor === 'someone' ? val('wizGuestEmail') : val('wizEmail'));
      clearWizDraft();
      stayRooms.forEach((room) => { room.roomTypeId = null; });
      rebuildCartFromAssignments();
      paintStayRooms();
      paintCartChrome();
      setDrawerStep('confirm');
    } catch (err) {
      if (reviewAlert) {
        reviewAlert.hidden = false;
        reviewAlert.textContent = err?.message || t('booking.toastSubmitFailed');
      }
    } finally {
      if (submitBtn) {
        submitBtn.textContent = submitBtn.dataset.original || t('wiz.confirmReservation');
        syncConfirmReady();
      }
    }
  }

  function setBookingFor(value) {
    bookingFor = value;
    document.querySelectorAll('[data-wiz-for]').forEach((btn) => {
      const on = btn.getAttribute('data-wiz-for') === value;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const block = document.querySelector('[data-wiz-guest-block]');
    if (block) block.hidden = value !== 'someone';
    const legend = document.querySelector('[data-wiz-details-legend]');
    if (legend) legend.textContent = value === 'someone' ? t('wiz.contactDetails') : t('wiz.yourDetails');
  }

  function syncConfirmReady() {
    const ready = Boolean(document.getElementById('wizConsentData')?.checked);
    if (!submitBtn) return;
    submitBtn.disabled = !ready;
    submitBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }

  function refreshStayPricing() {
    rebuildCartFromAssignments();
    paintNights();
    if (step === 2) paintRooms();
    if (drawer && !drawer.hidden) paintDrawer();
  }

  checkInEl?.addEventListener('change', () => {
    applyDateLimits();
    clearDateErrors();
    refreshStayPricing();
  });
  checkOutEl?.addEventListener('change', () => {
    clearDateErrors();
    refreshStayPricing();
  });

  root.querySelector('[data-wiz-search]')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-wiz-search-tab]');
    if (tab) {
      event.preventDefault();
      setSearchTab(tab.getAttribute('data-wiz-search-tab'));
      return;
    }
    const day = event.target.closest('[data-cal-ymd]');
    if (day && !day.disabled) {
      event.preventDefault();
      selectStayDay(day.getAttribute('data-cal-ymd'));
    }
  });
  root.querySelector('[data-wiz-cal-prev]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    shiftCalendar(-1);
  });
  root.querySelector('[data-wiz-cal-next]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    shiftCalendar(1);
  });
  root.querySelector('[data-wiz-cal-clear]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearStayDates();
  });

  root.querySelector('[data-wiz-next="1"]')?.addEventListener('click', async () => {
    if (!validateDates()) return;
    if (!occupancyReady()) {
      openStayEditor({ prompt: true });
      if (!childAgesComplete()) focusFirstMissingChildAge();
      return;
    }
    if (!(await ensureFarCheckInConfirmed())) return;
    setStep(2);
  });
  root.querySelector('[data-wiz-change-dates]')?.addEventListener('click', () => setStep(1));
  root.querySelector('[data-wiz-steps]')?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-wiz-step-node]');
    if (!node?.classList.contains('is-done')) return;
    setStep(Number(node.getAttribute('data-wiz-step-node')) || 1);
  });
  root.querySelector('[data-wiz-steps]')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target.closest('[data-wiz-step-node]');
    if (!node?.classList.contains('is-done')) return;
    event.preventDefault();
    setStep(Number(node.getAttribute('data-wiz-step-node')) || 1);
  });
  addRoomBtn?.addEventListener('click', addStayRoom);
  stayRoomsEl?.addEventListener('change', (event) => {
    const select = event.target.closest('[data-wiz-child-age]');
    if (!select) return;
    setStayChildAge(
      Number(select.getAttribute('data-wiz-child-age')),
      Number(select.getAttribute('data-wiz-child-index')),
      select.value
    );
  });
  staySheet?.querySelectorAll('[data-wiz-preset]').forEach((pill) => {
    pill.addEventListener('click', () => applyPreset(pill.getAttribute('data-wiz-preset')));
  });
  stayBack?.addEventListener('click', () => { tryCloseStayEditor(); });
  staySheet?.querySelector('[data-wiz-stay-close]')?.addEventListener('click', () => { tryCloseStayEditor(); });
  staySheet?.querySelector('[data-wiz-stay-done]')?.addEventListener('click', () => { confirmStayOccupancy(); });

  staySheet?.addEventListener('click', (event) => {
    const stayDelta = event.target.closest('[data-wiz-stay-delta]');
    if (stayDelta) {
      const index = Number(stayDelta.getAttribute('data-wiz-stay-index'));
      const delta = Number(stayDelta.getAttribute('data-wiz-stay-delta'));
      const kind = stayDelta.getAttribute('data-wiz-stay-kind') || 'adults';
      setStayParty(index, kind, delta);
      return;
    }
    const removeStay = event.target.closest('[data-wiz-remove-stay]');
    if (removeStay) {
      removeStayRoom(Number(removeStay.getAttribute('data-wiz-remove-stay')));
    }
  });

  root.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-wiz-toggle]');
    if (toggle && !toggle.disabled) {
      const card = toggle.closest('[data-wiz-card]');
      if (card) toggleCart(card);
      return;
    }
    const details = event.target.closest('[data-wiz-detail], [data-wiz-open-detail], [data-wiz-offer-flag]');
    if (details) {
      const card = details.closest('[data-wiz-card]');
      if (card) openDetail(card);
    }
  });

  root.querySelector('[data-wiz-review]')?.addEventListener('click', () => {
    if (!stayComplete()) {
      const message = roomsNeededMessage();
      showRoomsAlert(message);
      showToast(message, { alert: true, holdMs: 3600 });
      return;
    }
    openDrawer();
  });
  cartNav?.addEventListener('click', () => {
    document.getElementById('guestNav')?.classList.remove('is-open');
    if (!cart.length) return;
    openDrawer();
  });
  drawerBack?.addEventListener('click', closeDrawer);
  document.querySelector('[data-wiz-drawer-close]')?.addEventListener('click', closeDrawer);
  document.querySelector('[data-wiz-enter-details]')?.addEventListener('click', () => {
    if (!stayComplete()) {
      syncNeedRoomsNotice(true);
      return;
    }
    setDrawerStep('form');
  });
  document.querySelector('[data-wiz-form-back]')?.addEventListener('click', () => setDrawerStep('summary'));
  document.querySelector('[data-wiz-review-back]')?.addEventListener('click', () => setDrawerStep('form'));
  document.querySelector('[data-wiz-submit]')?.addEventListener('click', () => {
    if (submitBtn?.disabled) return;
    submitBooking();
  });
  document.querySelector('[data-wiz-done]')?.addEventListener('click', () => {
    closeDrawer();
    setDrawerStep('summary');
  });
  drawer?.addEventListener('click', (event) => {
    const signup = event.target.closest('[data-wiz-signup-pay]');
    if (signup) {
      event.preventDefault();
      startGoogleSignup();
      return;
    }
    const remove = event.target.closest('[data-wiz-remove]');
    if (remove) removeCart(remove.getAttribute('data-wiz-remove'));
  });
  document.querySelectorAll('[data-wiz-for]').forEach((btn) => {
    btn.addEventListener('click', () => setBookingFor(btn.getAttribute('data-wiz-for')));
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    goToReview();
  });
  document.getElementById('wizConsentData')?.addEventListener('change', () => syncConfirmReady());
  detailBack?.addEventListener('click', () => {
    closeOffer();
    closeDetail();
  });
  document.querySelector('[data-wiz-detail-close]')?.addEventListener('click', () => closeDetail());
  document.querySelector('[data-wiz-offer-close]')?.addEventListener('click', () => closeOffer());
  document.querySelector('[data-wiz-to-offer]')?.addEventListener('click', () => {
    if (!detailCard) return;
    openOffer(detailCard);
  });
  document.querySelector('[data-wiz-to-details]')?.addEventListener('click', () => {
    if (!detailCard) return;
    openDetail(detailCard);
  });
  document.querySelector('[data-wiz-detail-book]')?.addEventListener('click', () => {
    if (!detailCard) return;
    const card = detailCard;
    closeDetail({ keepLock: true });
    const id = Number(card.getAttribute('data-room-type-id'));
    if (limitedOfferForType(id) || stayLongerOffersForType(id).length) {
      openOffer(card);
      return;
    }
    toggleCart(card, { skipReveal: true });
    unlockIfIdle();
  });
  offerSheet?.addEventListener('click', (event) => {
    const signup = event.target.closest('[data-wiz-signup-pay]');
    if (signup) {
      event.preventDefault();
      startGoogleSignup();
      return;
    }
    const baseBtn = event.target.closest('[data-wiz-add-base]');
    if (baseBtn) {
      if (baseBtn.disabled) return;
      event.preventDefault();
      addRoomAtBaseRate();
      return;
    }
    const selectBtn = event.target.closest('[data-wiz-offer-select]');
    if (!selectBtn || selectBtn.disabled) return;
    event.preventDefault();
    applyOfferAndAdd(Number(selectBtn.getAttribute('data-wiz-offer-select')) || 0);
  });
  dateInEl?.addEventListener('change', () => {
    clearDateAdjustErrors();
    applyOfferDateLimits();
  });
  dateOutEl?.addEventListener('change', () => {
    clearDateAdjustErrors();
    paintDateAdjustNights();
  });
  document.querySelector('[data-wiz-date-close]')?.addEventListener('click', () => closeDateAdjust());
  document.querySelector('[data-wiz-date-cancel]')?.addEventListener('click', () => closeDateAdjust());
  document.querySelector('[data-wiz-date-confirm]')?.addEventListener('click', () => confirmDateAdjust());
  dateBack?.addEventListener('click', () => closeDateAdjust());

  farCheckInBack?.addEventListener('click', () => closeFarCheckInDialog(false));
  document.querySelector('[data-wiz-far-checkin-close]')?.addEventListener('click', () => closeFarCheckInDialog(false));
  document.querySelector('[data-wiz-far-checkin-change]')?.addEventListener('click', () => closeFarCheckInDialog(false));
  document.querySelector('[data-wiz-far-checkin-yes]')?.addEventListener('click', () => closeFarCheckInDialog(true));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.body.classList.contains('hotel-photo-zoom-open')) return;
    if (farCheckInSheet && !farCheckInSheet.hidden) {
      closeFarCheckInDialog(false);
      return;
    }
    if (dateSheet && !dateSheet.hidden) {
      closeDateAdjust();
      return;
    }
    if (staySheet && !staySheet.hidden) {
      tryCloseStayEditor();
      return;
    }
    if (offerSheet && !offerSheet.hidden) {
      closeOffer();
      return;
    }
    if (detail && !detail.hidden) {
      closeDetail();
      return;
    }
    if (drawer && !drawer.hidden) closeDrawer();
  });

  const WIZ_DRAFT_KEY = 'mori.wizStayDraft';
  const WIZ_DRAFT_MAX_MS = 24 * 60 * 60 * 1000;
  let restoringDraft = false;

  function clearWizDraft() {
    try {
      sessionStorage.removeItem(WIZ_DRAFT_KEY);
    } catch {
      /* private mode */
    }
  }

  function persistWizDraft() {
    if (restoringDraft) return;
    try {
      sessionStorage.setItem(
        WIZ_DRAFT_KEY,
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          step,
          occupancyConfirmed,
          stayRooms,
          checkIn: checkInEl?.value || '',
          checkOut: checkOutEl?.value || '',
          pickMode,
          calMonth,
          offerChoiceId,
          forcedOffers: Object.fromEntries(forcedOfferByType),
        })
      );
    } catch {
      /* quota / private mode */
    }
  }

  function restoreWizDraft() {
    let raw = '';
    try {
      raw = sessionStorage.getItem(WIZ_DRAFT_KEY) || '';
    } catch {
      return false;
    }
    if (!raw) return false;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      clearWizDraft();
      return false;
    }
    if (!data || data.v !== 1) {
      clearWizDraft();
      return false;
    }
    if (Number(data.savedAt) && Date.now() - Number(data.savedAt) > WIZ_DRAFT_MAX_MS) {
      clearWizDraft();
      return false;
    }

    restoringDraft = true;
    try {
      if (Array.isArray(data.stayRooms) && data.stayRooms.length) {
        stayRooms = data.stayRooms.slice(0, MAX_ROOMS).map((room) => normalizeStayRoom(room));
      }
      occupancyConfirmed = Boolean(data.occupancyConfirmed) && childAgesComplete() && guestTotal() >= 1;
      if (checkInEl && data.checkIn) checkInEl.value = String(data.checkIn).slice(0, 10);
      if (checkOutEl && data.checkOut) checkOutEl.value = String(data.checkOut).slice(0, 10);
      applyDateLimits();
      if (data.pickMode === 'in' || data.pickMode === 'out') pickMode = data.pickMode;
      if (data.calMonth && Number(data.calMonth.y) && Number(data.calMonth.m)) {
        calMonth = { y: Number(data.calMonth.y), m: Number(data.calMonth.m) };
      }
      offerChoiceId = data.offerChoiceId == null ? null : Number(data.offerChoiceId) || null;
      forcedOfferByType.clear();
      Object.entries(data.forcedOffers || {}).forEach(([key, value]) => {
        const typeId = Number(key);
        const offerId = Number(value);
        if (typeId > 0 && offerId > 0) forcedOfferByType.set(typeId, offerId);
      });
      rebuildCartFromAssignments();
      const nextStep = Number(data.step) === 2 && occupancyConfirmed && nights() >= 1 ? 2 : 1;
      setStep(nextStep);
      paintStayRooms();
      paintNights();
      syncGuestNeed();
      syncContinue();
      paintCartChrome();
      return occupancyConfirmed || nights() >= 1;
    } finally {
      restoringDraft = false;
    }
  }

  window.addEventListener('pagehide', persistWizDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistWizDraft();
  });

  function refreshI18nUi() {
    paintStayRooms();
    paintNights();
    paintCartChrome();
    if (step === 2) paintRooms();
    setBookingFor(bookingFor);
    if (drawer && !drawer.hidden) {
      setDrawerStep(drawerStep);
      paintDrawer();
    }
    if (detail && !detail.hidden && detailCard) {
      const copy = detail.querySelector('[data-wiz-detail-copy]');
      if (copy) copy.innerHTML = formatDescription(detailCard.getAttribute('data-description'));
      renderAmenities(detailCard);
      renderGallery(detailCard, detail.querySelector('[data-wiz-bento]'));
      const bookBtn = detail.querySelector('[data-wiz-detail-book]');
      if (bookBtn) {
        const sold = Number(detailCard.getAttribute('data-available') || 0) < 1;
        const addable = !sold && canAssign(detailCard);
        bookBtn.textContent = sold ? t('wiz.soldOut') : addable ? t('wiz.addToBooking') : t('wiz.alreadySelected');
      }
    }
    if (offerSheet && !offerSheet.hidden && detailCard) {
      renderOfferReveal(detailCard);
    }
    if (dateSheet && !dateSheet.hidden) {
      const stayNights = nights();
      const title = dateSheet.querySelector('[data-wiz-date-title]');
      const copy = dateSheet.querySelector('[data-wiz-date-copy]');
      if (title) title.textContent = t('wiz.offerNeedsNights', { n: pendingMinNights });
      if (copy) copy.textContent = tn('wiz.stayCurrently', 'wiz.stayCurrentlyPlural', stayNights || 0);
      paintDateAdjustNights();
    }
    if (drawerStep === 'confirm' && lastConfirm) {
      paintConfirm(lastConfirm.payload, lastConfirm.bookerName, lastConfirm.bookerEmail);
    }
  }

  document.addEventListener('mori:langchange', () => {
    refreshI18nUi();
  });

  applyDateLimits();
  bindDetailAccordion();
  bindGallery();
  const restoredStay = restoreWizDraft();
  if (!restoredStay) {
    paintStayRooms();
    syncGuestNeed();
    setStep(1);
    paintNights();
  }
  if (String(location.hash || '').replace(/^#/, '').toLowerCase() === 'rooms' && occupancyConfirmed && nights() >= 1) {
    setStep(2);
  }
  loadOffers();
  syncConfirmReady();
  if (!occupancyConfirmed) maybeOpenGuestsOnArrive();
})();
